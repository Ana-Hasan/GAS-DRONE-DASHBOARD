import csv
import hashlib
import shutil
from datetime import datetime
from pathlib import Path

from config import ARCHIVE_DIR, INCOMING_DIR, REQUIRED_COLUMNS
from db import connect


GAS_LABELS = [
    ("CO / combustion gases", "mq7"),
    ("LPG / smoke vapors", "mq2"),
    ("Air-quality toxins", "mq135"),
]


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def risk_for_concentration(value):
    if value >= 620:
        return "Danger"
    if value >= 380:
        return "Warning"
    return "Safe"


def concentration(row):
    return max(float(row["mq135"]), float(row["mq2"]), float(row["mq7"]))


def predict_gas(readings):
    averages = {
        "mq135": sum(r["mq135"] for r in readings) / len(readings),
        "mq2": sum(r["mq2"] for r in readings) / len(readings),
        "mq7": sum(r["mq7"] for r in readings) / len(readings),
    }
    sensor = max(averages, key=averages.get)
    total = sum(averages.values()) or 1
    label = next(name for name, key in GAS_LABELS if key == sensor)
    confidence = min(0.97, 0.58 + (averages[sensor] / total) * 0.88)
    return label, round(confidence, 3)


def parse_csv(path):
    with path.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = [column for column in REQUIRED_COLUMNS if column not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"{path.name} is missing columns: {', '.join(missing)}")

        readings = []
        for raw in reader:
            item = {
                "timestamp": datetime.fromisoformat(raw["timestamp"]).isoformat(),
                "latitude": float(raw["latitude"]),
                "longitude": float(raw["longitude"]),
                "mq135": float(raw["mq135"]),
                "mq2": float(raw["mq2"]),
                "mq7": float(raw["mq7"]),
                "temperature": float(raw["temperature"]),
                "humidity": float(raw["humidity"]),
            }
            item["concentration"] = concentration(item)
            item["risk_level"] = risk_for_concentration(item["concentration"])
            readings.append(item)
    if not readings:
        raise ValueError(f"{path.name} has no readings")
    return readings


def import_mission(path):
    path = Path(path)
    digest = file_hash(path)
    with connect() as conn:
        existing = conn.execute(
            "SELECT id, filename FROM missions WHERE file_hash = ?", (digest,)
        ).fetchone()
        if existing:
            return {"status": "duplicate", "mission_id": existing["id"], "filename": existing["filename"]}

    readings = parse_csv(path)
    predicted_gas, confidence = predict_gas(readings)
    avg_concentration = sum(r["concentration"] for r in readings) / len(readings)
    max_concentration = max(r["concentration"] for r in readings)
    risk_level = risk_for_concentration(max_concentration)

    with connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO missions (
                filename, file_hash, started_at, ended_at, reading_count,
                avg_concentration, max_concentration, predicted_gas,
                confidence, risk_level
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                path.name,
                digest,
                readings[0]["timestamp"],
                readings[-1]["timestamp"],
                len(readings),
                avg_concentration,
                max_concentration,
                predicted_gas,
                confidence,
                risk_level,
            ),
        )
        mission_id = cursor.lastrowid
        conn.executemany(
            """
            INSERT INTO readings (
                mission_id, timestamp, latitude, longitude, mq135, mq2, mq7,
                temperature, humidity, concentration, risk_level
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    mission_id,
                    r["timestamp"],
                    r["latitude"],
                    r["longitude"],
                    r["mq135"],
                    r["mq2"],
                    r["mq7"],
                    r["temperature"],
                    r["humidity"],
                    r["concentration"],
                    r["risk_level"],
                )
                for r in readings
            ],
        )

    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    archived = ARCHIVE_DIR / path.name
    if path.parent == INCOMING_DIR:
        shutil.move(str(path), archived)
    return {"status": "imported", "mission_id": mission_id, "filename": path.name}


def import_new_missions():
    INCOMING_DIR.mkdir(parents=True, exist_ok=True)
    results = []
    for path in sorted(INCOMING_DIR.glob("*.csv")):
        try:
            results.append(import_mission(path))
        except Exception as exc:
            results.append({"status": "error", "filename": path.name, "error": str(exc)})
    return results
