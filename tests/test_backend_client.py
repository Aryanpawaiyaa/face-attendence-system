import unittest
from unittest.mock import MagicMock, patch
import requests

from src.backend_client import BackendAttendanceClient


class TestBackendAttendanceClient(unittest.TestCase):
    def setUp(self):
        self.client = BackendAttendanceClient(
            base_url="http://localhost:5000/api",
            device_code="TEST-DEV-01",
            device_api_key="amb82_test_api_key_12345",
        )

    @patch("requests.Session.get")
    def test_check_health_online(self, mock_get):
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.json.return_value = {"success": True, "message": "API is healthy"}
        mock_get.return_value = mock_res

        res = self.client.check_health()
        self.assertTrue(res["online"])
        self.assertEqual(res["status"], "ONLINE")

    @patch("requests.Session.get")
    def test_check_health_offline(self, mock_get):
        mock_get.side_effect = requests.exceptions.ConnectionError("Connection refused")

        res = self.client.check_health()
        self.assertFalse(res["online"])
        self.assertEqual(res["status"], "OFFLINE")

    @patch("requests.Session.post")
    def test_verify_device_success(self, mock_post):
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.json.return_value = {
            "success": True,
            "data": {"deviceId": "dev-123", "deviceCode": "TEST-DEV-01", "status": "ACTIVE"},
        }
        mock_post.return_value = mock_res

        res = self.client.verify_device()
        self.assertTrue(res["valid"])
        self.assertEqual(res["status"], "VERIFIED")
        self.assertEqual(res["deviceCode"], "TEST-DEV-01")

    @patch("requests.Session.post")
    def test_verify_device_invalid_key(self, mock_post):
        mock_res = MagicMock()
        mock_res.status_code = 401
        mock_res.json.return_value = {"success": False, "message": "Invalid device API key"}
        mock_post.return_value = mock_res

        res = self.client.verify_device()
        self.assertFalse(res["valid"])
        self.assertEqual(res["status"], "INVALID_CREDENTIALS")

    @patch("requests.Session.post")
    def test_submit_attendance_marked(self, mock_post):
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.json.return_value = {
            "success": True,
            "data": {
                "success": True,
                "duplicate": False,
                "studentName": "Rajat Sharma",
                "rollNumber": "CSE-2026-001",
                "attendance": "Marked",
                "status": "PRESENT",
                "markedAt": "2026-10-12T10:00:00Z",
            },
        }
        mock_post.return_value = mock_res

        res = self.client.submit_attendance(face_id="FACE-RAJAT-001", confidence_score=0.92)
        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "MARKED")
        self.assertFalse(res["duplicate"])
        self.assertEqual(res["studentName"], "Rajat Sharma")
        self.assertEqual(res["attendanceStatus"], "PRESENT")

    @patch("requests.Session.post")
    def test_submit_attendance_duplicate(self, mock_post):
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.json.return_value = {
            "success": True,
            "data": {
                "success": True,
                "duplicate": True,
                "studentName": "Rajat Sharma",
                "attendance": "Already Marked",
                "markedAt": "2026-10-12T09:00:00Z",
            },
        }
        mock_post.return_value = mock_res

        res = self.client.submit_attendance(face_id="FACE-RAJAT-001", confidence_score=0.95)
        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "ALREADY_MARKED")
        self.assertTrue(res["duplicate"])
        self.assertEqual(res["studentName"], "Rajat Sharma")

    @patch("requests.Session.post")
    def test_submit_attendance_inactive_student(self, mock_post):
        mock_res = MagicMock()
        mock_res.status_code = 403
        mock_res.json.return_value = {
            "success": False,
            "message": "Student status is SUSPENDED; attendance cannot be marked",
        }
        mock_res.headers = {"content-type": "application/json"}
        mock_post.return_value = mock_res

        res = self.client.submit_attendance(face_id="FACE-PRIYANKA-002", confidence_score=0.88)
        self.assertFalse(res["success"])
        self.assertEqual(res["status"], "INACTIVE_STUDENT")
        self.assertIn("SUSPENDED", res["message"])

    @patch("requests.Session.post")
    def test_submit_attendance_unknown_student(self, mock_post):
        mock_res = MagicMock()
        mock_res.status_code = 404
        mock_res.json.return_value = {
            "success": False,
            "message": "No student is registered against this faceId",
        }
        mock_res.headers = {"content-type": "application/json"}
        mock_post.return_value = mock_res

        res = self.client.submit_attendance(face_id="FACE-UNKNOWN-999", confidence_score=0.85)
        self.assertFalse(res["success"])
        self.assertEqual(res["status"], "UNKNOWN_STUDENT")

    @patch("requests.Session.post")
    def test_submit_attendance_network_error(self, mock_post):
        mock_post.side_effect = requests.exceptions.Timeout("Request timed out")

        res = self.client.submit_attendance(face_id="FACE-RAJAT-001", confidence_score=0.91)
        self.assertFalse(res["success"])
        self.assertEqual(res["status"], "BACKEND_OFFLINE")
        self.assertIn("timed out", res["message"])


if __name__ == "__main__":
    unittest.main()
