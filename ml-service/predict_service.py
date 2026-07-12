"""
Desk Occupancy Prediction Microservice
Run: python predict_service.py
Port: 5001
"""

import os, json
import numpy as np
import pandas as pd
import joblib
from flask import Flask, request, jsonify, make_response
from train_model import train, FEATURES

app = Flask(__name__)
MODEL_PATH = os.path.join(os.path.dirname(__file__), "occupancy_model.pkl")
model = None

# ── CORS: add headers to EVERY response ──────────────────────────────────────
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response

@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        resp = make_response()
        resp.headers["Access-Control-Allow-Origin"]  = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.status_code = 200
        return resp

# ── Model loading ─────────────────────────────────────────────────────────────
def load_model():
    global model
    if os.path.exists(MODEL_PATH):
        model = joblib.load(MODEL_PATH)
        print(f"[ML] Model loaded from {MODEL_PATH}")
    else:
        print("[ML] No model found — POST /retrain with CSV data first")

def build_features(hour, minute, day_of_week, seat_num):
    row = {
        "hour":        hour,
        "minute":      minute,
        "day_of_week": day_of_week,
        "is_weekend":  int(day_of_week >= 5),
        "seat_num":    seat_num,
        "hour_sin":    np.sin(2 * np.pi * hour / 24),
        "hour_cos":    np.cos(2 * np.pi * hour / 24),
        "dow_sin":     np.sin(2 * np.pi * day_of_week / 7),
        "dow_cos":     np.cos(2 * np.pi * day_of_week / 7),
        "time_bucket": min(4, max(0, (hour - 6) // 3)),
    }
    return pd.DataFrame([row])[FEATURES]

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model_loaded": model is not None})

@app.route("/predict", methods=["POST", "OPTIONS"])
def predict():
    if model is None:
        return jsonify({"error": "Model not loaded"}), 503

    body = request.get_json(force=True)
    results = []
    for req in body.get("requests", []):
        try:
            seat_num    = int(req["seat_num"])
            hour        = int(req["hour"])
            minute      = int(req.get("minute", 0))
            day_of_week = int(req["day_of_week"])

            X    = build_features(hour, minute, day_of_week, seat_num)
            prob = float(model.predict_proba(X)[0][1])
            pred = 1 if prob >= 0.5 else 0
            conf = ("HIGH"   if prob >= 0.75 or prob <= 0.25 else
                    "MEDIUM" if prob >= 0.60 or prob <= 0.40 else "LOW")

            results.append({
                "seat_num":        seat_num,
                "seat_label":      f"Seat {seat_num}",
                "hour":            hour,
                "day_of_week":     day_of_week,
                "predicted":       pred,
                "probability":     round(prob, 3),
                "probability_pct": round(prob * 100),
                "label":           "Occupied" if pred == 1 else "Free",
                "confidence":      conf,
            })
        except (KeyError, ValueError) as e:
            results.append({"error": str(e), "input": req})

    return jsonify({"predictions": results})

@app.route("/predict/day", methods=["POST", "OPTIONS"])
def predict_day():
    if model is None:
        return jsonify({"error": "Model not loaded"}), 503

    body        = request.get_json(force=True)
    day_of_week = int(body.get("day_of_week", 0))
    seat_nums   = body.get("seat_nums", [1, 2, 3, 4])

    hours_data = []
    for hour in range(6, 23):
        row = {"hour": hour, "label": f"{hour:02d}:00"}
        for seat_num in seat_nums:
            X    = build_features(hour, 0, day_of_week, seat_num)
            prob = float(model.predict_proba(X)[0][1])
            row[f"Seat {seat_num}"] = round(prob * 100)
        hours_data.append(row)

    return jsonify({"day_of_week": day_of_week, "hours": hours_data})

@app.route("/retrain", methods=["POST", "OPTIONS"])
def retrain():
    csv_path = None
    if request.files.get("file"):
        import tempfile
        f   = request.files["file"]
        tmp = tempfile.NamedTemporaryFile(suffix=".csv", delete=False)
        f.save(tmp.name)
        csv_path = tmp.name
    elif request.is_json:
        csv_path = request.get_json().get("csv_path")

    if not csv_path or not os.path.exists(csv_path):
        return jsonify({"error": "No valid CSV provided"}), 400

    try:
        accuracy, f1 = train(csv_path, MODEL_PATH)
        load_model()
        return jsonify({"status": "retrained", "accuracy": round(accuracy, 3), "f1": round(f1, 3)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    load_model()
    port = int(os.environ.get("ML_PORT", 5001))
    print(f"[ML] Prediction service starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
