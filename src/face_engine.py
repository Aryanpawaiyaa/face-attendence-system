"""
High-accuracy face engine built on InsightFace.

Default model pack: buffalo_l
  * Detector:   SCRFD-10GF
  * Recogniser: ArcFace ResNet50 trained on WebFace600K (512-d embeddings)
Optional:       antelopev2 (ArcFace ResNet100 @ Glint360K)

Adds on top of the raw model:
  * automatic GPU (CUDA / DirectML / CoreML) -> CPU provider fallback
  * per-face quality assessment (detector score, size, blur, brightness, yaw)
  * multi-sample gallery matching with a best-vs-second-best margin check
"""
from __future__ import annotations

import logging
import os
import shutil
import threading
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from src.config import (
    DET_SIZE,
    DET_THRESH,
    FACE_MODEL,
    MATCH_MARGIN,
    MATCH_THRESHOLD,
    MIN_FACE_SIZE,
    MODELS_ROOT,
    QUALITY_MAX_YAW,
    QUALITY_MIN_BLUR,
    QUALITY_MIN_DET_SCORE,
    USE_GPU,
)

log = logging.getLogger("face_engine")

# Browser camera + kiosk + N RTSP workers + enrolment can all hit the model at
# once. Unbounded parallel ONNX runs on a CPU oversubscribe the cores and make
# *every* request slow (timeouts upstream). A small semaphore keeps latency flat.
_INFER_SLOTS = threading.BoundedSemaphore(max(1, int(os.getenv("ML_MAX_CONCURRENCY", "2"))))
HIRES_SIDE = 1400  # frames larger than this get a high-resolution detection pass


def _pick_providers() -> Tuple[List[str], int]:
    """Returns (onnxruntime providers, ctx_id). ctx_id -1 = CPU."""
    try:
        import onnxruntime as ort

        available = ort.get_available_providers()
    except Exception:  # pragma: no cover
        available = ["CPUExecutionProvider"]
    if USE_GPU:
        for gpu in ("CUDAExecutionProvider", "DmlExecutionProvider", "CoreMLExecutionProvider"):
            if gpu in available:
                return [gpu, "CPUExecutionProvider"], 0
    return ["CPUExecutionProvider"], -1


def _fix_nested_model_dir(model_name: str) -> None:
    """antelopev2.zip extracts to models/antelopev2/antelopev2/*.onnx; flatten it."""
    base = MODELS_ROOT / "models" / model_name
    nested = base / model_name
    if nested.is_dir():
        for f in nested.glob("*.onnx"):
            target = base / f.name
            if not target.exists():
                shutil.move(str(f), str(target))
        shutil.rmtree(nested, ignore_errors=True)


class FaceEngine:
    def __init__(self, model_name: str = FACE_MODEL, det_size: int = DET_SIZE):
        from insightface.app import FaceAnalysis

        providers, ctx_id = _pick_providers()
        self.model_name = model_name
        self.providers = providers
        kwargs = dict(name=model_name, root=str(MODELS_ROOT), providers=providers,
                      allowed_modules=["detection", "recognition"])
        try:
            self.app = FaceAnalysis(**kwargs)
        except AssertionError:
            _fix_nested_model_dir(model_name)
            self.app = FaceAnalysis(**kwargs)
        self.app.prepare(ctx_id=ctx_id, det_size=(det_size, det_size), det_thresh=DET_THRESH)
        log.info("FaceEngine ready: model=%s providers=%s", model_name, providers)

    # ------------------------------------------------------------ detection
    @staticmethod
    def _largest_face(faces):
        if not faces:
            return None
        return max(faces, key=lambda f: max(0.0, f.bbox[2] - f.bbox[0]) * max(0.0, f.bbox[3] - f.bbox[1]))

    @staticmethod
    def enhance_low_light(frame: np.ndarray) -> np.ndarray:
        """CLAHE on luminance for dark classrooms / backlit doors (no-op when bright)."""
        ycrcb = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
        y = ycrcb[:, :, 0]
        if float(y.mean()) >= 70:
            return frame
        ycrcb[:, :, 0] = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(y)
        return cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2BGR)

    def _get_hires(self, frame: np.ndarray):
        """
        Detection at 1280x1280 instead of 640x640. Group photos contain many
        small faces that the default input size simply downsamples away.
        Mirrors FaceAnalysis.get(): detect, then run every other model.
        """
        from insightface.app.common import Face

        det = self.app.det_model
        bboxes, kpss = det.detect(frame, input_size=(1280, 1280), max_num=0, metric="default")
        faces = []
        for i in range(bboxes.shape[0]):
            face = Face(bbox=bboxes[i, 0:4], kps=None if kpss is None else kpss[i], det_score=bboxes[i, 4])
            for task, model in self.app.models.items():
                if task != "detection":
                    model.get(frame, face)
            faces.append(face)
        return faces

    def detect_frame(self, frame, hires: bool = None):
        if frame is None or getattr(frame, "size", 0) == 0:
            return []
        frame = self.enhance_low_light(frame)
        if hires is None:
            hires = max(frame.shape[:2]) > HIRES_SIDE
        with _INFER_SLOTS:
            if hires:
                try:
                    return self._get_hires(frame)
                except Exception as e:  # model without dynamic input -> fall back
                    log.warning("hi-res detection unavailable (%s); using default size", e)
            return self.app.get(frame)

    def embedding_from_image(self, image_path: Path) -> Optional[np.ndarray]:
        image = cv2.imread(str(image_path))
        if image is None:
            return None
        face = self._largest_face(self.detect_frame(image))
        if face is None or face.embedding is None:
            return None
        return self.normalized_embedding(face)

    @staticmethod
    def normalized_embedding(face) -> np.ndarray:
        if face is None or getattr(face, "embedding", None) is None:
            return np.zeros((512,), dtype=np.float32)
        emb = np.asarray(face.embedding, dtype=np.float32)
        norm = np.linalg.norm(emb)
        return emb / norm if norm else emb

    # ------------------------------------------------------------ quality
    @staticmethod
    def assess_quality(frame: np.ndarray, face, strict: bool = False) -> Dict:
        """
        Cheap, model-free quality signals. strict=True is used for enrolment.
        Returns {score: 0..1, ok: bool, issues: [str], metrics: {...}}
        """
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = [int(v) for v in face.bbox]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        fw, fh = max(1, x2 - x1), max(1, y2 - y1)
        crop = frame[y1:y2, x1:x2]
        issues: List[str] = []

        det_score = float(getattr(face, "det_score", 1.0))
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.size else np.zeros((1, 1), np.uint8)
        # Normalise blur by face size so small faces are not over-penalised
        blur = float(cv2.Laplacian(cv2.resize(gray, (112, 112)), cv2.CV_64F).var()) if crop.size else 0.0
        brightness = float(gray.mean()) if crop.size else 0.0

        yaw_signed = 0.0
        kps = getattr(face, "kps", None)
        if kps is not None and len(kps) >= 3:
            le, re, nose = kps[0], kps[1], kps[2]
            eye_dx = float(re[0] - le[0])
            if abs(eye_dx) > 1e-3:
                # 0 = frontal; sign tells left/right (used by the head-turn liveness check)
                yaw_signed = (float(nose[0]) - float(le[0])) / eye_dx - 0.5
        yaw = abs(yaw_signed)

        min_size = MIN_FACE_SIZE * (1.4 if strict else 1.0)
        if det_score < QUALITY_MIN_DET_SCORE:
            issues.append("low_detection_confidence")
        if min(fw, fh) < min_size:
            issues.append("face_too_small")
        if blur < QUALITY_MIN_BLUR * (1.3 if strict else 1.0):
            issues.append("blurry")
        if brightness < 45:
            issues.append("too_dark")
        elif brightness > 215:
            issues.append("overexposed")
        if yaw > QUALITY_MAX_YAW * (0.8 if strict else 1.0):
            issues.append("turn_face_to_camera")

        score = (
            0.30 * min(det_score / 0.9, 1.0)
            + 0.25 * min(min(fw, fh) / (min_size * 2.0), 1.0)
            + 0.25 * min(blur / (QUALITY_MIN_BLUR * 3.0), 1.0)
            + 0.20 * max(0.0, 1.0 - yaw / 0.5)
        )
        return {
            "score": round(float(score), 3),
            "ok": not issues,
            "issues": issues,
            "metrics": {
                "detScore": round(det_score, 3),
                "faceSize": int(min(fw, fh)),
                "blur": round(blur, 1),
                "brightness": round(brightness, 1),
                "yaw": round(yaw, 3),
                "yawSigned": round(yaw_signed, 3),
            },
        }

    # ------------------------------------------------------------ matching
    @staticmethod
    def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
        if a is None or b is None:
            return -1.0
        denom = float(np.linalg.norm(a) * np.linalg.norm(b))
        if denom == 0.0 or np.isnan(denom):
            return -1.0
        return float(np.dot(a, b) / denom)

    def recognize(self, embedding: np.ndarray, database: Dict[str, np.ndarray],
                  threshold: float = MATCH_THRESHOLD) -> Tuple[str, float]:
        """Legacy 1-vector-per-identity matching (kept for compatibility/tests)."""
        if embedding is None or not database:
            return "Unknown", -1.0
        best_identity, best_score = "Unknown", -1.0
        for identity, reference in database.items():
            score = self.cosine_similarity(embedding, reference)
            if score > best_score:
                best_identity, best_score = identity, score
        if best_score < threshold:
            return "Unknown", float(best_score)
        return best_identity, float(best_score)

    @staticmethod
    def match_gallery(embedding: np.ndarray, labels: np.ndarray, matrix: np.ndarray,
                      threshold: float = MATCH_THRESHOLD, margin: float = MATCH_MARGIN) -> Dict:
        """
        Multi-sample 1:N identification.
        labels: (N,) identity per row, matrix: (N, 512) L2-normalised embeddings.
        Identity score = 0.7 * best sample + 0.3 * mean(top-3 samples) which is
        robust to a single outlier enrolment photo.
        """
        if embedding is None or matrix is None or len(matrix) == 0:
            return {"matched": False, "faceId": None, "score": -1.0, "second": None, "secondScore": -1.0}
        sims = matrix @ embedding.astype(np.float32)
        scores: Dict[str, float] = {}
        for ident in np.unique(labels):
            s = np.sort(sims[labels == ident])[::-1]
            top = s[: min(3, len(s))]
            scores[str(ident)] = float(0.7 * s[0] + 0.3 * top.mean())
        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        best_id, best = ranked[0]
        second_id, second = ranked[1] if len(ranked) > 1 else (None, -1.0)
        matched = best >= threshold and (second_id is None or best - second >= margin)
        return {
            "matched": bool(matched),
            "faceId": best_id if matched else None,
            "candidate": best_id,
            "score": round(best, 4),
            "second": second_id,
            "secondScore": round(second, 4),
        }


def gate_reason(q: Dict) -> Optional[str]:
    """
    Hard gate applied BEFORE matching (softer than the enrolment gate).
    Tiny, very low-confidence or strongly turned faces produce unreliable
    embeddings and were the main source of false matches.
    """
    m = q["metrics"]
    if m["faceSize"] < MIN_FACE_SIZE:
        return "face_too_small"
    if m["detScore"] < 0.5:
        return "low_detection_confidence"
    if m["yaw"] > 0.42:
        return "face_turned_away"
    return None
