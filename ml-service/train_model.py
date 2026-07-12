"""
train_model.py
--------------
Train a Random Forest classifier on occupancy_snapshot CSV data.

Usage (standalone):
    python train_model.py data.csv [output_model.pkl]

Imported by predict_service.py for the /retrain endpoint.

Features engineered:
  - hour, minute          : raw time
  - day_of_week           : 0=Mon … 6=Sun
  - is_weekend            : binary flag
  - seat_num              : which desk (1-4)
  - hour_sin / hour_cos   : cyclical encoding so 23:00 and 00:00 are close
  - dow_sin  / dow_cos    : cyclical encoding for day of week
  - time_bucket           : coarse bucket (morning/midday/afternoon/evening)

Model:
  RandomForestClassifier — robust to the small dataset size, handles
  class imbalance via class_weight='balanced', naturally gives
  calibrated probabilities via predict_proba.
"""

import sys, os
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.metrics import f1_score

FEATURES = [
    "hour", "minute", "day_of_week", "is_weekend",
    "seat_num", "hour_sin", "hour_cos", "dow_sin", "dow_cos", "time_bucket"
]

DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), "occupancy_model.pkl")


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add all ML features to the DataFrame in-place and return it."""
    df = df.copy()
    df["recorded_at"] = pd.to_datetime(df["recorded_at"], utc=True).dt.tz_convert("Asia/Kolkata")
    df["hour"]        = df["recorded_at"].dt.hour
    df["minute"]      = df["recorded_at"].dt.minute
    df["day_of_week"] = df["recorded_at"].dt.dayofweek       # 0=Mon
    df["is_weekend"]  = (df["day_of_week"] >= 5).astype(int)
    df["seat_num"]    = df["seat_id"].str.extract(r"(\d+)$").astype(int)

    # Cyclical encodings — prevent the model treating 23 and 0 as far apart
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)
    df["dow_sin"]  = np.sin(2 * np.pi * df["day_of_week"] / 7)
    df["dow_cos"]  = np.cos(2 * np.pi * df["day_of_week"] / 7)

    # Time bucket: 0=night(0-8), 1=morning(9-11), 2=midday(12-14),
    #              3=afternoon(15-17), 4=evening(18+)
    df["time_bucket"] = pd.cut(
        df["hour"], bins=[-1, 8, 11, 14, 17, 24],
        labels=[0, 1, 2, 3, 4]
    ).astype(int)

    return df


def train(csv_path: str, model_path: str = DEFAULT_MODEL_PATH):
    """
    Train on the CSV and save the model to model_path.
    Returns (cv_accuracy, cv_f1) as floats.
    """
    print(f"[train] Loading {csv_path} ...")
    df = pd.read_csv(csv_path)
    df = engineer_features(df)

    X = df[FEATURES]
    y = df["status"]

    print(f"[train] {len(df)} rows | {y.mean():.1%} occupied | {df['seat_num'].nunique()} seats")

    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=8,
        min_samples_leaf=5,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    acc_scores = cross_val_score(clf, X, y, cv=cv, scoring="accuracy")
    f1_scores  = cross_val_score(clf, X, y, cv=cv, scoring="f1")

    print(f"[train] CV accuracy: {acc_scores.mean():.3f} ± {acc_scores.std():.3f}")
    print(f"[train] CV F1:       {f1_scores.mean():.3f}  ± {f1_scores.std():.3f}")

    # Train final model on all data
    clf.fit(X, y)

    importances = pd.Series(clf.feature_importances_, index=FEATURES).sort_values(ascending=False)
    print("[train] Feature importances:")
    for feat, imp in importances.items():
        print(f"         {feat:15s}: {imp:.3f}")

    joblib.dump(clf, model_path)
    print(f"[train] Model saved → {model_path}")

    return float(acc_scores.mean()), float(f1_scores.mean())


if __name__ == "__main__":
    csv  = sys.argv[1] if len(sys.argv) > 1 else "data.csv"
    out  = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_MODEL_PATH
    acc, f1 = train(csv, out)
    print(f"\nFinal → accuracy={acc:.3f}  f1={f1:.3f}")
