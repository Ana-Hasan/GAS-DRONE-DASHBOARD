import csv
import math
import random
from datetime import datetime, timedelta

from config import INCOMING_DIR, REQUIRED_COLUMNS


def generate_sample_missions(count=10, readings_per_mission=72):
    random.seed(42)
    INCOMING_DIR.mkdir(parents=True, exist_ok=True)
    base_time = datetime(2026, 6, 1, 9, 0, 0)
    base_lat, base_lon = 12.9716, 77.5946

    files = []
    for mission in range(1, count + 1):
        start = base_time + timedelta(days=mission - 1, hours=random.randint(0, 4))
        center_lat = base_lat + random.uniform(-0.035, 0.035)
        center_lon = base_lon + random.uniform(-0.035, 0.035)
        hazard_sensor = random.choice(["mq135", "mq2", "mq7"])
        hazard_peak = random.uniform(300, 760)
        wind_shift = random.uniform(-0.0009, 0.0009)
        path = INCOMING_DIR / f"mission_{mission:02d}_{start.strftime('%Y%m%d_%H%M')}.csv"

        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=REQUIRED_COLUMNS)
            writer.writeheader()
            for index in range(readings_per_mission):
                progress = index / max(1, readings_per_mission - 1)
                angle = progress * math.tau * 1.35 + mission * 0.4
                lat = center_lat + math.sin(angle) * 0.009 + progress * wind_shift
                lon = center_lon + math.cos(angle) * 0.011 - progress * wind_shift
                plume = math.exp(-((progress - 0.56) ** 2) / 0.028) * hazard_peak
                pulse = max(0, math.sin(progress * math.pi * 5 + mission)) * random.uniform(15, 55)
                baseline = 115 + mission * 7 + random.uniform(-16, 18)

                mq135 = baseline + random.uniform(0, 80) + pulse
                mq2 = baseline + random.uniform(0, 95) + pulse * 0.75
                mq7 = baseline + random.uniform(0, 70) + pulse * 0.6
                if hazard_sensor == "mq135":
                    mq135 += plume
                    mq2 += plume * 0.22
                    mq7 += plume * 0.15
                elif hazard_sensor == "mq2":
                    mq2 += plume
                    mq135 += plume * 0.2
                    mq7 += plume * 0.28
                else:
                    mq7 += plume
                    mq135 += plume * 0.18
                    mq2 += plume * 0.32

                temperature = 25 + math.sin(progress * math.pi) * 4 + random.uniform(-1.2, 1.2)
                humidity = 61 - math.sin(progress * math.pi) * 12 + random.uniform(-3.5, 3.5)

                writer.writerow(
                    {
                        "timestamp": (start + timedelta(seconds=index * 45)).isoformat(),
                        "latitude": f"{lat:.6f}",
                        "longitude": f"{lon:.6f}",
                        "mq135": f"{mq135:.2f}",
                        "mq2": f"{mq2:.2f}",
                        "mq7": f"{mq7:.2f}",
                        "temperature": f"{temperature:.2f}",
                        "humidity": f"{humidity:.2f}",
                    }
                )
        files.append(str(path))
    return files


if __name__ == "__main__":
    generated = generate_sample_missions()
    for item in generated:
        print(item)
