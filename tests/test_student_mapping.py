import tempfile
import unittest
from pathlib import Path

from src.student_mapping import StudentMappingManager


class TestStudentMapping(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.mapping_file = Path(self.temp_dir.name) / "test_mappings.json"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_default_mappings_initialization(self):
        manager = StudentMappingManager(self.mapping_file)
        students = manager.get_all_students()

        self.assertGreaterEqual(len(students), 3)
        names = [s["name"] for s in students]
        self.assertIn("Rajat", names)
        self.assertIn("Priyanka", names)
        self.assertIn("Pushpendra", names)

        # Check faceId resolution
        rajat_face_id = manager.get_face_id("Rajat")
        self.assertTrue(rajat_face_id.startswith("FACE-"))

    def test_lookup_by_fields(self):
        manager = StudentMappingManager(self.mapping_file)

        by_name = manager.get_by_name("priyanka")
        self.assertIsNotNone(by_name)
        self.assertEqual(by_name["name"], "Priyanka")

        face_id = by_name["faceId"]
        by_face = manager.get_by_face_id(face_id)
        self.assertIsNotNone(by_face)
        self.assertEqual(by_face["name"], "Priyanka")

        roll = by_name["rollNumber"]
        by_roll = manager.get_by_roll(roll)
        self.assertIsNotNone(by_roll)
        self.assertEqual(by_roll["name"], "Priyanka")

    def test_register_new_student_and_prevent_duplicates(self):
        manager = StudentMappingManager(self.mapping_file)
        initial_count = len(manager.get_all_students())

        # Register a 4th student
        new_student = {
            "name": "Aman",
            "firstName": "Aman",
            "lastName": "Gupta",
            "rollNumber": "CSE-2026-004",
            "faceId": "FACE-AMAN-004",
            "email": "aman@example.com",
            "departmentCode": "CSE",
        }
        manager.register_or_update(new_student)
        self.assertEqual(len(manager.get_all_students()), initial_count + 1)
        self.assertEqual(manager.get_face_id("Aman"), "FACE-AMAN-004")

        # Re-registering with same roll number updates instead of creating duplicate
        updated_student = dict(new_student)
        updated_student["lastName"] = "Updated"
        manager.register_or_update(updated_student)
        self.assertEqual(len(manager.get_all_students()), initial_count + 1)
        self.assertEqual(manager.get_by_name("Aman")["lastName"], "Updated")


if __name__ == "__main__":
    unittest.main()
