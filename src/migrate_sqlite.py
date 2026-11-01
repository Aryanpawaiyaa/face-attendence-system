import argparse
import csv
import json
import sqlite3
from pathlib import Path
from typing import List, Dict, Optional

import requests

from src.config import DB_FILE, BACKEND_API_URL
from src.student_mapping import StudentMappingManager


class SQLiteAttendanceMigrator:
    """
    Handles read-only inspection, export, and migration of legacy SQLite attendance records
    into the authoritative PostgreSQL Smart Attendance backend.
    """

    def __init__(self, db_path: Path = DB_FILE):
        self.db_path = Path(db_path)

    def is_available(self) -> bool:
        return self.db_path.exists()

    def get_records(self) -> List[Dict]:
        if not self.is_available():
            return []
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            cur = conn.execute("SELECT id, name, attendance_date, attendance_time, status FROM attendance ORDER BY attendance_date, attendance_time")
            rows = [dict(r) for r in cur.fetchall()]
            return rows
        except sqlite3.OperationalError:
            return []
        finally:
            conn.close()

    def export_csv(self, output_path: Path) -> int:
        records = self.get_records()
        if not records:
            print("No records found in SQLite database.")
            return 0

        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["id", "name", "attendance_date", "attendance_time", "status"])
            writer.writeheader()
            writer.writerows(records)

        print(f"Exported {len(records)} legacy records to {output_path}")
        return len(records)

    def migrate_to_backend(
        self,
        admin_email: str,
        admin_password: str,
        backend_url: str = BACKEND_API_URL,
    ) -> Dict:
        records = self.get_records()
        if not records:
            return {"total": 0, "migrated": 0, "skipped": 0, "errors": []}

        # 1. Login to backend as admin to obtain JWT
        login_res = requests.post(
            f"{backend_url}/auth/login",
            json={"email": admin_email, "password": admin_password},
            timeout=10,
        )
        if login_res.status_code != 200:
            raise RuntimeError(f"Admin login failed ({login_res.status_code}): {login_res.text}")

        token = login_res.json()["data"]["accessToken"]
        auth_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # 2. Fetch all registered students from backend to map rollNumber/name -> studentId
        students_res = requests.get(f"{backend_url}/students?limit=100", headers=auth_headers, timeout=10)
        backend_students = students_res.json().get("data", {}).get("items", []) if students_res.status_code == 200 else []

        mapping_mgr = StudentMappingManager()
        name_to_student_id = {}

        for bs in backend_students:
            # Index by firstName and by rollNumber
            name_to_student_id[bs.get("firstName", "").lower()] = bs["id"]
            name_to_student_id[bs.get("rollNumber", "").lower()] = bs["id"]

        migrated_count = 0
        skipped_count = 0
        errors = []

        for r in records:
            name = r["name"]
            # Resolve studentId
            student_id = name_to_student_id.get(name.lower())
            if not student_id:
                # Try local mapping
                local_entry = mapping_mgr.get_by_name(name)
                if local_entry:
                    student_id = name_to_student_id.get(local_entry.get("rollNumber", "").lower())

            if not student_id:
                errors.append(f"Could not resolve backend student ID for '{name}'")
                skipped_count += 1
                continue

            # Submit manual mark to backend: POST /attendance/mark
            mark_payload = {
                "studentId": student_id,
                "status": "PRESENT" if r.get("status", "").upper() == "PRESENT" else "PRESENT",
                "attendanceDate": r["attendance_date"],
            }

            mark_res = requests.post(f"{backend_url}/attendance/mark", headers=auth_headers, json=mark_payload, timeout=10)
            if mark_res.status_code == 201:
                migrated_count += 1
            elif mark_res.status_code == 409:
                # Already exists in backend
                skipped_count += 1
            else:
                errors.append(f"Failed to migrate record for {name} on {r['attendance_date']}: {mark_res.text}")

        return {
            "total": len(records),
            "migrated": migrated_count,
            "skipped": skipped_count,
            "errors": errors,
        }


def main():
    parser = argparse.ArgumentParser(description="Legacy SQLite attendance migration utility.")
    parser.add_argument("--inspect", action="store_true", help="Inspect legacy SQLite attendance records.")
    parser.add_argument("--export-csv", type=str, help="Export records to CSV file path.")
    parser.add_argument("--migrate", action="store_true", help="Migrate records into PostgreSQL backend.")
    parser.add_argument("--admin-email", default="superadmin@example.com", help="Admin email for backend.")
    parser.add_argument("--admin-password", help="Admin password for backend.")

    args = parser.parse_args()
    migrator = SQLiteAttendanceMigrator()

    if args.inspect or (not args.export_csv and not args.migrate):
        records = migrator.get_records()
        print(f"\n--- SQLite Attendance Database ({DB_FILE}) ---")
        print(f"Total legacy records: {len(records)}")
        for r in records[:10]:
            print(f"  [{r['attendance_date']} {r['attendance_time']}] {r['name']} - {r['status']}")
        if len(records) > 10:
            print(f"  ... and {len(records) - 10} more records.")

    if args.export_csv:
        migrator.export_csv(Path(args.export_csv))

    if args.migrate:
        if not args.admin_password:
            raise SystemExit("Please provide --admin-password to migrate records to the backend.")
        print("Migrating records to backend...")
        res = migrator.migrate_to_backend(args.admin_email, args.admin_password)
        print(f"Migration completed: Total: {res['total']}, Migrated: {res['migrated']}, Skipped: {res['skipped']}, Errors: {len(res['errors'])}")


if __name__ == "__main__":
    main()
