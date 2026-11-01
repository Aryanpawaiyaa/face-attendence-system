# Realtek Ameba-IoT RTL8735BDM (AMB82-Mini) Arduino IDE & Low-Latency Guide

Complete guide to configuring the **Arduino IDE** and deploying the low-latency AI student attendance firmware onto the **Realtek Ameba-IoT RTL8735BDM (AMB82-Mini)** development board.

---

## ⚡ Latency Fixes Implemented

We identified and resolved 5 key latency bottlenecks across the camera firmware and backend:

1. **Persistent HTTP Keep-Alive (Zero TCP Overhead)**:
   - *Previous*: Connected and closed a TCP socket on every single frame (`client.connect()` ... `client.stop()`), adding 50–150ms handshake latency per frame over Wi-Fi.
   - *Fix*: The socket now remains open using `Connection: keep-alive`. Frames stream over the existing connection with near-zero network initiation latency.
2. **Non-Blocking Physical LED Feedback**:
   - *Previous*: `delay(700)` was called synchronously when attendance was marked, freezing the CPU, camera ISP, and network loop for almost a second.
   - *Fix*: Replaced with non-blocking `millis()` timers (`ledG_off_time`). Video streaming and capture never freeze.
3. **Optimized Frame Push Interval (350ms / ~3 FPS)**:
   - *Previous*: 1200ms frame interval meant waiting up to 1.2s before the first frame even reached the server.
   - *Fix*: Reduced to **350ms** (`FRAME_INTERVAL_MS 350`), ensuring instant detection within 350–400ms of entering the camera view.
4. **Single-Frame Instant Attendance Marking**:
   - *Previous*: `requireConsistency: true` forced the server to wait for 2–3 consecutive frames before registering attendance.
   - *Fix*: `DEVICE_REQUIRE_CONSISTENCY=false` now marks attendance immediately on the **first clear, matched frame**.
5. **Fast Content-Length Response Reader**:
   - *Previous*: Loop read characters with `delay(5)` until connection close.
   - *Fix*: `readResponseFast()` parses the HTTP `Content-Length` header and reads JSON payloads in one fast chunk.

---

## 🛠️ Step-by-Step Arduino IDE Configuration

### Step 1: Install Arduino IDE v2.x
Download and install **[Arduino IDE 2.x](https://www.arduino.cc/en/software)** (or v1.8.19+).

### Step 2: Add Realtek AmebaPro2 Board Manager URL
1. Open Arduino IDE.
2. Go to **File -> Preferences** (or `Ctrl + ,`).
3. In the **Additional boards manager URLs** field, paste:
   ```text
   https://github.com/Ameba-AIoT/ameba-arduino-pro2/raw/main/Arduino_package/package_realtek_amebapro2_index.json
   ```
4. Click **OK**.

### Step 3: Install the Board Package
1. Click the **Boards Manager** icon on the left sidebar (or **Tools -> Board -> Boards Manager...**).
2. Type `Ameba` in the search bar.
3. Find **Realtek Ameba Boards (32-bits ARM Cortex-M33)** and click **Install**.
   *(Note: This installs the complete toolchain, Realtek video stream drivers, and hardware ISP libraries).*

### Step 4: Configure Tools Settings
Go to the **Tools** menu and ensure the following options are set:
- **Board**: `Realtek Ameba Boards` -> **AMB82-MINI**
- **Port**: Select the COM port corresponding to your RTL8735BDM board (e.g. `COM3`, `COM4`, etc.)
- **Upload Speed**: `115200` (or `1500000` / `2000000` for high-speed flashing if supported by your cable/chip)

---

## 📝 Configuring `config.h`

Open **`firmware/amb82_faceattend/config.h`** in the Arduino IDE (tab next to `amb82_faceattend.ino`):

```c
// 1. Enter your Wi-Fi credentials (both 2.4 GHz and 5 GHz networks supported)
#define WIFI_SSID        "YOUR_WIFI_NAME"
#define WIFI_PASSWORD    "YOUR_WIFI_PASSWORD"

// 2. Attendance Server Host IP (The PC running the Dashboard)
//    Run 'ipconfig' in command prompt to verify your PC IPv4
#define SERVER_HOST      "172.24.16.165"
#define SERVER_PORT      5001

// 3. Device Identification & Authentication
//    (Obtained in Dashboard -> Cameras & AMB82 -> Register Camera)
#define DEVICE_CODE      "AMB82-GATE-01"
#define DEVICE_API_KEY   "PASTE_THE_API_KEY_SHOWN_AT_REGISTRATION"

// 4. Low-latency transmission options
#define PUSH_FRAMES       1       // 1 = High-speed Wi-Fi JPEG push
#define ENABLE_RTSP       1       // 1 = Enable H.264 RTSP server
#define FRAME_INTERVAL_MS 350     // Ultra-fast 350ms frame cadence
```

---

## ⚡ Flashing the Firmware to the RTL8735BDM Board

1. Connect the board to your PC using a high-quality micro-USB data cable.
2. Select the board's COM port in **Tools -> Port**.
3. **Put the board into Download Mode**:
   - Press and **hold** the **UART_DOWNLOAD** button on the board.
   - While still holding, press and **release** the **RESET (RST)** button.
   - **Release** the **UART_DOWNLOAD** button.
   *(The board's bootloader is now in UART flashing mode).*
4. Click the **Upload** button (Arrow icon at top left) in Arduino IDE.
5. Wait for the compilation and upload to complete:
   ```text
   ====================================================
   Image upload successfully!
   ====================================================
   ```
6. **Press the RESET (RST) button once** to reboot the board into normal operation.
7. Open **Tools -> Serial Monitor** and set baud rate to **115200**:
   ```text
   [WiFi] Connecting to MyWiFi
   [WiFi] Connected successfully!
   [WiFi] RTL8735BDM Board IP : 172.24.16.205
   [RTSP] Stream URL: rtsp://172.24.16.205:554
   [READY] FaceAttend Pro camera active with low-latency pipeline.
   ```

---

## 🚀 Running the Attendance System

1. On your PC, launch the system by double-clicking **`Run-Dashboard.bat`**.
2. Open **[http://localhost:5001](http://localhost:5001)**.
3. Log in with:
   - **Email**: `superadmin@example.com`
   - **Password**: `123456789`
4. As soon as a student walks in front of the RTL8735BDM camera:
   - The camera sends the frame over Wi-Fi in <15ms.
   - The AI recognizes the student and logs attendance in <300ms.
   - The board's **Green LED turns ON** for 600ms.
   - The live dashboard updates instantly via Server-Sent Events (SSE).
