import sqlite3
import tempfile
import unittest
from pathlib import Path

from src.migrate_sqlite import SQLiteAttendanceMigrator


class TestMigrateSQLite(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_attendance.db"

        conn = sqlite3.connect(self.db_path)
        conn.execute("""
            CREATE TABLE attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                attendance_date TEXT NOT NULL,
                attendance_time TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Present',
                UNIQUE(name, attendance_date)
            )
        """)
        conn.execute(
            "INSERT INTO attendance (name, attendance_date, attendance_time, status) VALUES (?, ?, ?, ?)",
            ("Rajat", "2026-10-12", "09:30:00", "Present"),
        )
        conn.execute(
            "INSERT INTO attendance (name, attendance_date, attendance_time, status) VALUES (?, ?, ?, ?)",
            ("Priyanka", "2026-10-12", "09:35:00", "Present"),
        )
        conn.commit()
        conn.close()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_get_records(self):
        migrator = SQLiteAttendanceMigrator(self.db_path)
        records = migrator.get_records()
        self.assertEqual(len(records), 2)
        names = [r["name"] for r in records]
        self.assertIn("Rajat", names)
        self.assertIn("Priyanka", names)

    def test_export_csv(self):
        migrator = SQLiteAttendanceMigrator(self.db_path)
        csv_path = Path(self.temp_dir.name) / "export.csv"
        count = migrator.export_csv(csv_path)

        self.assertEqual(count, 2)
        self.assertTrue(csv_path.exists())
        content = csv_path.read_text(encoding="utf-8")
        self.assertIn("Rajat", content)
        self.assertIn("Priyanka", content)


if __name__ == "__main__":
    unittest.main()
