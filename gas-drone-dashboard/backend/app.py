from flask import Flask, jsonify, request
from flask_cors import CORS

from db import connect, init_db, rows_to_dicts
from importer import import_mission, import_new_missions, risk_for_concentration
from sample_data import generate_sample_missions


app = Flask(__name__)
CORS(app)
init_db()


def mission_filter_clause(mission_id):
    if mission_id and mission_id != "all":
        return "WHERE mission_id = ?", (mission_id,)
    return "", ()


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/generate-samples")
def generate_samples():
    count = int(request.json.get("count", 10)) if request.is_json else 10
    files = generate_sample_missions(count=count)
    return jsonify({"generated": files})


@app.post("/api/import/scan")
def scan_import():
    return jsonify({"results": import_new_missions()})


@app.post("/api/import/upload")
def upload_import():
    if "file" not in request.files:
        return jsonify({"error": "CSV file field named 'file' is required"}), 400
    upload = request.files["file"]
    if not upload.filename.endswith(".csv"):
        return jsonify({"error": "Only CSV files are supported"}), 400
    from config import INCOMING_DIR

    INCOMING_DIR.mkdir(parents=True, exist_ok=True)
    target = INCOMING_DIR / upload.filename
    upload.save(target)
    return jsonify(import_mission(target))


@app.get("/api/missions")
def missions():
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM missions ORDER BY started_at DESC"
        ).fetchall()
    return jsonify(rows_to_dicts(rows))


@app.get("/api/overview")
def overview():
    with connect() as conn:
        mission_stats = conn.execute(
            """
            SELECT
                COUNT(*) AS total_missions,
                COALESCE(SUM(reading_count), 0) AS total_readings,
                MAX(ended_at) AS latest_mission_timestamp,
                COALESCE(MAX(max_concentration), 0) AS highest_gas_concentration,
                COALESCE(AVG(avg_concentration), 0) AS average_gas_concentration
            FROM missions
            """
        ).fetchone()
    highest = float(mission_stats["highest_gas_concentration"])
    payload = dict(mission_stats)
    payload["risk_level"] = risk_for_concentration(highest)
    return jsonify(payload)


@app.get("/api/readings")
def readings():
    mission_id = request.args.get("mission_id", "all")
    clause, params = mission_filter_clause(mission_id)
    limit = int(request.args.get("limit", 1200))
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT * FROM readings
            {clause}
            ORDER BY timestamp ASC
            LIMIT ?
            """,
            (*params, limit),
        ).fetchall()
    return jsonify(rows_to_dicts(rows))


@app.get("/api/charts")
def charts():
    mission_id = request.args.get("mission_id", "all")
    clause, params = mission_filter_clause(mission_id)
    with connect() as conn:
        readings = rows_to_dicts(
            conn.execute(
                f"""
                SELECT timestamp, mission_id, mq135, mq2, mq7, temperature,
                       humidity, concentration, latitude, longitude, risk_level
                FROM readings
                {clause}
                ORDER BY timestamp ASC
                """,
                params,
            ).fetchall()
        )
        missions = rows_to_dicts(
            conn.execute(
                """
                SELECT id, filename, started_at, reading_count, avg_concentration,
                       max_concentration, predicted_gas, confidence, risk_level
                FROM missions
                ORDER BY started_at ASC
                """
            ).fetchall()
        )
    return jsonify({"readings": readings, "missions": missions})


@app.get("/api/prediction")
def prediction():
    mission_id = request.args.get("mission_id", "all")
    with connect() as conn:
        if mission_id == "all":
            row = conn.execute(
                """
                SELECT predicted_gas, confidence, risk_level, max_concentration
                FROM missions
                ORDER BY ended_at DESC
                LIMIT 1
                """
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT predicted_gas, confidence, risk_level, max_concentration
                FROM missions
                WHERE id = ?
                """,
                (mission_id,),
            ).fetchone()
    if not row:
        return jsonify({"predicted_gas": "No mission data", "confidence": 0, "risk_level": "Safe"})
    return jsonify(dict(row))


if __name__ == "__main__":
    app.run(debug=True, port=5000)
