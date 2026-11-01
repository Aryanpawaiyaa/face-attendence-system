import json
import shutil
from pathlib import Path

import cv2

from src.config import RAW_DIR, PEOPLE_DIR, PEOPLE
from src.student_mapping import StudentMappingManager

STATE_FILE = RAW_DIR / "labels.json"
WINDOW = "Dataset Labeler"
DISPLAY_W = 1200
DISPLAY_H = 760


def load_state():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    mapping_mgr = StudentMappingManager()
    all_students = mapping_mgr.get_all_students()

    # Ensure folders exist
    for student in all_students:
        (PEOPLE_DIR / student["name"]).mkdir(parents=True, exist_ok=True)

    # Build key mapping preserving: 1 = Rajat, 2 = Priyanka, 3 = Pushpendra
    key_mapping = {
        ord("1"): "Rajat",
        ord("2"): "Priyanka",
        ord("3"): "Pushpendra",
    }
    # Add any extra students beyond the top 3 with keys 4..9
    extra_students = [s["name"] for s in all_students if s["name"] not in {"Rajat", "Priyanka", "Pushpendra"}]
    for i, name in enumerate(extra_students[:6]):
        key_mapping[ord(str(4 + i))] = name

    shortcut_descriptions = "1 Rajat | 2 Priyanka | 3 Pushpendra"
    if extra_students:
        extra_desc = " | ".join(f"{4+i} {n}" for i, n in enumerate(extra_students[:6]))
        shortcut_descriptions += f" | {extra_desc}"
    shortcut_descriptions += " | S Skip | B Back | Q Quit"

    files = sorted([p for p in RAW_DIR.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}])
    if not files:
        print(f"No images found in {RAW_DIR}")
        print("Copy the JPG files from your supplied dataset into data/raw/ and run again.")
        return

    state = load_state()
    index = 0

    while 0 <= index < len(files):
        path = files[index]
        assigned = state.get(path.name)

        image = cv2.imread(str(path))
        if image is None:
            index += 1
            continue

        h, w = image.shape[:2]
        scale = min(DISPLAY_W / w, DISPLAY_H / h, 1.0)
        display = cv2.resize(image, (int(w * scale), int(h * scale)))

        # Header info
        cv2.putText(
            display,
            f"{index + 1}/{len(files)}  {path.name}",
            (20, 35),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 255, 255),
            2,
        )

        # Footer shortcut keys
        cv2.putText(
            display,
            shortcut_descriptions,
            (20, display.shape[0] - 20),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            2,
        )

        if assigned:
            student_meta = mapping_mgr.get_by_name(assigned)
            face_id = student_meta.get("faceId") if student_meta else ""
            status_text = f"Already labeled: {assigned} [{face_id}]" if face_id else f"Already labeled: {assigned}"
            cv2.putText(display, status_text, (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        cv2.imshow(WINDOW, display)
        key = cv2.waitKey(0) & 0xFF

        if key in key_mapping:
            person = key_mapping[key]
            destination = PEOPLE_DIR / person / path.name
            shutil.copy2(path, destination)
            state[path.name] = person
            save_state(state)
            index += 1
        elif key == ord("s"):
            state[path.name] = "SKIP"
            save_state(state)
            index += 1
        elif key == ord("b"):
            index = max(0, index - 1)
        elif key == ord("q") or key == 27:
            break

    cv2.destroyAllWindows()
    print("Labeling complete.")
    print("Next: python src/build_embeddings.py")


if __name__ == "__main__":
    main()
