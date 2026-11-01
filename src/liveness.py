"""
Optional passive anti-spoofing (presentation attack detection).

If ANTISPOOF_MODEL points to a MiniFASNet ONNX export
(Silent-Face-Anti-Spoofing, 2.7_80x80_MiniFASNetV2), each face is scored:
  crop = bbox scaled 2.7x around its centre, resized to 80x80, BGR,
  float32 0..255, NCHW -> softmax over 3 classes, class 1 == real face.

Without a model file the checker reports {"checked": False} and never blocks
attendance - so the system works out of the box and gets stronger when the
model is dropped in.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict

import cv2
import numpy as np

from src.config import ANTISPOOF_MODEL, ANTISPOOF_THRESHOLD, ROOT

log = logging.getLogger("liveness")


class LivenessChecker:
    def __init__(self, model_path: str = ANTISPOOF_MODEL, threshold: float = ANTISPOOF_THRESHOLD):
        self.threshold = threshold
        self.session = None
        self.input_name = None
        if model_path:
            p = Path(model_path)
            p = p if p.is_absolute() else ROOT / p
            if p.exists():
                try:
                    import onnxruntime as ort

                    self.session = ort.InferenceSession(str(p), providers=["CPUExecutionProvider"])
                    self.input_name = self.session.get_inputs()[0].name
                    log.info("Anti-spoof model loaded: %s", p)
                except Exception as e:  # pragma: no cover
                    log.warning("Could not load anti-spoof model %s: %s", p, e)
            else:
                log.warning("ANTISPOOF_MODEL not found at %s - liveness disabled", p)

    @property
    def enabled(self) -> bool:
        return self.session is not None

    @staticmethod
    def _crop(frame: np.ndarray, bbox, scale: float = 2.7, size: int = 80) -> np.ndarray:
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = [float(v) for v in bbox]
        bw, bh = x2 - x1, y2 - y1
        scale = min((h - 1) / max(bh, 1), (w - 1) / max(bw, 1), scale)
        cx, cy = x1 + bw / 2, y1 + bh / 2
        nw, nh = bw * scale, bh * scale
        lx, ly = max(0, int(cx - nw / 2)), max(0, int(cy - nh / 2))
        rx, ry = min(w - 1, int(cx + nw / 2)), min(h - 1, int(cy + nh / 2))
        crop = frame[ly:ry + 1, lx:rx + 1]
        return cv2.resize(crop, (size, size)) if crop.size else np.zeros((size, size, 3), np.uint8)

    def check(self, frame: np.ndarray, bbox) -> Dict:
        # 1. Run deep learning model if loaded
        deep_score = None
        if self.enabled:
            try:
                crop = self._crop(frame, bbox).astype(np.float32)
                blob = np.transpose(crop, (2, 0, 1))[None, ...]
                logits = self.session.run(None, {self.input_name: blob})[0][0]
                e = np.exp(logits - logits.max())
                probs = e / e.sum()
                deep_score = float(probs[1]) if len(probs) > 1 else float(probs[0])
            except Exception as e:
                log.warning("Deep anti-spoof inference error: %s", e)

        # 2. Run multi-factor algorithmic Presentation Attack Detection (PAD)
        algo_score, algo_reason = self._algorithmic_check(frame, bbox)

        if deep_score is not None:
            # Weighted ensemble: 60% deep model + 40% algorithmic checks
            combined_score = round(deep_score * 0.6 + algo_score * 0.4, 4)
        else:
            combined_score = round(algo_score, 4)

        is_live = combined_score >= self.threshold
        return {
            "checked": True,
            "live": is_live,
            "score": combined_score,
            "reason": algo_reason if not is_live else None,
            "spoofSuspected": not is_live,
        }

    @staticmethod
    def _algorithmic_check(frame: np.ndarray, bbox) -> Tuple[float, Optional[str]]:
        """
        Multi-feature Presentation Attack Detection (PAD):
        Detects digital phone screens, tablets, and printed photos.
        """
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = [int(v) for v in bbox]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 - x1 < 25 or y2 - y1 < 25:
            return 0.5, "face_too_small"

        face_crop = frame[y1:y2, x1:x2]
        if face_crop.size == 0:
            return 0.5, "empty_crop"

        # 1. Specular Screen Glare Hotspots (glass screen reflections)
        hsv = cv2.cvtColor(face_crop, cv2.COLOR_BGR2HSV)
        val = hsv[:, :, 2]
        sat = hsv[:, :, 1]
        glare_mask = (val > 248) & (sat < 28)
        glare_ratio = np.sum(glare_mask) / float(face_crop.shape[0] * face_crop.shape[1])
        if glare_ratio > 0.07:
            return 0.15, "screen_glare_detected"

        # 2. Skin Chrominance Dispersion in YCrCb
        ycrcb = cv2.cvtColor(face_crop, cv2.COLOR_BGR2YCrCb)
        cr = ycrcb[:, :, 1]
        cb = ycrcb[:, :, 2]
        skin_mask = (cr >= 130) & (cr <= 175) & (cb >= 75) & (cb <= 130)
        skin_ratio = np.sum(skin_mask) / float(face_crop.shape[0] * face_crop.shape[1])
        if skin_ratio < 0.20:
            return 0.22, "unnatural_color_spectrum"

        # 3. High-Frequency Moiré / Screen Pixel Grid Artifacts
        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        lap = cv2.Laplacian(gray, cv2.CV_64F)
        lap_var = float(lap.var())
        if lap_var < 18.0:
            return 0.25, "excessive_blur_or_display_ghosting"

        # 4. Phone Screen Bezel / Frame Border Detection in 2.5x Margin
        bw, bh = x2 - x1, y2 - y1
        cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
        exp_w, exp_h = bw * 2.5, bh * 2.5
        mx1 = max(0, int(cx - exp_w / 2.0))
        my1 = max(0, int(cy - exp_h / 2.0))
        mx2 = min(w, int(cx + exp_w / 2.0))
        my2 = min(h, int(cy + exp_h / 2.0))
        margin_crop = frame[my1:my2, mx1:mx2]
        if margin_crop.size > 0:
            m_gray = cv2.cvtColor(margin_crop, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(m_gray, 50, 150)
            lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=80, minLineLength=int(bw * 0.7), maxLineGap=10)
            if lines is not None and len(lines) >= 3:
                rect_lines = 0
                for line in lines:
                    lx1, ly1, lx2, ly2 = line[0]
                    dx = abs(lx2 - lx1)
                    dy = abs(ly2 - ly1)
                    if dx < 10 or dy < 10:  # strictly horizontal or vertical phone edge
                        rect_lines += 1
                if rect_lines >= 4:
                    return 0.18, "phone_bezel_detected"

        confidence = 0.88 + min(0.10, skin_ratio * 0.12) - min(0.15, glare_ratio * 1.5)
        return float(min(1.0, max(0.0, confidence))), None
