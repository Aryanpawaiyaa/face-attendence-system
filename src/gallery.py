"""
Thread-safe multi-sample face gallery.

Storage:
  data/embeddings/gallery.npz   -> labels (N,), embeddings (N, 512), sources (N,)
  data/embeddings/gallery.json  -> {model, identities: {faceId: {...meta}}}
  data/enrollments/<faceId>/    -> accepted enrolment crops (used to rebuild the
                                   gallery when the model changes)

sources: "enroll" (teacher-approved photos) or "adaptive" (high-confidence
live captures that keep the template current as students age / change
hair / glasses). Adaptive samples have their own small cap so they can
never push out the enrolment photos.
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

from src.config import ENROLL_DIR, ENROLL_MAX_SAMPLES, GALLERY_FILE, GALLERY_META_FILE

ADAPTIVE_MAX_SAMPLES = int(os.getenv("ADAPTIVE_MAX_SAMPLES", "5"))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _atomic_write_bytes(path: Path, writer) -> None:
    """Write to a temp file in the same folder, fsync, then os.replace (atomic)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as fh:
            writer(fh)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def safe_face_id(face_id: str) -> str:
    return "".join(c for c in str(face_id) if c.isalnum() or c in "-_")


class FaceGallery:
    def __init__(self, model_name: str, gallery_file: Path = GALLERY_FILE,
                 meta_file: Path = GALLERY_META_FILE, enroll_dir: Path = ENROLL_DIR):
        self.model_name = model_name
        self.gallery_file = Path(gallery_file)
        self.meta_file = Path(meta_file)
        self.enroll_dir = Path(enroll_dir)
        self._lock = threading.RLock()
        self._clear()
        self.meta: Dict[str, Dict] = {}
        self.stale_model = False
        self.load()

    def _clear(self) -> None:
        self.labels = np.zeros((0,), dtype=object)
        self.sources = np.zeros((0,), dtype=object)
        self.matrix = np.zeros((0, 512), dtype=np.float32)

    # ---------------------------------------------------------------- io
    def load(self) -> None:
        with self._lock:
            self._clear()
            self.meta = {}
            self.stale_model = False
            if self.meta_file.exists():
                try:
                    doc = json.loads(self.meta_file.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    doc = {}
                self.meta = doc.get("identities", {})
                saved_model = doc.get("model")
                if saved_model and saved_model != self.model_name:
                    # Embeddings from different models live in different spaces.
                    self.stale_model = True
            if self.gallery_file.exists() and not self.stale_model:
                data = np.load(self.gallery_file, allow_pickle=False)
                self.labels = np.array([str(x) for x in data["labels"]], dtype=object)
                self.matrix = data["embeddings"].astype(np.float32)
                if "sources" in data.files:
                    self.sources = np.array([str(x) for x in data["sources"]], dtype=object)
                else:
                    self.sources = np.array(["enroll"] * len(self.labels), dtype=object)

    def save(self) -> None:
        with self._lock:
            labels = self.labels.astype(str)
            sources = self.sources.astype(str)
            matrix = self.matrix
            _atomic_write_bytes(
                self.gallery_file,
                lambda fh: np.savez_compressed(fh, labels=labels, embeddings=matrix, sources=sources),
            )
            meta = json.dumps({"model": self.model_name, "updatedAt": _now(), "identities": self.meta}, indent=2)
            _atomic_write_bytes(self.meta_file, lambda fh: fh.write(meta.encode("utf-8")))

    # ---------------------------------------------------------------- queries
    def snapshot(self):
        with self._lock:
            return self.labels.copy(), self.matrix.copy()

    def identities(self) -> List[Dict]:
        with self._lock:
            out = []
            for fid, m in sorted(self.meta.items(), key=lambda kv: kv[1].get("name") or kv[0]):
                mask = self.labels == fid
                out.append({
                    "faceId": fid, **m,
                    "samples": int(np.sum(mask & (self.sources == "enroll"))),
                    "adaptiveSamples": int(np.sum(mask & (self.sources == "adaptive"))),
                })
            return out

    def get(self, face_id: str) -> Optional[Dict]:
        with self._lock:
            m = self.meta.get(face_id)
            if not m:
                return None
            return {"faceId": face_id, **m, "samples": int(np.sum(self.labels == face_id))}

    @property
    def size(self) -> int:
        return len(self.meta)

    # ---------------------------------------------------------------- mutations
    def _cap(self, face_id: str, source: str, limit: int) -> None:
        idx = np.where((self.labels == face_id) & (self.sources == source))[0]
        if len(idx) > limit:
            keep = np.ones(len(self.labels), dtype=bool)
            keep[idx[: len(idx) - limit]] = False  # drop the oldest
            self.labels, self.sources, self.matrix = self.labels[keep], self.sources[keep], self.matrix[keep]

    def add(self, face_id: str, embeddings: List[np.ndarray], info: Dict, replace: bool = False,
            source: str = "enroll", persist: bool = True) -> int:
        if not embeddings:
            return 0
        with self._lock:
            if replace:
                self._drop_rows(face_id)
            new = np.stack([e.astype(np.float32) for e in embeddings])
            self.labels = np.concatenate([self.labels, np.array([face_id] * len(new), dtype=object)])
            self.sources = np.concatenate([self.sources, np.array([source] * len(new), dtype=object)])
            self.matrix = np.vstack([self.matrix, new]) if len(self.matrix) else new
            self._cap(face_id, "enroll", ENROLL_MAX_SAMPLES)
            self._cap(face_id, "adaptive", ADAPTIVE_MAX_SAMPLES)
            prev = self.meta.get(face_id, {})
            meta = {**prev, **{k: v for k, v in info.items() if v is not None}, "updatedAt": _now()}
            meta.setdefault("enrolledAt", _now())
            if source == "adaptive":
                meta["lastAdaptiveAt"] = time.time()
            self.meta[face_id] = meta
            if persist:
                self.save()
            return int(np.sum(self.labels == face_id))

    def _drop_rows(self, face_id: str) -> None:
        keep = self.labels != face_id
        self.labels, self.sources, self.matrix = self.labels[keep], self.sources[keep], self.matrix[keep]

    def remove(self, face_id: str, delete_images: bool = True) -> bool:
        with self._lock:
            existed = face_id in self.meta
            self._drop_rows(face_id)
            self.meta.pop(face_id, None)
            self.save()
        if delete_images:
            folder = self.enroll_dir / safe_face_id(face_id)
            if folder.exists():
                for f in folder.glob("*"):
                    f.unlink(missing_ok=True)
                folder.rmdir()
        return existed

    def store_image(self, face_id: str, jpeg_bytes: bytes) -> Path:
        folder = self.enroll_dir / safe_face_id(face_id)
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{time.time_ns()}.jpg"
        path.write_bytes(jpeg_bytes)
        return path

    def reset_for_rebuild(self) -> None:
        with self._lock:
            self._clear()
            self.stale_model = False
