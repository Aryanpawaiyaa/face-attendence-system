"""
Central, typed configuration for the Python face-recognition layer.
All values can be overridden through the project-root .env file.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def _path(env_key: str, default: Path) -> Path:
    p = Path(os.getenv(env_key, str(default)))
    return p if p.is_absolute() else ROOT / p


def _float(key: str, default: float) -> float:
    try:
        return float(os.getenv(key, str(default)))
    except ValueError:
        return default


def _int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, str(default)))
    except ValueError:
        return default


def _bool(key: str, default: bool) -> bool:
    return os.getenv(key, str(default)).strip().lower() in {"1", "true", "yes", "on"}


# ---------------------------------------------------------------- paths
RAW_DIR = _path("RAW_DIR", ROOT / "data" / "raw")
PEOPLE_DIR = _path("PEOPLE_DIR", ROOT / "data" / "people")
EMBEDDINGS_FILE = _path("EMBEDDINGS_FILE", ROOT / "data" / "embeddings" / "faces.npz")
GALLERY_FILE = _path("GALLERY_FILE", ROOT / "data" / "embeddings" / "gallery.npz")
GALLERY_META_FILE = GALLERY_FILE.with_suffix(".json")
ENROLL_DIR = _path("ENROLL_DIR", ROOT / "data" / "enrollments")
STUDENT_MAPPINGS_FILE = _path("STUDENT_MAPPINGS_FILE", ROOT / "data" / "mappings" / "student_mappings.json")
MODELS_ROOT = _path("INSIGHTFACE_HOME", Path.home() / ".insightface")
DB_FILE = ROOT / "data" / "attendance" / "attendance.db"

# ---------------------------------------------------------------- backend
BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://localhost:5001/api").rstrip("/")
DEVICE_CODE = os.getenv("DEVICE_CODE", "WEBCAM-DEV-01").strip()
DEVICE_API_KEY = os.getenv("DEVICE_API_KEY", "").strip()
COURSE_ID = os.getenv("COURSE_ID", "").strip() or None

# ---------------------------------------------------------------- ML service
ML_HOST = os.getenv("ML_HOST", "127.0.0.1")
ML_PORT = _int("ML_PORT", 5002)
ML_SHARED_SECRET = os.getenv("ML_SHARED_SECRET", "").strip()

# Model pack. buffalo_l = SCRFD-10GF detector + ArcFace ResNet50 (WebFace600K).
# antelopev2 = SCRFD-10GF + ArcFace ResNet100 (Glint360K) - heavier.
FACE_MODEL = os.getenv("FACE_MODEL", "buffalo_l").strip()
DET_SIZE = _int("DET_SIZE", 640)
DET_THRESH = _float("DET_THRESH", 0.5)
USE_GPU = _bool("USE_GPU", True)  # falls back to CPU automatically

# ---------------------------------------------------------------- recognition
MATCH_THRESHOLD = _float("RECOGNITION_THRESHOLD", 0.45)
MATCH_MARGIN = _float("RECOGNITION_MARGIN", 0.05)
MIN_FACE_SIZE = _int("MIN_FACE_SIZE", 60)
REQUIRED_STABLE_FRAMES = _int("RECOGNITION_CONSISTENCY_FRAMES", 3)
ATTENDANCE_COOLDOWN_SECONDS = _int("ATTENDANCE_COOLDOWN_SECONDS", 30)
CAMERA_INDEX = _int("CAMERA_INDEX", 0)

# ---------------------------------------------------------------- quality gates
QUALITY_MIN_DET_SCORE = _float("QUALITY_MIN_DET_SCORE", 0.6)
QUALITY_MIN_BLUR = _float("QUALITY_MIN_BLUR", 35.0)
QUALITY_MAX_YAW = _float("QUALITY_MAX_YAW", 0.28)
ENROLL_MIN_SAMPLES = _int("ENROLL_MIN_SAMPLES", 3)
ENROLL_MAX_SAMPLES = _int("ENROLL_MAX_SAMPLES", 30)

# ---------------------------------------------------------------- anti-spoofing
# Optional MiniFASNet ONNX (Silent-Face-Anti-Spoofing 2.7_80x80_MiniFASNetV2).
ANTISPOOF_MODEL = os.getenv("ANTISPOOF_MODEL", "").strip()
ANTISPOOF_THRESHOLD = _float("ANTISPOOF_THRESHOLD", 0.6)

# ---------------------------------------------------------------- streams
STREAM_PROCESS_INTERVAL = _float("STREAM_PROCESS_INTERVAL", 0.35)
STREAM_UNKNOWN_COOLDOWN = _int("STREAM_UNKNOWN_COOLDOWN", 20)

PEOPLE = ["Rajat", "Priyanka", "Pushpendra"]
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG", ".WEBP"}


def validate_config(require_device_key: bool = False) -> tuple[bool, list[str]]:
    issues = []
    if not BACKEND_API_URL.startswith(("http://", "https://")):
        issues.append(f"BACKEND_API_URL must be an HTTP(S) URL. Got: {BACKEND_API_URL}")
    if not DEVICE_CODE:
        issues.append("DEVICE_CODE is empty.")
    if require_device_key and not DEVICE_API_KEY:
        issues.append("DEVICE_API_KEY is not configured in .env.")
    if not 0.0 < MATCH_THRESHOLD < 1.0:
        issues.append(f"RECOGNITION_THRESHOLD must be between 0 and 1. Got: {MATCH_THRESHOLD}")
    if REQUIRED_STABLE_FRAMES < 1:
        issues.append(f"RECOGNITION_CONSISTENCY_FRAMES must be >= 1. Got: {REQUIRED_STABLE_FRAMES}")
    return len(issues) == 0, issues
