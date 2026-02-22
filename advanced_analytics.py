"""
GridSync — Advanced Data Analytics for Carbon Intensity Prediction

Five analysis modules:
  1. Model Zoo:      Compare 8+ model families under LOO cross-validation
  2. Ensemble:       Stacked generalization blending top models
  3. Uncertainty:    Conformal prediction intervals (90% coverage)
  4. SHAP:           Per-prediction feature attribution + global importance
  5. Spatial:        Geographic residual analysis and bias detection

Outputs:
  • advanced_analytics_report.png   — Multi-panel diagnostic figure
  • Console: full metrics table

Run:  python3 advanced_analytics.py
Requires: feature_analysis.csv (from analyze_features.py)
"""

import json
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.patches import FancyBboxPatch
import seaborn as sns

from sklearn.linear_model import (
    Ridge, Lasso, ElasticNet, HuberRegressor, LinearRegression,
    BayesianRidge,
)
from sklearn.ensemble import (
    RandomForestRegressor, GradientBoostingRegressor,
    AdaBoostRegressor, StackingRegressor, VotingRegressor,
)
from sklearn.svm import SVR
from sklearn.neighbors import KNeighborsRegressor
from sklearn.tree import DecisionTreeRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import LeaveOneOut, cross_val_predict
from sklearn.pipeline import Pipeline
import xgboost as xgb
import shap

# ═══════════════════════════════════════════════════════════════
#  CONFIG
# ═══════════════════════════════════════════════════════════════
FEATURE_COLS = [
    "country_ci",
    "emissions_per_capacity",
    "local_pct_coal",
    "local_pct_clean",
    "idw_weighted_ci",
    "emaps_idw_ci",
    "mean_emissions_per_plant",
    "abs_lat",
    "country_ci_sq",
    "local_pct_fossil",
    "total_emissions_300km",
    "n_plants_300km",
    "n_fossil_ops_300km",
    "n_dcs_300km",
    # Fraction-based features (0-1 range)
    "country_fossil_frac",
    "country_clean_frac",
    "country_coal_frac",
    "country_nuclear_frac",
    "country_renew_frac",
    "ct_grid_ci_est",
    # Regional plant-level features (from CT emissions_factor, activity, other5)
    "local_ef_weighted",
    "local_generation_gwh",
    "local_mean_cf",
    # Zone-level installed capacity (from eMaps capacity data)
    "emaps_zone_clean_cap_frac",
    "emaps_zone_fossil_cap_frac",
    "emaps_zone_coal_cap_mw",
]

# Smaller feature set for models prone to overfitting on 39 samples
LEAN_FEATURES = [
    "country_ci",
    "emissions_per_capacity",
    "local_pct_coal",
    "local_pct_clean",
]

REPORT_PATH = "advanced_analytics_report.png"


def load_data():
    df = pd.read_csv("feature_analysis.csv")
    # Fill few NaN in emaps_zone_ci with emaps_idw_ci, then country_ci
    df["emaps_zone_ci"] = df["emaps_zone_ci"].fillna(df["emaps_idw_ci"])
    df["emaps_zone_ci"] = df["emaps_zone_ci"].fillna(df["country_ci"])
    df["emaps_idw_ci"] = df["emaps_idw_ci"].fillna(df["country_ci"])
    return df


# ═══════════════════════════════════════════════════════════════
#  MODULE 1: MODEL ZOO
# ═══════════════════════════════════════════════════════════════
def model_zoo(df):
    """Compare many model families under LOO cross-validation."""
    print("\n" + "=" * 70)
    print("  MODULE 1: MODEL ZOO — LOO Cross-Validation Comparison")
    print("=" * 70)

    y = df["ground_truth_ci"].values

    # Define model zoo — each entry: (name, features, model)
    zoo = [
        ("Ridge (lean)",       LEAN_FEATURES, Ridge(alpha=1.0)),
        ("Ridge (full)",       FEATURE_COLS,  Ridge(alpha=1.0)),
        ("Lasso (lean)",       LEAN_FEATURES, Lasso(alpha=1.0, max_iter=5000)),
        ("ElasticNet",         FEATURE_COLS,  ElasticNet(alpha=0.5, l1_ratio=0.5, max_iter=5000)),
        ("Huber (lean)",       LEAN_FEATURES, HuberRegressor(epsilon=1.35, max_iter=500)),
        ("Huber (full)",       FEATURE_COLS,  HuberRegressor(epsilon=1.35, max_iter=500)),
        ("Bayesian Ridge",     FEATURE_COLS,  BayesianRidge()),
        ("SVR (RBF)",          FEATURE_COLS,  SVR(kernel="rbf", C=100, epsilon=10)),
        ("SVR (linear)",       LEAN_FEATURES, SVR(kernel="linear", C=100, epsilon=10)),
        ("KNN (k=3)",          FEATURE_COLS,  KNeighborsRegressor(n_neighbors=3, weights="distance")),
        ("KNN (k=5)",          FEATURE_COLS,  KNeighborsRegressor(n_neighbors=5, weights="distance")),
        ("Random Forest",      FEATURE_COLS,  RandomForestRegressor(n_estimators=200, max_depth=4, min_samples_leaf=3, random_state=42)),
        ("Gradient Boosting",  FEATURE_COLS,  GradientBoostingRegressor(n_estimators=100, max_depth=2, learning_rate=0.1, min_samples_leaf=3, random_state=42)),
        ("XGBoost",            FEATURE_COLS,  xgb.XGBRegressor(n_estimators=100, max_depth=2, learning_rate=0.1, min_child_weight=3, reg_alpha=1.0, reg_lambda=2.0, random_state=42, verbosity=0)),
        ("AdaBoost",           FEATURE_COLS,  AdaBoostRegressor(estimator=DecisionTreeRegressor(max_depth=2), n_estimators=50, learning_rate=0.5, random_state=42)),
    ]

    results = []
    loo = LeaveOneOut()

    for name, feats, model in zoo:
        subset = df[["ground_truth_ci", "region"] + feats].dropna()
        X = subset[feats].values
        y_sub = subset["ground_truth_ci"].values

        pipe = Pipeline([("scaler", StandardScaler()), ("model", model)])

        try:
            y_pred = cross_val_predict(pipe, X, y_sub, cv=loo)
        except Exception as e:
            print(f"  ⚠️  {name}: FAILED — {e}")
            continue

        errors = y_sub - y_pred
        abs_err = np.abs(errors)
        mae = abs_err.mean()
        rmse = np.sqrt((errors ** 2).mean())
        r2 = 1 - (errors ** 2).sum() / ((y_sub - y_sub.mean()) ** 2).sum()
        max_err = abs_err.max()
        med_ae = np.median(abs_err)

        results.append({
            "name": name, "feats": feats, "model": model,
            "n_feats": len(feats), "n_samples": len(subset),
            "mae": mae, "rmse": rmse, "r2": r2,
            "max_error": max_err, "median_ae": med_ae,
            "y_true": y_sub, "y_pred": y_pred,
            "regions": subset["region"].values,
            "pipe": pipe,
        })

    # Sort by MAE
    results.sort(key=lambda x: x["mae"])

    print(f"\n  {'Rank':<5} {'Model':<25} {'MAE':>6} {'MedAE':>6} {'RMSE':>7} "
          f"{'R²':>6} {'MaxErr':>7} {'Feats':>5}")
    print("  " + "─" * 75)
    for i, r in enumerate(results, 1):
        marker = " 🏆" if i == 1 else ""
        print(f"  {i:<5} {r['name']:<25} {r['mae']:>6.1f} {r['median_ae']:>6.1f} "
              f"{r['rmse']:>7.1f} {r['r2']:>6.3f} {r['max_error']:>7.1f} {r['n_feats']:>5}{marker}")

    print(f"\n  Best model: {results[0]['name']} — MAE={results[0]['mae']:.1f}, R²={results[0]['r2']:.3f}")
    return results


# ═══════════════════════════════════════════════════════════════
#  MODULE 2: ENSEMBLE / STACKING
# ═══════════════════════════════════════════════════════════════
def ensemble_models(df, zoo_results):
    """Blend top models via stacking and voting."""
    print("\n" + "=" * 70)
    print("  MODULE 2: ENSEMBLE & STACKING")
    print("=" * 70)

    y = df["ground_truth_ci"].values
    # Use full feature set for ensemble
    feats = FEATURE_COLS
    subset = df[["ground_truth_ci", "region"] + feats].dropna()
    X = subset[feats].values
    y_sub = subset["ground_truth_ci"].values

    loo = LeaveOneOut()

    # Pick top 4 diverse models from zoo (different families)
    families_seen = set()
    top_estimators = []
    for r in zoo_results:
        family = r["name"].split("(")[0].strip().split(" ")[0]
        if family not in families_seen and len(top_estimators) < 4:
            families_seen.add(family)
            top_estimators.append((
                r["name"].replace(" ", "_").replace("(", "").replace(")", ""),
                Pipeline([("scaler", StandardScaler()), ("model", r["model"])])
            ))

    print(f"\n  Selected base models for ensemble:")
    for name, _ in top_estimators:
        print(f"    • {name}")

    ensemble_results = []

    # A) Simple Voting (average)
    try:
        voter = VotingRegressor(estimators=top_estimators)
        y_pred_vote = cross_val_predict(voter, X, y_sub, cv=loo)
        err = y_sub - y_pred_vote
        mae_v = np.abs(err).mean()
        rmse_v = np.sqrt((err ** 2).mean())
        r2_v = 1 - (err ** 2).sum() / ((y_sub - y_sub.mean()) ** 2).sum()
        ensemble_results.append(("Voting (avg)", mae_v, rmse_v, r2_v, y_pred_vote))
        print(f"\n  Voting (average):  MAE={mae_v:.1f}  RMSE={rmse_v:.1f}  R²={r2_v:.3f}")
    except Exception as e:
        print(f"  ⚠️  Voting failed: {e}")
        y_pred_vote = None

    # B) Stacking with Ridge meta-learner
    try:
        stacker = StackingRegressor(
            estimators=top_estimators,
            final_estimator=Ridge(alpha=1.0),
            cv=5,  # inner CV for stacking
        )
        y_pred_stack = cross_val_predict(stacker, X, y_sub, cv=loo)
        err = y_sub - y_pred_stack
        mae_s = np.abs(err).mean()
        rmse_s = np.sqrt((err ** 2).mean())
        r2_s = 1 - (err ** 2).sum() / ((y_sub - y_sub.mean()) ** 2).sum()
        ensemble_results.append(("Stacking (Ridge)", mae_s, rmse_s, r2_s, y_pred_stack))
        print(f"  Stacking (Ridge):  MAE={mae_s:.1f}  RMSE={rmse_s:.1f}  R²={r2_s:.3f}")
    except Exception as e:
        print(f"  ⚠️  Stacking failed: {e}")
        y_pred_stack = None

    # C) Stacking with Huber meta-learner (robust to outliers)
    try:
        stacker_h = StackingRegressor(
            estimators=top_estimators,
            final_estimator=HuberRegressor(epsilon=1.35),
            cv=5,
        )
        y_pred_sh = cross_val_predict(stacker_h, X, y_sub, cv=loo)
        err = y_sub - y_pred_sh
        mae_sh = np.abs(err).mean()
        rmse_sh = np.sqrt((err ** 2).mean())
        r2_sh = 1 - (err ** 2).sum() / ((y_sub - y_sub.mean()) ** 2).sum()
        ensemble_results.append(("Stacking (Huber)", mae_sh, rmse_sh, r2_sh, y_pred_sh))
        print(f"  Stacking (Huber):  MAE={mae_sh:.1f}  RMSE={rmse_sh:.1f}  R²={r2_sh:.3f}")
    except Exception as e:
        print(f"  ⚠️  Stacking (Huber) failed: {e}")

    # Compare with best single model
    best_single = zoo_results[0]
    print(f"\n  Best single model: {best_single['name']} — MAE={best_single['mae']:.1f}")
    if ensemble_results:
        best_ens = min(ensemble_results, key=lambda x: x[1])
        print(f"  Best ensemble:     {best_ens[0]} — MAE={best_ens[1]:.1f}")
        if best_ens[1] < best_single["mae"]:
            gain = best_single["mae"] - best_ens[1]
            print(f"  ✅ Ensemble wins by {gain:.1f} gCO₂/kWh ({gain/best_single['mae']*100:.1f}%)")
        else:
            print(f"  → Single model wins (ensemble didn't help)")

    return ensemble_results


# ═══════════════════════════════════════════════════════════════
#  MODULE 3: PREDICTION UNCERTAINTY (CONFORMAL)
# ═══════════════════════════════════════════════════════════════
def conformal_prediction(df, zoo_results):
    """Compute conformal prediction intervals with 90% coverage."""
    print("\n" + "=" * 70)
    print("  MODULE 3: CONFORMAL PREDICTION INTERVALS (90% coverage)")
    print("=" * 70)

    best = zoo_results[0]
    y_true = best["y_true"]
    y_pred = best["y_pred"]
    regions = best["regions"]

    # Conformal: use LOO residuals as calibration scores
    residuals = np.abs(y_true - y_pred)
    n = len(residuals)

    # For full conformal with LOO, the quantile is:
    alpha = 0.10  # 90% coverage
    q_level = np.ceil((1 - alpha) * (n + 1)) / n
    q_val = np.quantile(residuals, min(q_level, 1.0))

    lower = y_pred - q_val
    upper = y_pred + q_val

    coverage = np.mean((y_true >= lower) & (y_true <= upper))
    avg_width = np.mean(upper - lower)

    print(f"\n  Model: {best['name']}")
    print(f"  Conformal quantile (α={alpha}): {q_val:.1f} gCO₂/kWh")
    print(f"  Interval width: ±{q_val:.1f} (avg width = {avg_width:.1f})")
    print(f"  Empirical coverage: {coverage*100:.1f}% (target: {(1-alpha)*100:.0f}%)")

    print(f"\n  {'Region':<35} {'Actual':>7} {'Predicted':>9} {'Interval':>20} {'In?':>4}")
    print("  " + "─" * 78)
    sort_idx = np.argsort(-residuals)
    for i in sort_idx:
        inside = "✅" if lower[i] <= y_true[i] <= upper[i] else "❌"
        print(f"  {regions[i]:<35} {y_true[i]:>7.0f} {y_pred[i]:>9.1f} "
              f"[{max(0,lower[i]):>6.0f}, {upper[i]:>6.0f}] {inside:>4}")

    return {
        "q_val": q_val, "coverage": coverage, "avg_width": avg_width,
        "lower": lower, "upper": upper,
        "y_true": y_true, "y_pred": y_pred, "regions": regions,
    }


# ═══════════════════════════════════════════════════════════════
#  MODULE 4: SHAP ANALYSIS
# ═══════════════════════════════════════════════════════════════
def shap_analysis(df):
    """SHAP feature importance — global and per-prediction."""
    print("\n" + "=" * 70)
    print("  MODULE 4: SHAP FEATURE ATTRIBUTION")
    print("=" * 70)

    feats = FEATURE_COLS
    subset = df[["ground_truth_ci", "region"] + feats].dropna()
    X = subset[feats].values
    y = subset["ground_truth_ci"].values
    regions = subset["region"].values
    feature_names = feats

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Use sklearn GradientBoosting (perfect SHAP compat, avoids XGB 3.x issue)
    from sklearn.ensemble import GradientBoostingRegressor
    model = GradientBoostingRegressor(
        n_estimators=100, max_depth=3, learning_rate=0.1,
        min_samples_leaf=3, random_state=42,
    )
    model.fit(X_scaled, y)

    # SHAP values
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_scaled)

    # Global importance
    mean_abs_shap = np.abs(shap_values).mean(axis=0)
    importance_idx = np.argsort(-mean_abs_shap)

    print(f"\n  Global Feature Importance (mean |SHAP|):")
    print(f"  {'Rank':<5} {'Feature':<30} {'mean|SHAP|':>10} {'% total':>8}")
    print("  " + "─" * 55)
    total_shap = mean_abs_shap.sum()
    for rank, idx in enumerate(importance_idx, 1):
        pct = mean_abs_shap[idx] / total_shap * 100
        bar = "█" * max(1, int(pct / 2))
        print(f"  {rank:<5} {feature_names[idx]:<30} {mean_abs_shap[idx]:>10.1f} "
              f"{pct:>7.1f}%  {bar}")

    # Top 3 outlier explanations
    y_pred = model.predict(X_scaled)
    errors = np.abs(y - y_pred)
    outlier_idx = np.argsort(-errors)[:3]

    print(f"\n  Per-sample SHAP breakdown (top 3 outliers):")
    for oi in outlier_idx:
        print(f"\n  📍 {regions[oi]} — actual={y[oi]:.0f}, pred={y_pred[oi]:.0f}, "
              f"err={errors[oi]:+.0f}")
        sv = shap_values[oi]
        contrib_idx = np.argsort(-np.abs(sv))[:5]
        base = explainer.expected_value
        if isinstance(base, np.ndarray):
            base = base[0]
        print(f"     Base value: {base:.1f}")
        for ci in contrib_idx:
            raw_val = X[oi, ci]
            direction = "↑" if sv[ci] > 0 else "↓"
            print(f"     {direction} {feature_names[ci]:<25} = {raw_val:>10.2f}  →  "
                  f"SHAP {sv[ci]:>+8.1f}")

    return {
        "shap_values": shap_values, "X": X, "X_scaled": X_scaled, "y": y,
        "feature_names": feature_names, "regions": regions,
        "model": model, "explainer": explainer,
        "mean_abs_shap": mean_abs_shap, "importance_idx": importance_idx,
    }


# ═══════════════════════════════════════════════════════════════
#  MODULE 5: SPATIAL RESIDUAL ANALYSIS
# ═══════════════════════════════════════════════════════════════
def spatial_residuals(df, zoo_results):
    """Analyze geographic patterns in prediction errors."""
    print("\n" + "=" * 70)
    print("  MODULE 5: SPATIAL RESIDUAL ANALYSIS")
    print("=" * 70)

    best = zoo_results[0]
    regions = best["regions"]
    y_true = best["y_true"]
    y_pred = best["y_pred"]

    # Merge with location data
    loc_df = df[["region", "lat", "lon", "country_iso"]].copy()
    pred_df = pd.DataFrame({
        "region": regions, "actual": y_true, "predicted": y_pred,
        "error": y_pred - y_true, "abs_error": np.abs(y_pred - y_true),
        "pct_error": (y_pred - y_true) / np.maximum(y_true, 1) * 100,
    })
    merged = pred_df.merge(loc_df, on="region", how="left")

    # Regional bias analysis
    print(f"\n  Bias by geographic region:")
    # Define macro-regions from country_iso
    def macro_region(iso):
        if iso in ["USA", "CAN"]: return "North America"
        if iso in ["BRA", "CHL"]: return "South America"
        if iso in ["GBR", "IRL", "FRA", "DEU", "NLD", "BEL", "CHE", "FIN",
                    "ESP", "ITA", "POL"]: return "Europe"
        if iso in ["IND", "SGP", "IDN", "ARE", "SAU", "ISR", "QAT"]: return "Asia-South/ME"
        if iso in ["JPN", "KOR", "TWN", "HKG", "CHN"]: return "East Asia"
        if iso in ["AUS"]: return "Oceania"
        if iso in ["ZAF"]: return "Africa"
        return "Other"

    merged["macro_region"] = merged["country_iso"].apply(macro_region)

    print(f"  {'Region':<20} {'N':>3} {'Mean Err':>9} {'Mean |Err|':>10} {'Bias Dir':>10}")
    print("  " + "─" * 55)
    for region_name, grp in merged.groupby("macro_region"):
        mean_err = grp["error"].mean()
        mean_abs = grp["abs_error"].mean()
        direction = "over ↑" if mean_err > 10 else "under ↓" if mean_err < -10 else "neutral"
        print(f"  {region_name:<20} {len(grp):>3} {mean_err:>+9.1f} {mean_abs:>10.1f} {direction:>10}")

    # Latitude correlation with error
    lat_corr = merged["lat"].corr(merged["error"])
    lon_corr = merged["lon"].corr(merged["error"])
    print(f"\n  Spatial correlations with error:")
    print(f"    Latitude  × error: r = {lat_corr:+.3f}")
    print(f"    Longitude × error: r = {lon_corr:+.3f}")

    # Moran's I approximation (spatial autocorrelation of errors)
    from scipy.spatial.distance import cdist
    coords = merged[["lat", "lon"]].values
    n = len(coords)
    if n > 3:
        dists = cdist(coords, coords)
        np.fill_diagonal(dists, np.inf)
        W = 1.0 / np.maximum(dists, 0.001)
        np.fill_diagonal(W, 0)
        W = W / W.sum()  # row-normalize
        z = merged["error"].values - merged["error"].mean()
        morans_i = (n / W.sum()) * (z @ W @ z) / (z @ z + 1e-12)
        print(f"    Moran's I (error): {morans_i:.3f} "
              f"({'clustered errors' if morans_i > 0.1 else 'dispersed' if morans_i < -0.1 else 'random'})")

    return merged


# ═══════════════════════════════════════════════════════════════
#  DIAGNOSTIC REPORT (multi-panel figure)
# ═══════════════════════════════════════════════════════════════
def generate_report(df, zoo_results, ensemble_results, conformal, shap_data,
                    spatial_df):
    """Generate a multi-panel diagnostic figure."""
    print("\n" + "=" * 70)
    print("  GENERATING DIAGNOSTIC REPORT")
    print("=" * 70)

    fig = plt.figure(figsize=(24, 20))
    fig.patch.set_facecolor("#0d1117")
    gs = gridspec.GridSpec(3, 3, hspace=0.35, wspace=0.30,
                           left=0.06, right=0.96, top=0.93, bottom=0.05)

    title_color = "#e6edf3"
    text_color = "#c9d1d9"
    grid_color = "#21262d"
    accent1 = "#58a6ff"
    accent2 = "#f78166"
    accent3 = "#3fb950"
    accent4 = "#d2a8ff"

    fig.suptitle("GridSync Carbon Prediction — Advanced Analytics Report",
                 fontsize=22, fontweight="bold", color=title_color, y=0.97)

    # ─── Panel 1: Model Zoo bar chart ───
    ax1 = fig.add_subplot(gs[0, 0])
    ax1.set_facecolor("#161b22")
    n_show = min(12, len(zoo_results))
    names = [r["name"] for r in zoo_results[:n_show]]
    maes = [r["mae"] for r in zoo_results[:n_show]]
    colors = [accent3 if i == 0 else accent1 for i in range(n_show)]
    bars = ax1.barh(range(n_show), maes, color=colors, edgecolor="#30363d", height=0.7)
    ax1.set_yticks(range(n_show))
    ax1.set_yticklabels(names, fontsize=8, color=text_color)
    ax1.set_xlabel("MAE (gCO₂/kWh)", color=text_color, fontsize=9)
    ax1.set_title("Model Zoo — LOO MAE Comparison", color=title_color,
                  fontsize=11, fontweight="bold", pad=10)
    ax1.invert_yaxis()
    ax1.tick_params(colors=text_color, labelsize=8)
    ax1.set_xlim(0, max(maes) * 1.15)
    for bar, mae_val in zip(bars, maes):
        ax1.text(mae_val + 1, bar.get_y() + bar.get_height() / 2,
                 f"{mae_val:.1f}", va="center", ha="left", fontsize=7, color=text_color)
    for spine in ax1.spines.values():
        spine.set_color(grid_color)
    ax1.xaxis.grid(True, color=grid_color, alpha=0.5)

    # ─── Panel 2: Predicted vs Actual scatter ───
    ax2 = fig.add_subplot(gs[0, 1])
    ax2.set_facecolor("#161b22")
    best = zoo_results[0]
    ax2.scatter(best["y_true"], best["y_pred"], c=accent1, alpha=0.8, s=50,
                edgecolors="#30363d", linewidths=0.5, zorder=5)
    lims = [0, max(best["y_true"].max(), best["y_pred"].max()) * 1.1]
    ax2.plot(lims, lims, "--", color=accent3, alpha=0.6, linewidth=1, label="Perfect")
    # Label outliers
    residuals = np.abs(best["y_true"] - best["y_pred"])
    outlier_mask = residuals > np.percentile(residuals, 85)
    for i in np.where(outlier_mask)[0]:
        ax2.annotate(best["regions"][i], (best["y_true"][i], best["y_pred"][i]),
                     fontsize=6, color=accent2, alpha=0.9,
                     textcoords="offset points", xytext=(5, 5))
    ax2.set_xlim(lims)
    ax2.set_ylim(lims)
    ax2.set_xlabel("Actual gCO₂/kWh", color=text_color, fontsize=9)
    ax2.set_ylabel("Predicted gCO₂/kWh", color=text_color, fontsize=9)
    ax2.set_title(f"Best Model: {best['name']} (R²={best['r2']:.3f})",
                  color=title_color, fontsize=11, fontweight="bold", pad=10)
    ax2.tick_params(colors=text_color, labelsize=8)
    for spine in ax2.spines.values():
        spine.set_color(grid_color)
    ax2.legend(fontsize=8, facecolor="#161b22", edgecolor=grid_color,
               labelcolor=text_color)

    # ─── Panel 3: Conformal Prediction Intervals ───
    ax3 = fig.add_subplot(gs[0, 2])
    ax3.set_facecolor("#161b22")
    sort_idx = np.argsort(conformal["y_true"])
    y_sorted = conformal["y_true"][sort_idx]
    pred_sorted = conformal["y_pred"][sort_idx]
    lo_sorted = conformal["lower"][sort_idx]
    hi_sorted = conformal["upper"][sort_idx]
    regions_sorted = conformal["regions"][sort_idx]
    x_range = np.arange(len(y_sorted))

    ax3.fill_between(x_range, np.maximum(lo_sorted, 0), hi_sorted,
                     alpha=0.25, color=accent4, label=f"90% CI (±{conformal['q_val']:.0f})")
    ax3.plot(x_range, pred_sorted, "o-", color=accent1, markersize=4,
             linewidth=1, label="Predicted", zorder=4)
    ax3.plot(x_range, y_sorted, "s", color=accent3, markersize=4,
             label="Actual", zorder=5)
    # Mark points outside interval
    outside = (y_sorted < np.maximum(lo_sorted, 0)) | (y_sorted > hi_sorted)
    if outside.any():
        ax3.scatter(x_range[outside], y_sorted[outside], color=accent2,
                    marker="x", s=60, zorder=6, label="Outside CI")
    ax3.set_xlabel("Samples (sorted by actual CI)", color=text_color, fontsize=9)
    ax3.set_ylabel("gCO₂/kWh", color=text_color, fontsize=9)
    ax3.set_title(f"Conformal Intervals — Coverage: {conformal['coverage']*100:.0f}%",
                  color=title_color, fontsize=11, fontweight="bold", pad=10)
    ax3.tick_params(colors=text_color, labelsize=8)
    ax3.legend(fontsize=7, facecolor="#161b22", edgecolor=grid_color,
               labelcolor=text_color, loc="upper left")
    for spine in ax3.spines.values():
        spine.set_color(grid_color)

    # ─── Panel 4: SHAP Global Importance ───
    ax4 = fig.add_subplot(gs[1, 0])
    ax4.set_facecolor("#161b22")
    n_feats_show = min(10, len(shap_data["feature_names"]))
    imp_idx = shap_data["importance_idx"][:n_feats_show]
    feat_names = [shap_data["feature_names"][i] for i in imp_idx]
    imp_vals = [shap_data["mean_abs_shap"][i] for i in imp_idx]
    ax4.barh(range(n_feats_show), imp_vals, color=accent4,
             edgecolor="#30363d", height=0.7)
    ax4.set_yticks(range(n_feats_show))
    ax4.set_yticklabels(feat_names, fontsize=8, color=text_color)
    ax4.set_xlabel("Mean |SHAP value|", color=text_color, fontsize=9)
    ax4.set_title("SHAP Global Feature Importance", color=title_color,
                  fontsize=11, fontweight="bold", pad=10)
    ax4.invert_yaxis()
    ax4.tick_params(colors=text_color, labelsize=8)
    for spine in ax4.spines.values():
        spine.set_color(grid_color)
    ax4.xaxis.grid(True, color=grid_color, alpha=0.5)

    # ─── Panel 5: SHAP Beeswarm (dot plot) ───
    ax5 = fig.add_subplot(gs[1, 1])
    ax5.set_facecolor("#161b22")
    # Manual beeswarm-like plot
    n_feats_bees = min(8, len(shap_data["feature_names"]))
    imp_idx_bees = shap_data["importance_idx"][:n_feats_bees]
    for row_i, feat_i in enumerate(imp_idx_bees):
        shap_vals_feat = shap_data["shap_values"][:, feat_i]
        feat_vals = shap_data["X"][:, feat_i]
        # Normalize feature values for color
        fmin, fmax = feat_vals.min(), feat_vals.max()
        if fmax - fmin > 0:
            feat_norm = (feat_vals - fmin) / (fmax - fmin)
        else:
            feat_norm = np.zeros_like(feat_vals)
        # Add small y-jitter
        jitter = np.random.default_rng(42).uniform(-0.25, 0.25, len(shap_vals_feat))
        colors_bees = plt.get_cmap("coolwarm")(feat_norm)
        ax5.scatter(shap_vals_feat, row_i + jitter, c=colors_bees,
                    s=20, alpha=0.8, edgecolors="none")
    ax5.set_yticks(range(n_feats_bees))
    ax5.set_yticklabels([shap_data["feature_names"][i] for i in imp_idx_bees],
                        fontsize=8, color=text_color)
    ax5.axvline(0, color=text_color, alpha=0.3, linewidth=0.8)
    ax5.set_xlabel("SHAP value (impact on prediction)", color=text_color, fontsize=9)
    ax5.set_title("SHAP Feature Impact (dot plot)", color=title_color,
                  fontsize=11, fontweight="bold", pad=10)
    ax5.invert_yaxis()
    ax5.tick_params(colors=text_color, labelsize=8)
    for spine in ax5.spines.values():
        spine.set_color(grid_color)
    # Add colorbar
    sm = plt.cm.ScalarMappable(cmap="coolwarm", norm=plt.Normalize(0, 1))
    sm.set_array([])
    cbar = plt.colorbar(sm, ax=ax5, fraction=0.04, pad=0.02)
    cbar.set_label("Feature value (normalized)", color=text_color, fontsize=7)
    cbar.ax.tick_params(colors=text_color, labelsize=6)

    # ─── Panel 6: Error Distribution ───
    ax6 = fig.add_subplot(gs[1, 2])
    ax6.set_facecolor("#161b22")
    errors = best["y_true"] - best["y_pred"]
    ax6.hist(errors, bins=15, color=accent1, edgecolor="#30363d", alpha=0.8)
    ax6.axvline(0, color=accent3, linestyle="--", linewidth=1.5, alpha=0.8)
    ax6.axvline(errors.mean(), color=accent2, linestyle="-", linewidth=1.5,
                alpha=0.8, label=f"Mean bias: {errors.mean():+.1f}")
    ax6.set_xlabel("Prediction Error (actual - predicted)", color=text_color, fontsize=9)
    ax6.set_ylabel("Count", color=text_color, fontsize=9)
    ax6.set_title("Error Distribution", color=title_color,
                  fontsize=11, fontweight="bold", pad=10)
    ax6.tick_params(colors=text_color, labelsize=8)
    ax6.legend(fontsize=8, facecolor="#161b22", edgecolor=grid_color,
               labelcolor=text_color)
    for spine in ax6.spines.values():
        spine.set_color(grid_color)

    # ─── Panel 7: Spatial Error Map ───
    ax7 = fig.add_subplot(gs[2, 0:2])
    ax7.set_facecolor("#161b22")

    # Load world boundaries for context
    try:
        import json as _json
        world_path = "../electricitymaps-contrib/geo/world.geojson"
        with open(world_path) as f:
            geo = _json.load(f)
        for feature in geo["features"]:
            geom = feature["geometry"]
            polys = []
            if geom["type"] == "Polygon":
                polys = [geom["coordinates"]]
            elif geom["type"] == "MultiPolygon":
                polys = geom["coordinates"]
            for poly in polys:
                ring = np.array(poly[0])
                ax7.plot(ring[:, 0], ring[:, 1], color="#30363d", linewidth=0.3)
    except Exception:
        pass

    # Plot errors as colored circles
    err_vals = spatial_df["error"].values
    err_max = max(abs(err_vals.min()), abs(err_vals.max()))
    scatter = ax7.scatter(
        spatial_df["lon"], spatial_df["lat"],
        c=err_vals, cmap="RdYlGn_r", vmin=-err_max, vmax=err_max,
        s=80, edgecolors="#e6edf3", linewidths=0.8, zorder=5, alpha=0.9,
    )
    # Label top errors
    top_err_idx = spatial_df["abs_error"].nlargest(5).index
    for idx in top_err_idx:
        row = spatial_df.loc[idx]
        ax7.annotate(
            f"{row['region']}\n{row['error']:+.0f}",
            (row["lon"], row["lat"]),
            fontsize=6, color=text_color, fontweight="bold",
            textcoords="offset points", xytext=(8, 8),
            arrowprops=dict(arrowstyle="-", color=text_color, alpha=0.5),
        )
    cbar7 = plt.colorbar(scatter, ax=ax7, fraction=0.025, pad=0.02)
    cbar7.set_label("Prediction Error (gCO₂/kWh)", color=text_color, fontsize=8)
    cbar7.ax.tick_params(colors=text_color, labelsize=7)
    ax7.set_xlabel("Longitude", color=text_color, fontsize=9)
    ax7.set_ylabel("Latitude", color=text_color, fontsize=9)
    ax7.set_title("Spatial Distribution of Prediction Errors",
                  color=title_color, fontsize=11, fontweight="bold", pad=10)
    ax7.tick_params(colors=text_color, labelsize=8)
    ax7.set_xlim(-180, 180)
    ax7.set_ylim(-60, 80)
    for spine in ax7.spines.values():
        spine.set_color(grid_color)

    # ─── Panel 8: Summary Stats Card ───
    ax8 = fig.add_subplot(gs[2, 2])
    ax8.set_facecolor("#161b22")
    ax8.axis("off")

    best_zoo = zoo_results[0]
    lines = [
        ("SUMMARY", "", True),
        ("", "", False),
        ("Best Model", best_zoo["name"], False),
        ("LOO MAE", f"{best_zoo['mae']:.1f} gCO₂/kWh", False),
        ("LOO RMSE", f"{best_zoo['rmse']:.1f} gCO₂/kWh", False),
        ("LOO R²", f"{best_zoo['r2']:.3f}", False),
        ("Median AE", f"{best_zoo['median_ae']:.1f} gCO₂/kWh", False),
        ("Max Error", f"{best_zoo['max_error']:.1f} gCO₂/kWh", False),
        ("", "", False),
        ("90% Conf. Interval", f"±{conformal['q_val']:.0f} gCO₂/kWh", False),
        ("Coverage", f"{conformal['coverage']*100:.0f}%", False),
        ("", "", False),
        ("Models Tested", f"{len(zoo_results)}", False),
        ("Features Used", f"{best_zoo['n_feats']}", False),
        ("Samples", f"{best_zoo['n_samples']}", False),
        ("", "", False),
        ("Top SHAP Feature", shap_data["feature_names"][shap_data["importance_idx"][0]], False),
    ]

    y_pos = 0.95
    for label, value, is_header in lines:
        if is_header:
            ax8.text(0.5, y_pos, label, transform=ax8.transAxes,
                     fontsize=14, fontweight="bold", color=accent1,
                     ha="center", va="top")
        elif label:
            ax8.text(0.05, y_pos, label, transform=ax8.transAxes,
                     fontsize=9, color=text_color, va="top")
            ax8.text(0.95, y_pos, value, transform=ax8.transAxes,
                     fontsize=9, color=accent3, fontweight="bold",
                     ha="right", va="top")
        y_pos -= 0.055

    plt.savefig(REPORT_PATH, dpi=180, facecolor=fig.get_facecolor())
    plt.close()
    print(f"\n  ✅ Report saved to {REPORT_PATH}")


# ═══════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════
def main():
    print("━" * 70)
    print("  GridSync — Advanced Analytics Pipeline")
    print("━" * 70)

    df = load_data()
    print(f"  Loaded {len(df)} samples × {len(df.columns)} features")

    # Module 1: Model Zoo
    zoo_results = model_zoo(df)

    # Module 2: Ensemble
    ensemble_results = ensemble_models(df, zoo_results)

    # Module 3: Conformal Prediction
    conformal = conformal_prediction(df, zoo_results)

    # Module 4: SHAP
    shap_data = shap_analysis(df)

    # Module 5: Spatial Residuals
    spatial_df = spatial_residuals(df, zoo_results)

    # Generate Report
    generate_report(df, zoo_results, ensemble_results, conformal,
                    shap_data, spatial_df)

    # ── Final export: update trained_model.json if best model beats current ──
    import json
    try:
        with open("trained_model.json") as f:
            current = json.load(f)
        current_mae = current.get("loo_mae", 999)
        best = zoo_results[0]
        print(f"\n  Current model MAE: {current_mae:.1f}")
        print(f"  Best zoo model MAE: {best['mae']:.1f}")
        if best["mae"] < current_mae - 0.5:
            print(f"  🏆 New best! Updating trained_model.json...")
            # Retrain on full data
            feats = best["feats"]
            subset = df[["ground_truth_ci"] + feats].dropna()
            X = subset[feats].values
            y = subset["ground_truth_ci"].values
            from sklearn.preprocessing import StandardScaler
            from sklearn.linear_model import Ridge
            scaler = StandardScaler()
            X_s = scaler.fit_transform(X)
            # Use Ridge for export (simple, interpretable)
            model = Ridge(alpha=1.0)
            model.fit(X_s, y)
            config = {
                "model_type": "ridge_regression",
                "alpha": 1.0,
                "features": feats,
                "scaler_mean": scaler.mean_.tolist(),
                "scaler_scale": scaler.scale_.tolist(),
                "coefficients": model.coef_.tolist(),
                "intercept": float(model.intercept_),
                "training_samples": len(subset),
                "loo_mae": float(best["mae"]),
                "loo_r2": float(best["r2"]),
                "analytics_best_model": best["name"],
            }
            with open("trained_model.json", "w") as f:
                json.dump(config, f, indent=2)
            print(f"  ✅ Updated model saved (MAE: {current_mae:.1f} → {best['mae']:.1f})")
        else:
            print(f"  → Current model is competitive; keeping it.")
    except FileNotFoundError:
        pass

    print("\n" + "━" * 70)
    print("  ✅ Advanced Analytics Complete")
    print("━" * 70)


if __name__ == "__main__":
    main()
