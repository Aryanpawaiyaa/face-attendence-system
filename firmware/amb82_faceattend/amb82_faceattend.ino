/*
 * ============================================================================
 *  FaceAttend Pro - Realtek Ameba-IoT RTL8735BDM (AMB82-Mini) Firmware
 * ============================================================================
 *  Target Board   : Realtek Ameba Boards -> AMB82-MINI  (Arduino IDE)
 *  Architecture   : Armv8-M (Real-M500 @ 500 MHz) + Hardware ISP
 *  Connectivity   : Dual-Band Wi-Fi 4 (2.4 GHz / 5 GHz)
 *
 *  LOW-LATENCY OPTIMIZATIONS INCLUDED:
 *  - Persistent TCP Keep-Alive: Zero TCP handshake latency on repeated frames
 *  - Non-blocking LED feedback: Eliminates camera freeze during attendance mark
 *  - Rapid frame upload: Configurable 300-400ms interval for near-instant mark
 *  - Direct Content-Length response parsing: No synchronous wait loops
 * ============================================================================
 */
#include <WiFi.h>
#include "VideoStream.h"
#include "config.h"

#ifndef ENABLE_RTSP
#define ENABLE_RTSP 0
#endif
#ifndef PUSH_FRAMES
#define PUSH_FRAMES 1
#endif
#ifndef FRAME_INTERVAL_MS
#define FRAME_INTERVAL_MS 350
#endif

#if ENABLE_RTSP
#include "StreamIO.h"
#include "RTSP.h"
#define RTSP_CHANNEL 0
VideoSetting rtspConfig(VIDEO_FHD, 30, VIDEO_H264, 0);
RTSP rtsp;
StreamIO videoStreamer(1, 1);
#endif

#define JPEG_CHANNEL 1
// VGA (640x480) provides optimal facial detail while maintaining ultra-low Wi-Fi transmission latency (~35-50KB per frame)
VideoSetting jpegConfig(VIDEO_VGA, 15, VIDEO_JPEG, 1);

#define FIRMWARE_VERSION "faceattend-2.1.0-lowlatency"

#ifndef LED_G
#define LED_G LED_BUILTIN
#endif
#ifndef LED_B
#define LED_B LED_BUILTIN
#endif

WiFiClient client;
uint32_t img_addr = 0;
uint32_t img_len = 0;
unsigned long lastFrame = 0;
unsigned long lastHeartbeat = 0;
int consecutiveFailures = 0;

// Non-blocking LED timers
unsigned long ledG_off_time = 0;
unsigned long ledB_off_time = 0;

// ---------------------------------------------------------------- helpers
String ipToString(IPAddress ip) {
  return String(ip[0]) + "." + String(ip[1]) + "." + String(ip[2]) + "." + String(ip[3]);
}

void connectWiFi() {
  int status = WL_IDLE_STATUS;
  Serial.print("[WiFi] Connecting to ");
  Serial.println(WIFI_SSID);

  while (status != WL_CONNECTED) {
    status = WiFi.begin((char *)WIFI_SSID, (char *)WIFI_PASSWORD);
    delay(2500);
  }

  Serial.println("[WiFi] Connected successfully!");
  Serial.print("[WiFi] RTL8735BDM Board IP : ");
  Serial.println(WiFi.localIP());
  Serial.print("[WiFi] Signal Strength (RSSI): ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");

#if ENABLE_RTSP
  Serial.print("[RTSP] Stream URL: rtsp://");
  Serial.print(WiFi.localIP());
  Serial.println(":554");
#endif
}

// Low-latency response reader using Content-Length
int readResponseFast(String &body, unsigned long timeoutMs) {
  unsigned long start = millis();
  while (!client.available() && millis() - start < timeoutMs) {
    delayMicroseconds(200);
  }
  if (!client.available()) return -1;

  // Read HTTP status line (HTTP/1.1 200 OK)
  String statusLine = client.readStringUntil('\n');
  int code = statusLine.substring(9, 12).toInt();

  // Parse headers
  int contentLength = 0;
  while (client.connected() || client.available()) {
    String header = client.readStringUntil('\n');
    header.trim();
    if (header.length() == 0) break; // End of HTTP headers
    if (header.startsWith("Content-Length:") || header.startsWith("content-length:")) {
      contentLength = header.substring(15).toInt();
    }
  }

  // Fast body read
  if (contentLength > 0 && contentLength < 1024) {
    char b[1024];
    size_t bytesRead = client.readBytes(b, contentLength);
    b[bytesRead] = '\0';
    body = String(b);
  } else {
    unsigned long bStart = millis();
    while ((client.connected() || client.available()) && millis() - bStart < 350) {
      while (client.available()) {
        body += (char)client.read();
        if (body.length() > 512) break;
      }
      if (body.length() > 0) break;
    }
  }
  return code;
}

void sendHeartbeat() {
  WiFiClient hbClient;
  if (!hbClient.connect(SERVER_HOST, SERVER_PORT)) {
    Serial.println("[HB] Server unreachable");
    return;
  }
  String json = String("{\"firmwareVersion\":\"") + FIRMWARE_VERSION + "\",\"ip\":\"" + ipToString(WiFi.localIP()) + "\"}";
  hbClient.print("POST /api/devices/heartbeat HTTP/1.1\r\n");
  hbClient.print("Host: "); hbClient.print(SERVER_HOST); hbClient.print(":"); hbClient.println(SERVER_PORT);
  hbClient.print("x-device-code: "); hbClient.println(DEVICE_CODE);
  hbClient.print("x-device-api-key: "); hbClient.println(DEVICE_API_KEY);
  hbClient.print("Content-Type: application/json\r\n");
  hbClient.print("Content-Length: "); hbClient.println(json.length());
  hbClient.print("Connection: close\r\n\r\n");
  hbClient.print(json);
  hbClient.stop();
  Serial.println("[HB] Heartbeat synced");
}

void sendFrame() {
  Camera.getImage(JPEG_CHANNEL, &img_addr, &img_len);
  if (img_len == 0 || img_addr == 0) {
    return;
  }

  // Re-establish connection only if disconnected (HTTP Keep-Alive eliminates TCP handshake latency)
  if (!client.connected()) {
    if (!client.connect(SERVER_HOST, SERVER_PORT)) {
      consecutiveFailures++;
      Serial.println("[Wi-Fi] Reconnecting to server...");
      return;
    }
  }

  // Send HTTP POST headers
  client.print("POST /api/devices/frame HTTP/1.1\r\n");
  client.print("Host: "); client.print(SERVER_HOST); client.print(":"); client.println(SERVER_PORT);
  client.print("x-device-code: "); client.println(DEVICE_CODE);
  client.print("x-device-api-key: "); client.println(DEVICE_API_KEY);
  client.print("x-firmware-version: "); client.println(FIRMWARE_VERSION);
  client.print("Content-Type: image/jpeg\r\n");
  client.print("Content-Length: "); client.println(img_len);
  client.print("Connection: keep-alive\r\n\r\n");

  // Stream raw JPEG payload straight from hardware camera buffer in 8 KB chunks
  uint8_t *buf = (uint8_t *)img_addr;
  uint32_t sent = 0;
  while (sent < img_len) {
    uint32_t chunk = (img_len - sent) > 8192 ? 8192 : (img_len - sent);
    size_t w = client.write(buf + sent, chunk);
    if (w == 0) break;
    sent += w;
  }

  String body = "";
  int code = readResponseFast(body, 2000);

  if (code == 200) {
    consecutiveFailures = 0;
    if (body.indexOf("\"led\":\"GREEN\"") >= 0) {
      Serial.println("[ATTENDANCE] Marked: " + body);
      // Non-blocking physical Green LED feedback (no delay!)
      digitalWrite(LED_G, HIGH);
      ledG_off_time = millis() + 600;
    } else if (body.indexOf("\"led\":\"RED\"") >= 0) {
      digitalWrite(LED_B, HIGH);
      ledB_off_time = millis() + 200;
    }
  } else if (code < 0) {
    // Timeout or broken pipe - reset socket
    client.stop();
  } else {
    consecutiveFailures++;
    Serial.print("[POST] HTTP ");
    Serial.print(code);
    Serial.print(" ");
    Serial.println(body);
    if (code == 401 || code == 403) {
      Serial.println("[AUTH] Invalid DEVICE_CODE or DEVICE_API_KEY in config.h");
    }
    client.stop();
  }
}

// ---------------------------------------------------------------- Arduino Setup & Loop
void setup() {
  Serial.begin(115200);
  pinMode(LED_G, OUTPUT);
  pinMode(LED_B, OUTPUT);

  // Quick power-on indicator
  digitalWrite(LED_B, HIGH);
  delay(150);
  digitalWrite(LED_B, LOW);

  connectWiFi();

#if ENABLE_RTSP
  Camera.configVideoChannel(RTSP_CHANNEL, rtspConfig);
#endif
  Camera.configVideoChannel(JPEG_CHANNEL, jpegConfig);
  Camera.videoInit();

#if ENABLE_RTSP
  rtsp.configVideo(rtspConfig);
  rtsp.begin();
  videoStreamer.registerInput(Camera.getStream(RTSP_CHANNEL));
  videoStreamer.registerOutput(rtsp);
  if (videoStreamer.begin() != 0) {
    Serial.println("[RTSP] StreamIO link start failed");
  }
  Camera.channelBegin(RTSP_CHANNEL);
#endif

  Camera.channelBegin(JPEG_CHANNEL);
  delay(1000); // Allow camera auto-white-balance and exposure to settle

  sendHeartbeat();
  lastHeartbeat = millis();
  Serial.println("[READY] FaceAttend Pro camera active with low-latency pipeline.");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  unsigned long now = millis();

  // Non-blocking LED timer updates (prevents camera freeze)
  if (ledG_off_time > 0 && now >= ledG_off_time) {
    digitalWrite(LED_G, LOW);
    ledG_off_time = 0;
  }
  if (ledB_off_time > 0 && now >= ledB_off_time) {
    digitalWrite(LED_B, LOW);
    ledB_off_time = 0;
  }

  // Periodic heartbeat
  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    sendHeartbeat();
    lastHeartbeat = now;
  }

#if PUSH_FRAMES
  if (now - lastFrame >= FRAME_INTERVAL_MS) {
    lastFrame = now;
    sendFrame();
  }
#endif

  if (consecutiveFailures > 5) {
    delay(2000);
    consecutiveFailures = 0;
  }

  delay(2);
}
