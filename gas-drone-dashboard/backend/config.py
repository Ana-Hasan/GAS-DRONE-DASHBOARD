from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
INCOMING_DIR = DATA_DIR / "incoming_missions"
ARCHIVE_DIR = DATA_DIR / "imported_missions"
DB_PATH = DATA_DIR / "missions.db"

REQUIRED_COLUMNS = [
    "timestamp",
    "latitude",
    "longitude",
    "mq135",
    "mq2",
    "mq7",
    "temperature",
    "humidity",
]
