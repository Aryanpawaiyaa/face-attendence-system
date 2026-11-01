import json
from pathlib import Path
from typing import Dict, List, Optional
from src.config import STUDENT_MAPPINGS_FILE, PEOPLE


class StudentMappingManager:
    """
    Manages local mappings between prototype identities (e.g. Rajat, Priyanka, Pushpendra)
    and authoritative backend Student records (rollNumber, faceId, department, etc.).
    """

    def __init__(self, mapping_file: Path = STUDENT_MAPPINGS_FILE):
        self.mapping_file = Path(mapping_file)
        self._mappings: List[Dict] = []
        self._by_name: Dict[str, Dict] = {}
        self._by_face_id: Dict[str, Dict] = {}
        self._by_roll: Dict[str, Dict] = {}
        self.reload()

    def reload(self) -> None:
        """Loads or reloads the mapping file."""
        if not self.mapping_file.exists():
            # Initialize with default prototype entries if missing
            self._mappings = [
                {
                    "name": p,
                    "firstName": p,
                    "lastName": "Student",
                    "rollNumber": f"STU-{i+1:03d}",
                    "faceId": f"FACE-{p.upper()}-{i+1:03d}",
                    "email": f"{p.lower()}@example.com",
                    "departmentCode": "CSE",
                    "semester": 6,
                    "year": 3,
                    "status": "ACTIVE",
                }
                for i, p in enumerate(PEOPLE)
            ]
            self.save()
        else:
            try:
                data = json.loads(self.mapping_file.read_text(encoding="utf-8"))
                self._mappings = data.get("students", [])
            except Exception as e:
                print(f"[WARN] Error reading student mappings from {self.mapping_file}: {e}")
                self._mappings = []

        self._rebuild_indices()

    def _rebuild_indices(self) -> None:
        self._by_name = {s["name"].strip().lower(): s for s in self._mappings if "name" in s}
        self._by_face_id = {s["faceId"].strip(): s for s in self._mappings if "faceId" in s}
        self._by_roll = {s["rollNumber"].strip().upper(): s for s in self._mappings if "rollNumber" in s}

    def save(self) -> None:
        """Saves current mappings to disk."""
        self.mapping_file.parent.mkdir(parents=True, exist_ok=True)
        payload = {"students": self._mappings}
        self.mapping_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        self._rebuild_indices()

    def get_by_name(self, name: str) -> Optional[Dict]:
        return self._by_name.get(name.strip().lower())

    def get_by_face_id(self, face_id: str) -> Optional[Dict]:
        return self._by_face_id.get(face_id.strip())

    def get_by_roll(self, roll_number: str) -> Optional[Dict]:
        return self._by_roll.get(roll_number.strip().upper())

    def get_face_id(self, name: str) -> Optional[str]:
        student = self.get_by_name(name)
        return student.get("faceId") if student else None

    def get_all_students(self) -> List[Dict]:
        return list(self._mappings)

    def get_all_names(self) -> List[str]:
        return [s["name"] for s in self._mappings if "name" in s]

    def register_or_update(self, student_info: Dict) -> Dict:
        """
        Adds or updates a student record in the mapping without creating duplicates.
        Matches by rollNumber, faceId, or name.
        """
        name = student_info.get("name") or student_info.get("firstName")
        face_id = student_info.get("faceId")
        roll_number = student_info.get("rollNumber")

        if not face_id or not roll_number or not name:
            raise ValueError("Student must have name, faceId, and rollNumber.")

        # Find existing match
        existing_index = None
        for i, s in enumerate(self._mappings):
            if (
                s.get("faceId") == face_id
                or s.get("rollNumber", "").upper() == roll_number.upper()
                or s.get("name", "").lower() == name.lower()
            ):
                existing_index = i
                break

        record = {
            "name": name,
            "firstName": student_info.get("firstName", name),
            "lastName": student_info.get("lastName", ""),
            "rollNumber": roll_number,
            "faceId": face_id,
            "email": student_info.get("email"),
            "departmentCode": student_info.get("departmentCode", "CSE"),
            "semester": int(student_info.get("semester", 1)),
            "year": int(student_info.get("year", 1)),
            "status": student_info.get("status", "ACTIVE"),
        }

        if existing_index is not None:
            self._mappings[existing_index] = record
        else:
            self._mappings.append(record)

        self.save()
        return record
