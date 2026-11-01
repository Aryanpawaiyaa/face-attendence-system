"""
Standalone desktop recogniser (Mode A: laptop webcam acting as a device).

It uses the same gallery as the ML service and submits to the backend with
device credentials (x-device-code / x-device-api-key) - exactly like an
AMB82 Mini would. Press Q to quit.

    python run_attendance.py                 # webcam index from CAMERA_INDEX
    python run_attendance.py --source rtsp://192.168.1.50:554   # AMB82 RTSP
"""
import argparse
import time
from datetime import datetime, timezone

import cv2

from src.backend_client import BackendAttendanceClient
from src.config import CAMERA_INDEX, COURSE_ID, MATCH_MARGIN, MATCH_THRESHOLD, MIN_FACE_SIZE, validate_config
from src.face_engine import FaceEngine
from src.gallery import FaceGallery
from src.stream_manager import ConsistencyTracker


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default=str(CAMERA_INDEX), help="camera index, RTSP or HTTP-MJPEG URL")
    args = ap.parse_args()

    ok, issues = validate_config(require_device_key=True)
    for i in issues:
        print("[WARN]", i)

    engine = FaceEngine()
    gallery = FaceGallery(model_name=engine.model_name)
    if gallery.stale_model or gallery.size == 0:
        print("[WARN] Gallery empty or built with another model - enrol faces from the web UI first.")
    client = BackendAttendanceClient()
    health = client.check_health()
    print("Backend:", "ONLINE" if health["online"] else "OFFLINE", client.base_url)
    if health["online"]:
        print("Device verify:", client.verify_device().get("status"))

    src = int(args.source) if args.source.isdigit() else args.source
    cam = cv2.VideoCapture(src)
    if not cam.isOpened():
        raise SystemExit(f"Could not open video source {args.source}")

    tracker = ConsistencyTracker()
    banners = {}
    last_hb = 0.0
    while True:
        ok, frame = cam.read()
        if not ok:
            time.sleep(0.05)
            continue
        now = time.time()
        if now - last_hb > 60:
            client.send_heartbeat()
            last_hb = now
        labels, matrix = gallery.snapshot()
        for face in engine.detect_frame(frame):
            x1, y1, x2, y2 = map(int, face.bbox)
            if min(x2 - x1, y2 - y1) < MIN_FACE_SIZE:
                continue
            m = FaceEngine.match_gallery(engine.normalized_embedding(face), labels, matrix,
                                         MATCH_THRESHOLD, MATCH_MARGIN)
            color, text = (60, 60, 235), f"Unknown {m['score']:.2f}"
            if m["matched"]:
                fid = m["faceId"]
                name = (gallery.get(fid) or {}).get("name", fid)
                color, text = (0, 220, 255), f"{name} verifying {tracker.progress(fid) + 1}"
                if tracker.observe(fid, now):
                    res = client.submit_attendance(fid, m["score"], datetime.now(timezone.utc).isoformat(), COURSE_ID)
                    banners[fid] = (f"{res.get('studentName', name)} [{res.get('status')}]", now)
                    print("[EVENT]", fid, res.get("status"), res.get("message"))
                if fid in banners and now - banners[fid][1] < 5:
                    color, text = (80, 220, 120), banners[fid][0]
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, text, (x1, max(24, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        cv2.putText(frame, f"{client.device_code} | {engine.model_name} | Q quit", (12, 26),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.imshow("FaceAttend Desktop Recogniser", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    cam.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
