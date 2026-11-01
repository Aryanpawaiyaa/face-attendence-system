import logging
from typing import Dict, Any, Optional
import requests

from src.config import BACKEND_API_URL, DEVICE_CODE, DEVICE_API_KEY, COURSE_ID

logger = logging.getLogger(__name__)


class BackendAttendanceClient:
    """
    HTTP client for communicating with the Smart Attendance Node.js backend.
    Implements device authentication protocol and attendance submission.
    """

    def __init__(
        self,
        base_url: str = BACKEND_API_URL,
        device_code: str = DEVICE_CODE,
        device_api_key: str = DEVICE_API_KEY,
        course_id: Optional[str] = COURSE_ID,
        timeout: float = 5.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.device_code = device_code
        self.device_api_key = device_api_key
        self.course_id = course_id
        self.timeout = timeout
        self.session = requests.Session()

    def _get_device_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.device_code:
            headers["x-device-code"] = self.device_code
        if self.device_api_key:
            headers["x-device-api-key"] = self.device_api_key
        return headers

    def check_health(self) -> Dict[str, Any]:
        """
        Checks backend connectivity via GET /api/health.
        """
        url = f"{self.base_url}/health"
        try:
            res = self.session.get(url, timeout=self.timeout)
            if res.status_code == 200:
                data = res.json()
                return {"online": True, "status": "ONLINE", "message": data.get("message", "Healthy")}
            return {"online": False, "status": "ERROR", "message": f"HTTP {res.status_code}"}
        except requests.exceptions.RequestException as e:
            return {"online": False, "status": "OFFLINE", "message": str(e)}

    def verify_device(self) -> Dict[str, Any]:
        """
        Confirms x-device-code and x-device-api-key credentials via POST /api/devices/verify.
        """
        url = f"{self.base_url}/devices/verify"
        try:
            res = self.session.post(url, headers=self._get_device_headers(), timeout=self.timeout)
            if res.status_code == 200:
                data = res.json().get("data", {})
                return {
                    "valid": True,
                    "status": "VERIFIED",
                    "deviceId": data.get("deviceId"),
                    "deviceCode": data.get("deviceCode"),
                    "deviceStatus": data.get("status"),
                    "message": "Device credentials verified",
                }
            elif res.status_code == 401:
                return {"valid": False, "status": "INVALID_CREDENTIALS", "message": "Invalid device code or API key"}
            elif res.status_code == 403:
                return {"valid": False, "status": "DEVICE_INACTIVE", "message": "Device is inactive or suspended"}
            else:
                body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
                return {
                    "valid": False,
                    "status": f"HTTP_{res.status_code}",
                    "message": body.get("message", res.text or "Verification failed"),
                }
        except requests.exceptions.RequestException as e:
            return {"valid": False, "status": "BACKEND_OFFLINE", "message": f"Connection failed: {e}"}

    def send_heartbeat(self) -> Dict[str, Any]:
        """
        Sends keep-alive ping via POST /api/devices/heartbeat.
        """
        url = f"{self.base_url}/devices/heartbeat"
        try:
            res = self.session.post(url, headers=self._get_device_headers(), timeout=self.timeout)
            if res.status_code == 200:
                return {"success": True, "status": "ALIVE", "message": "Heartbeat accepted"}
            return {"success": False, "status": f"HTTP_{res.status_code}", "message": res.text}
        except requests.exceptions.RequestException as e:
            return {"success": False, "status": "OFFLINE", "message": str(e)}

    def submit_attendance(
        self,
        face_id: str,
        confidence_score: float,
        timestamp: Optional[str] = None,
        course_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Submits recognition result to POST /api/devices/attendance.
        """
        url = f"{self.base_url}/devices/attendance"
        payload = {
            "faceId": face_id,
            "confidenceScore": max(0.0, min(1.0, float(confidence_score))),
        }
        if timestamp:
            payload["timestamp"] = timestamp
        target_course = course_id or self.course_id
        if target_course:
            payload["courseId"] = target_course

        try:
            res = self.session.post(
                url,
                headers=self._get_device_headers(),
                json=payload,
                timeout=self.timeout,
            )

            if res.status_code == 200:
                data = res.json().get("data", {})
                is_duplicate = data.get("duplicate", False)
                return {
                    "success": True,
                    "status": "ALREADY_MARKED" if is_duplicate else "MARKED",
                    "duplicate": is_duplicate,
                    "studentName": data.get("studentName", "Student"),
                    "rollNumber": data.get("rollNumber"),
                    "attendanceStatus": data.get("status", "PRESENT"),
                    "markedAt": data.get("markedAt"),
                    "message": "Already Marked Today" if is_duplicate else "Attendance Marked Successfully",
                }

            # Error cases handled according to backend contract:
            body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            err_message = body.get("message", res.text or "Error")

            if res.status_code == 401:
                return {
                    "success": False,
                    "status": "INVALID_CREDENTIALS",
                    "message": "Device authentication failed (401)",
                }
            elif res.status_code == 403:
                return {
                    "success": False,
                    "status": "INACTIVE_STUDENT",
                    "message": err_message,
                }
            elif res.status_code == 404:
                return {
                    "success": False,
                    "status": "UNKNOWN_STUDENT",
                    "message": "No student registered for this faceId (404)",
                }
            elif res.status_code == 400:
                return {
                    "success": False,
                    "status": "VALIDATION_ERROR",
                    "message": f"Bad Request (400): {err_message}",
                }
            else:
                return {
                    "success": False,
                    "status": "SERVER_ERROR",
                    "message": f"Server error ({res.status_code}): {err_message}",
                }

        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "status": "BACKEND_OFFLINE",
                "message": f"Network error connecting to backend: {e}",
            }
