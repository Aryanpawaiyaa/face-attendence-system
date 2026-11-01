"""
Face Recognition Micro-service (Flask)  -  http://127.0.0.1:5002

Internal service consumed ONLY by the Node backend (protected with the
x-ml-secret header when ML_SHARED_SECRET is set).

Endpoints
  GET  /health                     liveness probe (no secret)
  GET  /status                     model + gallery + stream info
  POST /recognize                  {image, threshold?, multi?, liveness?}
  POST /quality                    {image} -> live enrolment guidance
  POST /enroll                     {faceId, name, studentId?, images[], replace?, force?}
  GET  /identities                 enrolled identities
  DELETE /identities/<faceId>      remove an identity
  POST /rebuild                    re-embed every stored enrolment image
  POST /reload                     reload gallery from disk
  POST /streams/start              {streamId, url, callbackUrl, label?, threshold?}
  POST /streams/stop               {streamId}
  GET  /streams                    worker status list
  GET  /streams/<id>/mjpeg         annotated live preview (multipart/x-mixed-replace)
  GET  /streams/<id>/snapshot      latest annotated JPEG
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import atexit  # noqa: E402
import base64  # noqa: E402
import logging  # noqa: E402
import os  # noqa: E402
import time  # noqa: E402
from typing import Dict, Optional  # noqa: E402

import cv2  # noqa: E402
import numpy as np  # noqa: E402
from flask import Flask, Response, jsonify, request  # noqa: E402

from src.config import (  # noqa: E402
    ENROLL_MIN_SAMPLES,
    FACE_MODEL,
    MATCH_MARGIN,
    MATCH_THRESHOLD,
    ML_HOST,
    ML_PORT,
    ML_SHARED_SECRET,
)
from src.face_engine import FaceEngine, gate_reason  # noqa: E402
from src.gallery import FaceGallery  # noqa: E402
from src.liveness import LivenessChecker  # noqa: E402
from src.stream_manager import StreamManager, crop_face, encode_jpeg  # noqa: E402

logging.basicConfig(level=logging.INFO, format="[ML] %(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("ml_service")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024 * 1024

log.info("Loading face model '%s' (first run downloads it to ~/.insightface)...", FACE_MODEL)
engine = FaceEngine()
gallery = FaceGallery(model_name=engine.model_name)
liveness_checker = LivenessChecker()
if gallery.stale_model:
    log.warning("Gallery was built with a different model. Call POST /rebuild to re-embed enrolment images.")
log.info("Gallery: %d identities", gallery.size)


# ------------------------------------------------------------------ helpers
def decode_image(data) -> Optional[np.ndarray]:
    try:
        if isinstance(data, str):
            if "base64," in data:
                data = data.split("base64,", 1)[1]
            raw = base64.b64decode(data)
        elif hasattr(data, "read"):
            raw = data.read()
        elif isinstance(data, (bytes, bytearray)):
            raw = bytes(data)
        else:
            return None
        return cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    except Exception as e:
        log.warning("decode error: %s", e)
        return None


def image_from_request() -> Optional[np.ndarray]:
    if request.files.get("file"):
        return decode_image(request.files["file"])
    if request.mimetype in ("image/jpeg", "image/png", "application/octet-stream"):
        return decode_image(request.get_data())
    body = request.get_json(silent=True) or {}
    img = body.get("image") or request.form.get("image")
    return decode_image(img) if img else None


ADAPTIVE_ENABLED = os.getenv("ADAPTIVE_TEMPLATES", "true").lower() == "true"
ADAPT_MIN_SCORE = float(os.getenv("ADAPT_MIN_SCORE", "0.60"))
ADAPT_MIN_MARGIN = float(os.getenv("ADAPT_MIN_MARGIN", "0.20"))
ADAPT_INTERVAL_S = float(os.getenv("ADAPT_INTERVAL_HOURS", "24")) * 3600


def maybe_adapt(m: Dict, emb: np.ndarray, q: Dict, lv: Dict) -> None:
    """
    Adaptive template: at most once per ADAPT_INTERVAL per student, add a
    live embedding when the match is unambiguous (high score AND a large gap
    to the runner-up) and the face is good quality. Keeps templates current
    as appearance changes; strict gates prevent template poisoning.
    """
    if not ADAPTIVE_ENABLED or not q["ok"] or (lv["checked"] and not lv["live"]):
        return
    if m["score"] < ADAPT_MIN_SCORE or (m["secondScore"] > -1 and m["score"] - m["secondScore"] < ADAPT_MIN_MARGIN):
        return
    meta = gallery.meta.get(m["faceId"]) or {}
    if time.time() - float(meta.get("lastAdaptiveAt", 0)) < ADAPT_INTERVAL_S:
        return
    gallery.add(m["faceId"], [emb], {}, source="adaptive")
    log.info("adaptive template update for %s (score %.3f)", m["faceId"], m["score"])


def analyze(frame: np.ndarray, threshold: float = MATCH_THRESHOLD, liveness_check: bool = True,
            multi: bool = True, liveness: Optional[bool] = None) -> Dict:
    if liveness is not None:
        liveness_check = liveness
    t0 = time.time()
    faces = engine.detect_frame(frame)
    if not multi and faces:
        faces = [engine._largest_face(faces)]
    labels, matrix = gallery.snapshot()
    out = []
    for f in faces:
        q = FaceEngine.assess_quality(frame, f)
        reject = gate_reason(q)
        if reject:
            # Tiny / very low-confidence / profile faces produce unreliable
            # embeddings and were the main source of false matches.
            m = {"matched": False, "faceId": None, "candidate": None, "score": -1.0, "secondScore": -1.0}
            emb = None
        else:
            emb = engine.normalized_embedding(f)
            m = FaceEngine.match_gallery(emb, labels, matrix, threshold=threshold, margin=MATCH_MARGIN)
        lv = liveness_checker.check(frame, f.bbox) if (liveness_check and not reject) else {"checked": False, "live": True, "score": None}
        meta = gallery.get(m["faceId"]) if m["matched"] else None
        if m["matched"] and lv["live"] and emb is not None:
            maybe_adapt(m, emb, q, lv)
        out.append({
            "bbox": [int(v) for v in f.bbox],
            "matched": m["matched"] and lv["live"],
            "faceId": m["faceId"] if lv["live"] else None,
            "candidate": m.get("candidate"),
            "name": meta.get("name") if meta else None,
            "studentId": meta.get("studentId") if meta else None,
            "confidence": m["score"],
            "confidencePct": round(max(m["score"], 0) * 100, 1),
            "secondScore": m["secondScore"],
            "quality": q,
            "rejectReason": reject,
            "liveness": lv,
            "spoofSuspected": lv["checked"] and not lv["live"],
        })
    out.sort(key=lambda r: (r["bbox"][2] - r["bbox"][0]) * (r["bbox"][3] - r["bbox"][1]), reverse=True)
    return {"faces": out, "processTimeMs": round((time.time() - t0) * 1000, 1),
            "frameSize": [int(frame.shape[1]), int(frame.shape[0])]}


streams = StreamManager(analyze)
atexit.register(streams.stop_all)


@app.before_request
def check_secret():
    if request.method == "OPTIONS" or request.path == "/health":
        return None
    if ML_SHARED_SECRET and request.headers.get("x-ml-secret") != ML_SHARED_SECRET:
        return jsonify({"success": False, "error": "Forbidden: invalid ML secret"}), 403
    return None


# ------------------------------------------------------------------ routes
@app.get("/health")
def health():
    return jsonify({"success": True, "status": "online"})


@app.get("/status")
def status():
    return jsonify({
        "success": True,
        "status": "online",
        "engine": f"InsightFace {engine.model_name} (SCRFD + ArcFace)",
        "model": engine.model_name,
        "providers": engine.providers,
        "matchThreshold": MATCH_THRESHOLD,
        "matchMargin": MATCH_MARGIN,
        "enrolledCount": gallery.size,
        "galleryNeedsRebuild": gallery.stale_model,
        "livenessEnabled": liveness_checker.enabled,
        "streams": streams.list(),
        "students": gallery.identities(),
        "timestamp": time.time(),
    })


@app.post("/recognize")
def recognize():
    body = request.get_json(silent=True) or {}
    frame = image_from_request()
    if frame is None:
        return jsonify({"success": False, "error": "No/invalid image"}), 400
    threshold = float(body.get("threshold") or MATCH_THRESHOLD)
    res = analyze(frame, threshold=threshold, liveness_check=bool(body.get("liveness", True)),
                  multi=bool(body.get("multi", True)))
    if body.get("returnCrops"):
        for f in res["faces"]:
            jpg = encode_jpeg(crop_face(frame, f["bbox"]), 85)
            f["crop"] = base64.b64encode(jpg).decode() if jpg else None
    top = res["faces"][0] if res["faces"] else None
    # Legacy top-level fields (largest face) for older clients
    legacy = {
        "detected": bool(top),
        "matched": bool(top and top["matched"]),
        "faceId": top and top["faceId"],
        "name": (top and top["name"]) or ("Unknown" if top else None),
        "confidence": top and top["confidence"],
        "confidencePct": top and top["confidencePct"],
        "bbox": top and top["bbox"],
    }
    return jsonify({"success": True, **legacy, **res, "totalFacesInFrame": len(res["faces"])})


@app.post("/quality")
def quality():
    frame = image_from_request()
    if frame is None:
        return jsonify({"success": False, "error": "No/invalid image"}), 400
    faces = engine.detect_frame(frame)
    if not faces:
        return jsonify({"success": True, "detected": False, "ok": False, "issues": ["no_face"]})
    face = engine._largest_face(faces)
    q = FaceEngine.assess_quality(frame, face, strict=True)
    if len(faces) > 1:
        q["issues"].append("multiple_faces")
        q["ok"] = False
    return jsonify({"success": True, "detected": True, "bbox": [int(v) for v in face.bbox], **q})


@app.post("/enroll")
def enroll():
    body = request.get_json(silent=True) or {}
    face_id = (body.get("faceId") or "").strip()
    images = body.get("images") or []
    if not face_id or not images:
        return jsonify({"success": False, "error": "faceId and images[] are required"}), 400
    force = bool(body.get("force"))
    replace = bool(body.get("replace"))

    labels, matrix = gallery.snapshot()
    others = labels != face_id
    accepted, results = [], []
    for i, img_b64 in enumerate(images):
        frame = decode_image(img_b64)
        if frame is None:
            results.append({"index": i, "accepted": False, "reason": "decode_failed"})
            continue
        faces = engine.detect_frame(frame)
        if not faces:
            results.append({"index": i, "accepted": False, "reason": "no_face"})
            continue
        faces = sorted(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]), reverse=True)
        face = faces[0]
        if len(faces) > 1:
            a0 = (faces[0].bbox[2] - faces[0].bbox[0]) * (faces[0].bbox[3] - faces[0].bbox[1])
            a1 = (faces[1].bbox[2] - faces[1].bbox[0]) * (faces[1].bbox[3] - faces[1].bbox[1])
            if a1 > 0.5 * a0:
                results.append({"index": i, "accepted": False, "reason": "multiple_faces"})
                continue
        q = FaceEngine.assess_quality(frame, face, strict=True)
        if not q["ok"] and not force:
            results.append({"index": i, "accepted": False, "reason": ",".join(q["issues"]), "quality": q})
            continue
        emb = engine.normalized_embedding(face)
        dup = None
        if others.any():
            m = FaceEngine.match_gallery(emb, labels[others], matrix[others],
                                         threshold=MATCH_THRESHOLD + 0.1, margin=0.0)
            if m["matched"]:
                dup = {"faceId": m["faceId"], "score": m["score"], "name": (gallery.get(m["faceId"]) or {}).get("name")}
        if dup and not force:
            results.append({"index": i, "accepted": False, "reason": "duplicate_identity", "duplicateOf": dup})
            continue
        accepted.append((emb, frame, face, q))
        results.append({"index": i, "accepted": True, "quality": q})

    # Self-consistency: discard samples that disagree with the rest (wrong person in a photo)
    if len(accepted) >= 3:
        cen = np.mean(np.stack([a[0] for a in accepted]), axis=0)
        cen /= np.linalg.norm(cen) or 1
        kept = [a for a in accepted if float(np.dot(a[0], cen)) >= 0.35]
        if len(kept) < len(accepted):
            log.info("enroll %s: dropped %d outlier sample(s)", face_id, len(accepted) - len(kept))
        accepted = kept

    if not accepted:
        return jsonify({"success": False, "error": "No usable face samples", "results": results}), 422

    if replace:
        gallery.remove(face_id, delete_images=True)
    for emb, frame, face, _ in accepted:
        gallery.store_image(face_id, encode_jpeg(crop_face(frame, face.bbox, pad=0.6), 92))
    total = gallery.add(face_id, [a[0] for a in accepted], {
        "name": body.get("name"),
        "studentId": body.get("studentId"),
        "rollNumber": body.get("rollNumber"),
        "model": engine.model_name,
    })
    avg_q = round(float(np.mean([a[3]["score"] for a in accepted])), 3)
    return jsonify({
        "success": True,
        "faceId": face_id,
        "accepted": len(accepted),
        "rejected": len(images) - len(accepted),
        "totalSamples": total,
        "averageQuality": avg_q,
        "enough": total >= ENROLL_MIN_SAMPLES,
        "results": results,
    })


@app.get("/identities")
def identities():
    return jsonify({"success": True, "items": gallery.identities()})


@app.delete("/identities/<face_id>")
def delete_identity(face_id):
    existed = gallery.remove(face_id, delete_images=True)
    return jsonify({"success": True, "removed": existed})


@app.post("/rebuild")
def rebuild():
    """Re-embeds every stored enrolment crop with the current model."""
    meta = dict(gallery.meta)
    folders = [p for p in gallery.enroll_dir.glob("*") if p.is_dir()] if gallery.enroll_dir.exists() else []
    # 1) compute everything first - the live gallery keeps serving meanwhile
    computed, report = {}, {}
    for folder in folders:
        fid = folder.name
        embs = []
        for img_path in sorted(folder.glob("*.jpg")):
            img = cv2.imread(str(img_path))
            if img is None:
                continue
            if min(img.shape[:2]) < 200:
                img = cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            face = engine._largest_face(engine.detect_frame(img, hires=False))
            if face is not None:
                embs.append(engine.normalized_embedding(face))
        computed[fid] = embs
        report[fid] = len(embs)
    # 2) swap in one step
    with gallery._lock:
        gallery.reset_for_rebuild()
        gallery.meta = {}
        for fid, embs in computed.items():
            if embs:
                gallery.add(fid, embs, {**meta.get(fid, {}), "model": engine.model_name}, persist=False)
        gallery.save()
    missing = [fid for fid in meta if not report.get(fid)]
    return jsonify({"success": True, "model": engine.model_name, "rebuilt": report,
                    "missingImages": missing})


@app.route("/reload", methods=["GET", "POST"])
def reload_gallery():
    gallery.load()
    return jsonify({"success": True, "enrolledCount": gallery.size, "needsRebuild": gallery.stale_model})


# ------------------------------------------------------------------ streams
@app.post("/streams/start")
def stream_start():
    body = request.get_json(silent=True) or {}
    sid, url = body.get("streamId"), str(body.get("url") or "").strip()
    if not sid or not url:
        return jsonify({"success": False, "error": "streamId and url are required"}), 400
    # OpenCV will happily open local files / devices / pipes - only allow
    # network camera URLs or a numeric webcam index.
    if not (url.isdigit() or url.lower().startswith(("rtsp://", "rtsps://", "http://", "https://"))):
        return jsonify({"success": False, "error": "url must be rtsp://, http(s):// or a webcam index"}), 400
    st = streams.start(sid, str(url), body.get("callbackUrl"), label=body.get("label", ""),
                       threshold=float(body.get("threshold") or MATCH_THRESHOLD),
                       require_motion=bool(body.get("requireMotion")) and not liveness_checker.enabled)
    return jsonify({"success": True, "stream": st})


@app.post("/streams/stop")
def stream_stop():
    body = request.get_json(silent=True) or {}
    return jsonify({"success": True, "stopped": streams.stop(body.get("streamId", ""))})


@app.get("/streams")
def stream_list():
    return jsonify({"success": True, "items": streams.list()})


@app.get("/streams/<sid>/snapshot")
def stream_snapshot(sid):
    w = streams.get(sid)
    if not w or not w.latest_jpeg():
        return jsonify({"success": False, "error": "No frame yet"}), 404
    return Response(w.latest_jpeg(), mimetype="image/jpeg")


@app.get("/streams/<sid>/mjpeg")
def stream_mjpeg(sid):
    w = streams.get(sid)
    if not w:
        return jsonify({"success": False, "error": "Stream not running"}), 404

    def gen():
        last = b""
        while streams.get(sid) is w:
            jpg = w.latest_jpeg()
            if jpg and jpg is not last:
                last = jpg
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpg + b"\r\n"
            time.sleep(0.08)

    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")


if __name__ == "__main__":
    log.info("Face Recognition service on http://%s:%d", ML_HOST, ML_PORT)
    try:
        from waitress import serve

        serve(app, host=ML_HOST, port=ML_PORT, threads=12)
    except ImportError:
        app.run(host=ML_HOST, port=ML_PORT, debug=False, threaded=True)
