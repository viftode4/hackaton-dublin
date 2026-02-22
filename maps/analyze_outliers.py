"""
Analyze the worst performers of our Ridge regression model to understand what's missing.
"""
import pandas as pd
import numpy as np
import json

def analyze_outliers():
    # Load feature matrix and model
    df = pd.read_csv("feature_analysis.csv")
    with open("trained_model.json") as f:
        model = json.load(f)

    # Reconstruct predictions
    feats = model["features"]
    means = np.array(model["scaler_mean"])
    scales = np.array(model["scaler_scale"])
    coefs = np.array(model["coefficients"])
    intercept = model["intercept"]

    print("="*65)
    print("OUTLIER ANALYSIS")
    print("="*65)
    print(f"Model: {feats}")
    print(f"Weights: {np.round(coefs, 2)}")
    print(f"Intercept: {intercept:.1f}")

    results = []
    for _, row in df.iterrows():
        # skip rows with NaNs in features
        if row[feats].isna().any():
            continue
            
        region = row["region"]
        actual = row["ground_truth_ci"]
        
        x = row[feats].values.astype(float)
        x_scaled = (x - means) / scales
        pred = np.dot(coefs, x_scaled) + intercept
        error = pred - actual
        
        # Calculate how much each feature contributed to the final prediction
        contributions = x_scaled * coefs
        
        results.append({
            "region": region,
            "actual": actual,
            "pred": pred,
            "error": error,
            "abs_error": abs(error),
            "state": row.get("state", "None"),
            "country": row["country_iso"],
            **{f"{f}_raw": row[f] for f in feats},
            **{f"{f}_contrib": c for f, c in zip(feats, contributions)}
        })

    res_df = pd.DataFrame(results).sort_values("abs_error", ascending=False)
    
    print("\nTop 5 Worst Predictions:")
    print("-" * 65)
    for _, row in res_df.head(7).iterrows():
        print(f"\n❌ {row['region']} (in {row['country']}): Actual={row['actual']:.0f} vs Pred={row['pred']:.0f} (Error: {row['error']:+.0f})")
        print("  Breakdown:")
        print(f"    Base Intercept: +{intercept:.1f}")
        for f in feats:
            raw = row[f'{f}_raw']
            contrib = row[f'{f}_contrib']
            print(f"    + {f:25}: raw={raw:6.2f} -> contribution {contrib:+.1f}")
            
    print("\n="*65)
    print("Top 5 BEST Predictions (for comparison):")
    print("-" * 65)
    for _, row in res_df.sort_values("abs_error", ascending=True).head(3).iterrows():
        print(f"\n✅ {row['region']} (in {row['country']}): Actual={row['actual']:.0f} vs Pred={row['pred']:.0f} (Error: {row['error']:+.0f})")
        print("  Breakdown:")
        for f in feats:
            raw = row[f'{f}_raw']
            contrib = row[f'{f}_contrib']
            print(f"    + {f:25}: raw={raw:6.2f} -> contribution {contrib:+.1f}")

if __name__ == "__main__":
    analyze_outliers()
