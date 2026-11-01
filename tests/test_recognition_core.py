"""
Unit tests for the recognition core that do NOT need the ONNX models:
gallery persistence/caps, 1:N matching with margin, quality gate,
consistency tracker + head-movement liveness, low-light enhancement.

    python -m unittest discover -s tests
"""
import tempfile
import types
import unittest
from pathlib import Path

import numpy as np

from src.face_engine import FaceEngine, gate_reason
from src.gallery import ADAPTIVE_MAX_SAMPLES, FaceGallery
from src.stream_manager import ConsistencyTracker

RNG = np.random.default_rng(42)


def unit(v):
    return (v / np.linalg.norm(v)).astype(np.float32)


def noisy(base, amount=0.3):
    return unit(base + amount * unit(RNG.normal(size=512)))


class GalleryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.g = FaceGallery("buffalo_l", self.tmp / "g.npz", self.tmp / "g.json", self.tmp / "enr")
        self.base = {k: unit(RNG.normal(size=512)) for k in ["F1", "F2", "F3"]}
        for k, b in self.base.items():
            self.g.add(k, [noisy(b) for _ in range(5)], {"name": k})

    def test_persist_and_reload(self):
        g2 = FaceGallery("buffalo_l", self.tmp / "g.npz", self.tmp / "g.json", self.tmp / "enr")
        self.assertEqual(g2.size, 3)
        self.assertEqual(len(g2.labels), 15)
        self.assertTrue(all(s == "enroll" for s in g2.sources))
        # no temp files left behind by the atomic writer
        self.assertFalse(list(self.tmp.glob(".*.tmp")))

    def test_model_change_marks_gallery_stale(self):
        g3 = FaceGallery("antelopev2", self.tmp / "g.npz", self.tmp / "g.json", self.tmp / "enr")
        self.assertTrue(g3.stale_model)
        self.assertEqual(len(g3.labels), 0)  # never mix embedding spaces

    def test_adaptive_samples_cannot_evict_enrolment(self):
        for _ in range(ADAPTIVE_MAX_SAMPLES + 4):
            self.g.add("F1", [noisy(self.base["F1"])], {}, source="adaptive")
        mask = self.g.labels == "F1"
        self.assertEqual(int(np.sum(mask & (self.g.sources == "enroll"))), 5)
        self.assertEqual(int(np.sum(mask & (self.g.sources == "adaptive"))), ADAPTIVE_MAX_SAMPLES)

    def test_store_image_unique_and_path_safe(self):
        p1 = self.g.store_image("F1", b"x" * 10)
        p2 = self.g.store_image("F1", b"y" * 10)
        self.assertNotEqual(p1, p2)  # same-millisecond writes used to overwrite
        p3 = self.g.store_image("../../evil", b"z")
        self.assertTrue(str(p3.resolve()).startswith(str((self.tmp / "enr").resolve())))

    def test_remove(self):
        self.g.store_image("F2", b"abc")
        self.assertTrue(self.g.remove("F2"))
        self.assertEqual(self.g.size, 2)
        self.assertFalse((self.tmp / "enr" / "F2").exists())


class MatchingTests(unittest.TestCase):
    def setUp(self):
        self.base = {k: unit(RNG.normal(size=512)) for k in ["A", "B", "C"]}
        rows, labels = [], []
        for k, b in self.base.items():
            for _ in range(4):
                rows.append(noisy(b))
                labels.append(k)
        self.labels = np.array(labels, dtype=object)
        self.matrix = np.stack(rows)

    def test_correct_identity(self):
        m = FaceEngine.match_gallery(noisy(self.base["B"]), self.labels, self.matrix, 0.45, 0.05)
        self.assertTrue(m["matched"])
        self.assertEqual(m["faceId"], "B")

    def test_stranger_rejected(self):
        m = FaceEngine.match_gallery(unit(RNG.normal(size=512)), self.labels, self.matrix, 0.45, 0.05)
        self.assertFalse(m["matched"])
        self.assertIsNone(m["faceId"])

    def test_ambiguous_lookalike_rejected_by_margin(self):
        # probe exactly between A and B -> both score alike -> must NOT match
        probe = unit(self.base["A"] + self.base["B"])
        m = FaceEngine.match_gallery(probe, self.labels, self.matrix, 0.3, 0.05)
        self.assertFalse(m["matched"])

    def test_empty_gallery(self):
        m = FaceEngine.match_gallery(unit(RNG.normal(size=512)), np.zeros((0,), object), np.zeros((0, 512), np.float32))
        self.assertFalse(m["matched"])


class QualityTests(unittest.TestCase):
    def _face(self, bbox, kps, det=0.9):
        return types.SimpleNamespace(bbox=np.array(bbox, float), det_score=det, kps=np.array(kps, float))

    def test_frontal_face_passes(self):
        frame = (RNG.random((480, 640, 3)) * 255).astype(np.uint8)
        f = self._face([200, 100, 400, 340], [[260, 180], [340, 180], [300, 230], [270, 290], [330, 290]])
        q = FaceEngine.assess_quality(frame, f)
        self.assertIsNone(gate_reason(q))
        self.assertAlmostEqual(q["metrics"]["yawSigned"], 0.0, places=2)

    def test_tiny_and_profile_faces_gated(self):
        frame = (RNG.random((480, 640, 3)) * 255).astype(np.uint8)
        tiny = self._face([10, 10, 40, 40], [[18, 20], [32, 20], [25, 27], [19, 33], [31, 33]])
        self.assertEqual(gate_reason(FaceEngine.assess_quality(frame, tiny)), "face_too_small")
        profile = self._face([200, 100, 400, 340], [[260, 180], [340, 180], [338, 230], [270, 290], [330, 290]])
        q = FaceEngine.assess_quality(frame, profile)
        self.assertEqual(gate_reason(q), "face_turned_away")
        self.assertGreater(q["metrics"]["yawSigned"], 0)

    def test_low_light_enhancement(self):
        # realistic dim scene: gradient + sensor noise
        g = np.tile(np.linspace(5, 60, 160, dtype=np.float32), (120, 1))
        dark = np.clip(g[..., None] + RNG.normal(0, 4, (120, 160, 1)), 0, 255).astype(np.uint8).repeat(3, 2)
        out = FaceEngine.enhance_low_light(dark)
        self.assertGreater(out.mean(), dark.mean() + 5)  # brighter
        self.assertGreater(int(out.max()) - int(out.min()), int(dark.max()) - int(dark.min()))  # wider range
        bright = np.full((120, 160, 3), 150, np.uint8)
        self.assertIs(FaceEngine.enhance_low_light(bright), bright)  # untouched


class TrackerTests(unittest.TestCase):
    def test_consistency_and_cooldown(self):
        t = ConsistencyTracker(required=3, window=4, cooldown=30)
        self.assertEqual([t.observe("x", 100 + i * 0.1) for i in range(3)], [False, False, True])
        self.assertFalse(t.observe("x", 101))

    def test_rigid_photo_fails_motion_liveness(self):
        t = ConsistencyTracker(required=3, window=8, cooldown=30, min_motion=0.04)
        fired = [t.observe("p", 100 + i, yaw=0.01) for i in range(6)]
        self.assertFalse(any(fired))

    def test_moving_head_passes_motion_liveness(self):
        t = ConsistencyTracker(required=3, window=8, cooldown=30, min_motion=0.04)
        res = [t.observe("p", 100 + i, yaw=y) for i, y in enumerate([0.0, 0.03, 0.07])]
        self.assertEqual(res, [False, False, True])

    def test_model_verdict_skips_motion(self):
        t = ConsistencyTracker(required=2, window=8, cooldown=30, min_motion=0.04)
        res = [t.observe("p", 100 + i, yaw=0.0, skip_motion=True) for i in range(2)]
        self.assertEqual(res, [False, True])


if __name__ == "__main__":
    unittest.main()
