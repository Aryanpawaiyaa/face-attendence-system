import unittest


class ConsistencyTracker:
    """
    Helper class encapsulating the multi-frame consistency logic
    used in run_attendance.py for automated testing.
    """

    def __init__(self, required_frames: int = 3, cooldown_seconds: float = 30.0):
        self.required_frames = required_frames
        self.cooldown_seconds = cooldown_seconds
        self.current_identity = None
        self.consecutive_count = 0
        self.last_marked = {}

    def process_frame(self, identity: str, current_time: float) -> tuple[bool, str]:
        """
        Processes a recognition result for the current frame.
        Returns (should_submit_attendance, status_reason).
        """
        if identity == "Unknown":
            self.current_identity = None
            self.consecutive_count = 0
            return False, "UNKNOWN"

        if identity == self.current_identity:
            self.consecutive_count += 1
        else:
            self.current_identity = identity
            self.consecutive_count = 1

        if self.consecutive_count >= self.required_frames:
            # Check cooldown
            last_time = self.last_marked.get(identity, 0.0)
            if current_time - last_time >= self.cooldown_seconds:
                self.last_marked[identity] = current_time
                return True, "READY_FOR_ATTENDANCE"
            else:
                return False, "COOLDOWN_ACTIVE"

        return False, f"ACCUMULATING_{self.consecutive_count}_{self.required_frames}"


class TestConsistencyTracker(unittest.TestCase):
    def test_single_frame_does_not_trigger(self):
        tracker = ConsistencyTracker(required_frames=3, cooldown_seconds=30.0)
        should_mark, status = tracker.process_frame("Rajat", current_time=100.0)
        self.assertFalse(should_mark)
        self.assertEqual(status, "ACCUMULATING_1_3")

    def test_reaches_required_frames_triggers_attendance(self):
        tracker = ConsistencyTracker(required_frames=3, cooldown_seconds=30.0)
        tracker.process_frame("Rajat", current_time=100.0)
        tracker.process_frame("Rajat", current_time=100.1)
        should_mark, status = tracker.process_frame("Rajat", current_time=100.2)

        self.assertTrue(should_mark)
        self.assertEqual(status, "READY_FOR_ATTENDANCE")

    def test_flashing_face_resets_count(self):
        tracker = ConsistencyTracker(required_frames=3, cooldown_seconds=30.0)
        tracker.process_frame("Rajat", current_time=100.0)
        tracker.process_frame("Rajat", current_time=100.1)

        # Interrupted by Priyanka
        tracker.process_frame("Priyanka", current_time=100.2)
        self.assertEqual(tracker.consecutive_count, 1)

        # Back to Rajat -> count is 1, not 3
        should_mark, status = tracker.process_frame("Rajat", current_time=100.3)
        self.assertFalse(should_mark)
        self.assertEqual(tracker.consecutive_count, 1)

    def test_unknown_face_resets_count(self):
        tracker = ConsistencyTracker(required_frames=3, cooldown_seconds=30.0)
        tracker.process_frame("Pushpendra", current_time=100.0)
        tracker.process_frame("Pushpendra", current_time=100.1)

        # Interrupted by Unknown
        tracker.process_frame("Unknown", current_time=100.2)
        self.assertIsNone(tracker.current_identity)
        self.assertEqual(tracker.consecutive_count, 0)

    def test_cooldown_prevents_rapid_fire_submissions(self):
        tracker = ConsistencyTracker(required_frames=3, cooldown_seconds=30.0)
        # First 3 frames trigger attendance
        tracker.process_frame("Rajat", current_time=100.0)
        tracker.process_frame("Rajat", current_time=100.1)
        should_mark_1, _ = tracker.process_frame("Rajat", current_time=100.2)
        self.assertTrue(should_mark_1)

        # Next frames within 30 seconds are blocked by cooldown
        should_mark_2, status = tracker.process_frame("Rajat", current_time=105.0)
        self.assertFalse(should_mark_2)
        self.assertEqual(status, "COOLDOWN_ACTIVE")

        # After 30 seconds, next stable frame triggers again
        should_mark_3, status_3 = tracker.process_frame("Rajat", current_time=135.0)
        self.assertTrue(should_mark_3)
        self.assertEqual(status_3, "READY_FOR_ATTENDANCE")


if __name__ == "__main__":
    unittest.main()
