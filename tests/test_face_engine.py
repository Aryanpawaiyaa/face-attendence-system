import unittest
import numpy as np

from src.face_engine import FaceEngine


class TestFaceEngine(unittest.TestCase):
    def setUp(self):
        # We test mathematical logic without loading heavy ONNX models for fast CI
        self.dummy_emb_1 = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        self.dummy_emb_2 = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        self.dummy_emb_similar = np.array([0.95, 0.05, 0.0], dtype=np.float32)

    def test_cosine_similarity(self):
        # Identical vectors -> 1.0
        sim_same = FaceEngine.cosine_similarity(self.dummy_emb_1, self.dummy_emb_1)
        self.assertAlmostEqual(sim_same, 1.0, places=4)

        # Orthogonal vectors -> 0.0
        sim_ortho = FaceEngine.cosine_similarity(self.dummy_emb_1, self.dummy_emb_2)
        self.assertAlmostEqual(sim_ortho, 0.0, places=4)

        # Similar vectors
        sim_close = FaceEngine.cosine_similarity(self.dummy_emb_1, self.dummy_emb_similar)
        self.assertGreater(sim_close, 0.9)

        # Zero or None vectors
        self.assertEqual(FaceEngine.cosine_similarity(None, self.dummy_emb_1), -1.0)
        self.assertEqual(FaceEngine.cosine_similarity(np.zeros(3), self.dummy_emb_1), -1.0)

    def test_recognize_matching(self):
        engine = object.__new__(FaceEngine)  # Bypass __init__ to avoid loading ONNX models in unit tests

        database = {
            "Rajat": np.array([1.0, 0.0, 0.0], dtype=np.float32),
            "Priyanka": np.array([0.0, 1.0, 0.0], dtype=np.float32),
            "Pushpendra": np.array([0.0, 0.0, 1.0], dtype=np.float32),
        }

        # Exact match
        identity, score = engine.recognize(np.array([1.0, 0.0, 0.0]), database, threshold=0.5)
        self.assertEqual(identity, "Rajat")
        self.assertAlmostEqual(score, 1.0, places=4)

        # Close match above threshold
        test_emb = np.array([0.9, 0.1, 0.0])
        identity, score = engine.recognize(test_emb, database, threshold=0.5)
        self.assertEqual(identity, "Rajat")
        self.assertGreater(score, 0.8)

        # Unknown match below threshold
        identity, score = engine.recognize(np.array([0.2, 0.2, 0.2]), database, threshold=0.85)
        self.assertEqual(identity, "Unknown")

        # Empty database
        identity, score = engine.recognize(test_emb, {}, threshold=0.5)
        self.assertEqual(identity, "Unknown")
        self.assertEqual(score, -1.0)


if __name__ == "__main__":
    unittest.main()
