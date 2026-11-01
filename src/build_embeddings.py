"""
Bulk-import face photos from data/people/<Name>/ into the multi-sample gallery.

Usually you do NOT need this anymore: teachers enrol faces from the web UI
(Students -> Enrol Face). This script is kept for offline/batch enrolment.

    python -m src.build_embeddings               # all students in mappings
    python -m src.build_embeddings --student Rajat
"""
import argparse
import sys
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2  # noqa: E402

from src.config import IMAGE_EXTENSIONS, PEOPLE_DIR  # noqa: E402
from src.face_engine import FaceEngine  # noqa: E402
from src.gallery import FaceGallery  # noqa: E402
from src.stream_manager import crop_face, encode_jpeg  # noqa: E402
from src.student_mapping import StudentMappingManager  # noqa: E402


def build_embeddings(target_student: Optional[str] = None, engine: Optional[FaceEngine] = None) -> dict:
    engine = engine or FaceEngine()
    gallery = FaceGallery(model_name=engine.model_name)
    mapping = StudentMappingManager()
    students = mapping.get_all_students()
    if target_student:
        students = [s for s in students if s["name"].lower() == target_student.lower()] or [
            {"name": target_student, "faceId": f"FACE-{target_student.upper()}"}
        ]

    stats = {}
    for s in students:
        name = s["name"]
        face_id = s.get("faceId") or f"FACE-{name.upper()}"
        folder = PEOPLE_DIR / name
        if not folder.exists():
            print(f"[skip] {name}: folder {folder} not found")
            continue
        embs, used = [], 0
        files = sorted(p for p in folder.iterdir() if p.suffix in IMAGE_EXTENSIONS)
        gallery.remove(face_id, delete_images=True)
        for p in files:
            img = cv2.imread(str(p))
            if img is None:
                continue
            face = engine._largest_face(engine.detect_frame(img))
            if face is None:
                print(f"  [warn] no face in {p.name}")
                continue
            q = FaceEngine.assess_quality(img, face, strict=False)
            if q["score"] < 0.35:
                print(f"  [warn] low quality {p.name}: {q['issues']}")
                continue
            embs.append(engine.normalized_embedding(face))
            gallery.store_image(face_id, encode_jpeg(crop_face(img, face.bbox, pad=0.6), 92))
            used += 1
        if embs:
            full = f"{s.get('firstName', name)} {s.get('lastName', '')}".strip()
            gallery.add(face_id, embs, {"name": full, "rollNumber": s.get("rollNumber"),
                                        "studentId": s.get("backendStudentId"), "model": engine.model_name})
        stats[name] = {"faceId": face_id, "images": len(files), "usable": used}
        print(f"  {name} ({face_id}): {used}/{len(files)} usable")
    return stats


def main():
    ap = argparse.ArgumentParser(description="Bulk enrol faces from data/people into the gallery")
    ap.add_argument("--student", default=None)
    args = ap.parse_args()
    build_embeddings(args.student)


if __name__ == "__main__":
    main()
