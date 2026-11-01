"""
Camera stream workers (AMB82 Mini RTSP / HTTP-MJPEG, IP cameras, USB webcams).

Each worker:
  * keeps the newest frame from the camera (a grabber thread drains the buffer
    so recognition never lags behind real time)
  * runs detection + recognition every STREAM_PROCESS_INTERVAL seconds
  * requires N consistent hits before reporting a match (anti-flicker)
  * applies a per-identity cooldown
  * POSTs events to the Node backend callback (x-ml-secret protected)
  * exposes the latest annotated JPEG for live MJPEG preview
"""
from __future__ import annotations

import base64
import logging
import os
import threading
import time
from typing import Callable, Dict, List, Optional

import cv2
import numpy as np
import requests

from src.config import (
    ATTENDANCE_COOLDOWN_SECONDS,
    MATCH_THRESHOLD,
    ML_SHARED_SECRET,
    REQUIRED_STABLE_FRAMES,
    STREAM_PROCESS_INTERVAL,
    STREAM_UNKNOWN_COOLDOWN,
)

# Prefer TCP for RTSP - far fewer corrupted frames over Wi-Fi than UDP.
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp|stimeout;5000000")

log = logging.getLogger("streams")


def encode_jpeg(img: np.ndarray, quality: int = 80) -> bytes:
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    return buf.tobytes() if ok else b""


def crop_face(frame: np.ndarray, bbox, pad: float = 0.25) -> np.ndarray:
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    px, py = int((x2 - x1) * pad), int((y2 - y1) * pad)
    return frame[max(0, y1 - py):min(h, y2 + py), max(0, x1 - px):min(w, x2 + px)]


class ConsistencyTracker:
    """Accept an identity only after `required` hits inside `window` seconds."""

    def __init__(self, required: int = REQUIRED_STABLE_FRAMES, window: float = 4.0,
                 cooldown: float = ATTENDANCE_COOLDOWN_SECONDS, min_motion: float = 0.0):
        self.required, self.window, self.cooldown = required, window, cooldown
        self.min_motion = min_motion  # >0 enables the head-movement liveness check
        self.hits: Dict[str, List[tuple]] = {}
        self.last_fired: Dict[str, float] = {}

    def observe(self, key: str, now: Optional[float] = None, yaw: Optional[float] = None,
                skip_motion: bool = False) -> bool:
        now = now or time.time()
        arr = [h for h in self.hits.get(key, []) if now - h[0] <= self.window]
        arr.append((now, yaw))
        self.hits[key] = arr
        # prune idle identities so the dict cannot grow without bound
        if len(self.hits) > 500:
            self.hits = {k: v for k, v in self.hits.items() if v and now - v[-1][0] <= self.window}
            self.last_fired = {k: t for k, t in self.last_fired.items() if now - t <= self.cooldown}
        if len(arr) < self.required or now - self.last_fired.get(key, 0) < self.cooldown:
            return False
        if self.min_motion > 0 and not skip_motion:
            yaws = [y for _, y in arr if y is not None]
            if len(yaws) < 2 or max(yaws) - min(yaws) < self.min_motion:
                return False  # rigid face (photo/screen?) - keep waiting for movement
        self.last_fired[key] = now
        self.hits[key] = []
        return True

    def progress(self, key: str) -> int:
        return len(self.hits.get(key, []))


class StreamWorker:
    def __init__(self, stream_id: str, url: str, analyze: Callable, callback_url: Optional[str],
                 label: str = "", threshold: float = MATCH_THRESHOLD, interval: float = STREAM_PROCESS_INTERVAL,
                 require_motion: bool = False):
        self.stream_id, self.url, self.label = stream_id, url, label
        self.analyze, self.callback_url = analyze, callback_url
        self.threshold, self.interval = threshold, interval
        # window widened when motion is required so people have time to move
        self.tracker = ConsistencyTracker(window=8.0, min_motion=0.04) if require_motion else ConsistencyTracker()
        self.unknown_tracker = ConsistencyTracker(required=4, window=5.0, cooldown=STREAM_UNKNOWN_COOLDOWN)
        self._stop = threading.Event()
        self._frame_lock = threading.Lock()
        self._latest: Optional[np.ndarray] = None
        self._annotated: bytes = b""
        self.status = {
            "streamId": stream_id, "url": self._mask(url), "label": label, "connected": False,
            "startedAt": time.time(), "framesRead": 0, "framesAnalyzed": 0, "matches": 0,
            "unknowns": 0, "lastError": None, "fps": 0.0, "lastFrameAt": None,
        }
        self._threads = [
            threading.Thread(target=self._grab_loop, daemon=True, name=f"grab-{stream_id}"),
            threading.Thread(target=self._analyze_loop, daemon=True, name=f"analyze-{stream_id}"),
        ]

    @staticmethod
    def _mask(url: str) -> str:
        # hide credentials in rtsp://user:pass@host
        if "@" in url and "://" in url:
            scheme, rest = url.split("://", 1)
            return f"{scheme}://***@{rest.split('@', 1)[1]}"
        return url

    def _source(self):
        return int(self.url) if self.url.isdigit() else self.url

    # ------------------------------------------------------------ threads
    def start(self):
        for t in self._threads:
            t.start()

    def stop(self):
        self._stop.set()

    def _grab_loop(self):
        backoff = 1.0
        while not self._stop.is_set():
            cap = cv2.VideoCapture(self._source(), cv2.CAP_FFMPEG) if not self.url.isdigit() \
                else cv2.VideoCapture(int(self.url))
            if not cap.isOpened():
                self.status.update(connected=False, lastError=f"Cannot open stream (retry in {backoff:.0f}s)")
                time.sleep(backoff)
                backoff = min(backoff * 2, 30)
                continue
            backoff = 1.0
            self.status.update(connected=True, lastError=None)
            t0, n = time.time(), 0
            while not self._stop.is_set():
                ok, frame = cap.read()
                if not ok or frame is None:
                    self.status.update(connected=False, lastError="Frame read failed - reconnecting")
                    break
                with self._frame_lock:
                    self._latest = frame
                n += 1
                self.status["framesRead"] += 1
                self.status["lastFrameAt"] = time.time()
                if time.time() - t0 >= 2:
                    self.status["fps"] = round(n / (time.time() - t0), 1)
                    t0, n = time.time(), 0
            cap.release()
        self.status["connected"] = False

    def _analyze_loop(self):
        while not self._stop.is_set():
            time.sleep(self.interval)
            with self._frame_lock:
                frame = None if self._latest is None else self._latest.copy()
            if frame is None:
                continue
            try:
                result = self.analyze(frame, threshold=self.threshold, liveness=True)
            except Exception as e:  # pragma: no cover
                self.status["lastError"] = f"analyze: {e}"
                continue
            self.status["framesAnalyzed"] += 1
            events = []
            for face in result["faces"]:
                fid = face.get("faceId")
                live_ok = face.get("liveness", {}).get("live", True)
                if face["matched"] and fid and live_ok:
                    face["progress"] = self.tracker.progress(fid) + 1
                    # an anti-spoof model verdict replaces the motion check
                    model_checked = bool(face.get("liveness", {}).get("checked"))
                    yaw = face["quality"]["metrics"].get("yawSigned")
                    if self.tracker.observe(fid, yaw=yaw, skip_motion=model_checked):
                        events.append(self._event("MATCH", frame, face))
                elif not face["matched"] and face.get("quality", {}).get("ok"):
                    if self.unknown_tracker.observe("unknown"):
                        events.append(self._event("UNKNOWN", frame, face))
            self._draw(frame, result["faces"])
            if events:
                self._post(events)

    # ------------------------------------------------------------ helpers
    def _event(self, kind: str, frame, face) -> Dict:
        if kind == "MATCH":
            self.status["matches"] += 1
        else:
            self.status["unknowns"] += 1
        snap = encode_jpeg(crop_face(frame, face["bbox"]), 85)
        return {
            "type": kind,
            "faceId": face.get("faceId"),
            "candidate": face.get("candidate"),
            "confidence": face.get("confidence"),
            "quality": face.get("quality", {}).get("score"),
            "liveness": face.get("liveness"),
            "snapshot": base64.b64encode(snap).decode() if snap else None,
            "timestamp": time.time(),
        }

    def _post(self, events: List[Dict]):
        if not self.callback_url:
            return
        try:
            requests.post(
                self.callback_url,
                json={"streamId": self.stream_id, "events": events},
                headers={"x-ml-secret": ML_SHARED_SECRET},
                timeout=5,
            )
        except requests.RequestException as e:
            self.status["lastError"] = f"callback failed: {e}"

    def _draw(self, frame, faces):
        for f in faces:
            x1, y1, x2, y2 = [int(v) for v in f["bbox"]]
            color = (80, 220, 120) if f["matched"] else (60, 60, 235)
            label = f.get("name") or ("Unknown" if not f["matched"] else f.get("faceId"))
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, f"{label} {f.get('confidence', 0):.2f}", (x1, max(20, y1 - 8)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        cv2.putText(frame, f"{self.label or self.stream_id}  {time.strftime('%H:%M:%S')}", (12, 26),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
        h, w = frame.shape[:2]
        if w > 960:
            frame = cv2.resize(frame, (960, int(h * 960 / w)))
        self._annotated = encode_jpeg(frame, 70)

    def latest_jpeg(self) -> bytes:
        return self._annotated


class StreamManager:
    def __init__(self, analyze: Callable):
        self.analyze = analyze
        self.workers: Dict[str, StreamWorker] = {}
        self._lock = threading.Lock()

    def start(self, stream_id: str, url: str, callback_url: Optional[str], label: str = "",
              threshold: float = MATCH_THRESHOLD, require_motion: bool = False) -> Dict:
        with self._lock:
            if stream_id in self.workers:
                self.workers[stream_id].stop()
            w = StreamWorker(stream_id, url, self.analyze, callback_url, label=label, threshold=threshold,
                             require_motion=require_motion)
            self.workers[stream_id] = w
            w.start()
            return w.status

    def stop(self, stream_id: str) -> bool:
        with self._lock:
            w = self.workers.pop(stream_id, None)
        if w:
            w.stop()
        return w is not None

    def get(self, stream_id: str) -> Optional[StreamWorker]:
        return self.workers.get(stream_id)

    def list(self) -> List[Dict]:
        return [w.status for w in self.workers.values()]

    def stop_all(self):
        for sid in list(self.workers):
            self.stop(sid)
