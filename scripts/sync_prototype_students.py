import argparse
import json
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.config import BACKEND_API_URL, DEVICE_CODE, STUDENT_MAPPINGS_FILE
from src.student_mapping import StudentMappingManager


def sync_students_with_backend(
    admin_email: str,
    admin_password: str,
    backend_url: str = BACKEND_API_URL,
    device_code: str = DEVICE_CODE,
):
    print(f"Connecting to Smart Attendance Backend at {backend_url}...")

    # 1. Authenticate as Super Admin / Admin
    login_url = f"{backend_url}/auth/login"
    try:
        login_res = requests.post(
            login_url,
            json={"email": admin_email, "password": admin_password},
            timeout=10,
        )
    except Exception as e:
        print(f"[ERROR] Could not connect to backend server: {e}")
        return False

    if login_res.status_code != 200:
        print(f"[ERROR] Login failed ({login_res.status_code}): {login_res.text}")
        return False

    auth_token = login_res.json()["data"]["accessToken"]
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    print("[OK] Admin authenticated successfully.")

    # 2. Check / Create Department (e.g., Computer Science & Engineering - CSE)
    dept_res = requests.get(f"{backend_url}/departments", headers=headers, timeout=10)
    departments = dept_res.json().get("data", {}).get("items", []) if dept_res.status_code == 200 else []
    cse_dept = next((d for d in departments if d.get("code") == "CSE"), None)

    if not cse_dept:
        print("Creating default department 'Computer Science & Engineering' (CSE)...")
        create_dept_res = requests.post(
            f"{backend_url}/departments",
            headers=headers,
            json={
                "name": "Computer Science & Engineering",
                "code": "CSE",
                "description": "Department of Computer Science & Engineering",
            },
            timeout=10,
        )
        if create_dept_res.status_code == 201:
            cse_dept = create_dept_res.json()["data"]
            print(f"[OK] Department created: {cse_dept['name']} (ID: {cse_dept['id']})")
        else:
            print(f"[WARN] Failed to create department: {create_dept_res.text}")
            if departments:
                cse_dept = departments[0]
                print(f"[INFO] Falling back to existing department: {cse_dept['name']}")
    else:
        print(f"[OK] Found department: {cse_dept['name']} (ID: {cse_dept['id']})")

    dept_id = cse_dept["id"] if cse_dept else None
    if not dept_id:
        print("[ERROR] No department available to bind students.")
        return False

    # 3. Check / Register Device (e.g., WEBCAM-DEV-01)
    dev_res = requests.get(f"{backend_url}/devices?search={device_code}", headers=headers, timeout=10)
    existing_devices = dev_res.json().get("data", {}).get("items", []) if dev_res.status_code == 200 else []
    matching_dev = next((d for d in existing_devices if d.get("deviceCode") == device_code), None)

    if not matching_dev:
        print(f"Registering local webcam device: {device_code}...")
        reg_dev_res = requests.post(
            f"{backend_url}/devices/register",
            headers=headers,
            json={
                "deviceName": "Local Prototype Webcam",
                "deviceCode": device_code,
                "building": "Main Campus",
                "room": "Lab 101",
            },
            timeout=10,
        )
        if reg_dev_res.status_code == 201:
            dev_data = reg_dev_res.json()["data"]
            api_key = dev_data.get("apiKey")
            print(f"[OK] Device registered successfully!")
            print(f"      DEVICE_CODE: {device_code}")
            print(f"      DEVICE_API_KEY: {api_key}")
            print(f"      >> Add DEVICE_API_KEY={api_key} into your .env file! <<")
        else:
            print(f"[WARN] Device registration response: {reg_dev_res.text}")
    else:
        print(f"[OK] Device {device_code} is already registered on backend (ID: {matching_dev['id']}).")

    # 4. Sync Students
    mapping_mgr = StudentMappingManager()
    students_to_sync = mapping_mgr.get_all_students()

    print(f"\nSynchronizing {len(students_to_sync)} student profile(s) with backend...")
    for student in students_to_sync:
        roll_number = student["rollNumber"]
        face_id = student["faceId"]
        first_name = student.get("firstName") or student.get("name")
        last_name = student.get("lastName") or "Student"
        email = student.get("email")

        # Check if student exists by roll number
        search_res = requests.get(
            f"{backend_url}/students?search={roll_number}",
            headers=headers,
            timeout=10,
        )
        existing_students = search_res.json().get("data", {}).get("items", []) if search_res.status_code == 200 else []
        backend_student = next((s for s in existing_students if s.get("rollNumber") == roll_number), None)

        if not backend_student:
            print(f"Creating Student on backend: {first_name} {last_name} ({roll_number}, {face_id})...")
            create_payload = {
                "rollNumber": roll_number,
                "faceId": face_id,
                "firstName": first_name,
                "lastName": last_name,
                "email": email,
                "departmentId": dept_id,
                "semester": int(student.get("semester", 6)),
                "year": int(student.get("year", 2024)) if int(student.get("year", 2024)) >= 1900 else 2024,
            }
            create_student_res = requests.post(
                f"{backend_url}/students",
                headers=headers,
                json=create_payload,
                timeout=10,
            )
            if create_student_res.status_code == 201:
                created = create_student_res.json()["data"]
                student["backendId"] = created["id"]
                print(f"[OK] Student created: {created['firstName']} {created['lastName']} (ID: {created['id']})")
            else:
                print(f"[WARN] Failed to create student {first_name}: {create_student_res.text}")
        else:
            student["backendId"] = backend_student["id"]
            print(f"[OK] Student already exists: {backend_student['firstName']} {backend_student['lastName']} (ID: {backend_student['id']})")

    mapping_mgr.save()
    print(f"\n[DONE] Student synchronization complete. Saved to {STUDENT_MAPPINGS_FILE}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Synchronize prototype students and register webcam device on the backend.")
    parser.add_argument("--admin-email", default="superadmin@example.com", help="Super admin email")
    parser.add_argument("--admin-password", default="123456789", help="Super admin password")
    parser.add_argument("--backend-url", default=BACKEND_API_URL, help="Backend URL")
    parser.add_argument("--device-code", default=DEVICE_CODE, help="Device Code")

    args = parser.parse_args()
    sync_students_with_backend(
        admin_email=args.admin_email,
        admin_password=args.admin_password,
        backend_url=args.backend_url,
        device_code=args.device_code,
    )


if __name__ == "__main__":
    main()
