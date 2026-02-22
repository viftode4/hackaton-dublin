"""
GridSync — Deep Model Search

Exhaustive search across:
  - Model types: Ridge, Lasso, ElasticNet, SVR, KNN, RandomForest,
                 GradientBoosting, XGBoost (if available), MLP
  - Feature combinations: systematic enumeration of promising subsets
  - Hyperparameters: grid search within LOO
  - Ensemble: stacking of top models

Goal: beat the current LOO MAE of 57.3 gCO₂/kWh

Run: python3 deep_model_search.py
"""

import json
import warnings
import itertools
import time
warnings.filterwarnings('ignore')

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge, Lasso, ElasticNet, BayesianRidge, HuberRegressor
from sklearn.svm import SVR
from sklearn.neighbors import KNeighborsRegressor
from sklearn.ensemble import (
    RandomForestRegressor, GradientBoostingRegressor,
    AdaBoostRegressor, ExtraTreesRegressor, BaggingRegressor,
    StackingRegressor, VotingRegressor
)
from sklearn.tree import DecisionTreeRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler, PolynomialFeatures
from sklearn.model_selection import LeaveOneOut, cross_val_predict
from sklearn.pipeline import Pipeline

try:
    from xgboost import XGBRegressor
    HAS_XGB = True
except ImportError:
    HAS_XGB = False

try:
    from lightgbm import LGBMRegressor
    HAS_LGBM = True
except ImportError:
    HAS_LGBM = False

# =====================================================================
# Feature groups for systematic search
# =====================================================================
# Core signal features (high impact)
CORE = ["country_ci", "emaps_zone_ci"]
# Supplementary features by category
TRACE_LOCAL = ["emissions_per_capacity", "local_pct_coal", "local_pct_clean",
               "local_ef_weighted", "local_mean_cf"]
SPATIAL = ["idw_weighted_ci", "emaps_idw_ci"]
COUNTRY_MIX = ["country_fossil_frac", "country_clean_frac", "country_coal_frac",
               "country_gas_frac", "country_nuclear_frac", "country_renew_frac"]
ZONE_CAP = ["emaps_zone_clean_cap_frac", "emaps_zone_fossil_cap_frac", "emaps_zone_coal_cap_mw"]
DERIVED = ["country_ci_sq", "ct_grid_ci_est"]
GEO = ["abs_lat"]
PLANT_COUNT = ["n_plants_300km", "total_emissions_300km", "n_renew_nearby", "renew_cap_nearby_mw"]

ALL_FEATURES = list(set(CORE + TRACE_LOCAL + SPATIAL + COUNTRY_MIX + ZONE_CAP + DERIVED + GEO + PLANT_COUNT))


def loo_evaluate(X, y, model, scaler=None):
    """Evaluate model with LOO CV. Returns MAE, RMSE, R², predictions."""
    loo = LeaveOneOut()
    predictions = np.zeros(len(y))
    
    for train_idx, test_idx in loo.split(X):
        X_train, X_test = X[train_idx], X[test_idx]
        y_train, y_test = y[train_idx], y[test_idx]
        
        if scaler is not None:
            sc = StandardScaler()
            X_train = sc.fit_transform(X_train)
            X_test = sc.transform(X_test)
        
        model_clone = clone_model(model)
        model_clone.fit(X_train, y_train)
        predictions[test_idx] = model_clone.predict(X_test)
    
    errors = y - predictions
    abs_errors = np.abs(errors)
    mae = abs_errors.mean()
    rmse = np.sqrt((errors ** 2).mean())
    r2 = 1 - (errors ** 2).sum() / ((y - y.mean()) ** 2).sum()
    return mae, rmse, r2, predictions


def clone_model(model):
    """Clone a sklearn model with same hyperparameters."""
    from sklearn.base import clone
    return clone(model)


def generate_feature_combos(df, min_feats=2, max_feats=10):
    """Generate promising feature combinations."""
    combos = []
    
    # Always start with the best known features
    base_features = ["country_ci", "emaps_zone_ci"]
    available = [f for f in ALL_FEATURES if f in df.columns and f not in base_features]
    
    # 1. Base features only
    combos.append(("core_only", base_features[:]))
    
    # 2. Base + each single feature
    for f in available:
        combos.append((f"core+{f}", base_features + [f]))
    
    # 3. Base + each pair from top features
    top_supplementary = [f for f in [
        "local_pct_coal", "local_pct_clean", "emissions_per_capacity",
        "idw_weighted_ci", "country_ci_sq", "emaps_idw_ci",
        "country_fossil_frac", "country_clean_frac",
        "emaps_zone_fossil_cap_frac", "emaps_zone_clean_cap_frac",
        "local_ef_weighted", "ct_grid_ci_est", "country_coal_frac",
        "abs_lat", "n_renew_nearby", "renew_cap_nearby_mw",
    ] if f in df.columns]
    
    for pair in itertools.combinations(top_supplementary, 2):
        combos.append((f"core+{pair[0][:8]}+{pair[1][:8]}", base_features + list(pair)))
    
    # 4. Base + each triple from top features
    for triple in itertools.combinations(top_supplementary[:10], 3):
        combos.append((f"core+3feat", base_features + list(triple)))
    
    # 5. Base + each quad from top features  
    for quad in itertools.combinations(top_supplementary[:8], 4):
        combos.append((f"core+4feat", base_features + list(quad)))
    
    # 6. Previous best: Model E+ features
    combos.append(("Model_E+", [
        "country_ci", "emissions_per_capacity", "local_pct_coal",
        "local_pct_clean", "idw_weighted_ci", "country_ci_sq", "emaps_zone_ci"
    ]))
    
    # 7. Kitchen sink: all available features
    all_avail = base_features + [f for f in available if df[f].notna().sum() > 50]
    if len(all_avail) <= 30:
        combos.append(("all_features", all_avail))
    
    # 8. Curated expert sets
    combos.append(("expert_v1", [
        "country_ci", "emaps_zone_ci", "local_pct_coal", "local_pct_clean",
        "country_ci_sq", "emaps_zone_fossil_cap_frac"
    ]))
    combos.append(("expert_v2", [
        "country_ci", "emaps_zone_ci", "idw_weighted_ci",
        "local_pct_coal", "local_pct_clean", "emissions_per_capacity",
        "emaps_zone_fossil_cap_frac", "emaps_zone_clean_cap_frac"
    ]))
    combos.append(("expert_v3", [
        "emaps_zone_ci", "emaps_idw_ci", "country_ci",
        "country_fossil_frac", "country_coal_frac",
        "local_pct_coal", "local_pct_clean"
    ]))
    combos.append(("expert_v4", [
        "emaps_zone_ci", "country_ci", "country_ci_sq",
        "emaps_zone_fossil_cap_frac", "local_pct_coal",
        "ct_grid_ci_est", "idw_weighted_ci"
    ]))
    combos.append(("expert_v5_wide", [
        "country_ci", "emaps_zone_ci", "emaps_idw_ci",
        "local_pct_coal", "local_pct_clean", "emissions_per_capacity",
        "idw_weighted_ci", "country_ci_sq",
        "emaps_zone_fossil_cap_frac", "emaps_zone_clean_cap_frac",
        "country_fossil_frac", "country_coal_frac",
    ]))
    
    return combos


def get_model_zoo():
    """Return dict of model_name -> list of (param_name, model_instance)."""
    zoo = {}
    
    # --- Linear family ---
    zoo["Ridge"] = [
        ("a=0.01", Ridge(alpha=0.01)),
        ("a=0.1", Ridge(alpha=0.1)),
        ("a=1", Ridge(alpha=1.0)),
        ("a=5", Ridge(alpha=5.0)),
        ("a=10", Ridge(alpha=10.0)),
        ("a=50", Ridge(alpha=50.0)),
        ("a=100", Ridge(alpha=100.0)),
    ]
    zoo["Lasso"] = [
        ("a=0.1", Lasso(alpha=0.1, max_iter=5000)),
        ("a=1", Lasso(alpha=1.0, max_iter=5000)),
        ("a=5", Lasso(alpha=5.0, max_iter=5000)),
        ("a=10", Lasso(alpha=10.0, max_iter=5000)),
    ]
    zoo["ElasticNet"] = [
        ("a=0.1,r=0.5", ElasticNet(alpha=0.1, l1_ratio=0.5, max_iter=5000)),
        ("a=1,r=0.5", ElasticNet(alpha=1.0, l1_ratio=0.5, max_iter=5000)),
        ("a=1,r=0.2", ElasticNet(alpha=1.0, l1_ratio=0.2, max_iter=5000)),
        ("a=1,r=0.8", ElasticNet(alpha=1.0, l1_ratio=0.8, max_iter=5000)),
    ]
    zoo["BayesianRidge"] = [
        ("default", BayesianRidge()),
    ]
    zoo["Huber"] = [
        ("e=1.35", HuberRegressor(epsilon=1.35, max_iter=500)),
        ("e=1.5", HuberRegressor(epsilon=1.5, max_iter=500)),
        ("e=2.0", HuberRegressor(epsilon=2.0, max_iter=500)),
    ]
    
    # --- SVR ---
    zoo["SVR"] = [
        ("rbf,C=1", SVR(kernel='rbf', C=1.0)),
        ("rbf,C=10", SVR(kernel='rbf', C=10.0)),
        ("rbf,C=50", SVR(kernel='rbf', C=50.0)),
        ("rbf,C=100", SVR(kernel='rbf', C=100.0)),
        ("rbf,C=500", SVR(kernel='rbf', C=500.0)),
        ("poly2,C=10", SVR(kernel='poly', degree=2, C=10.0)),
        ("poly2,C=100", SVR(kernel='poly', degree=2, C=100.0)),
        ("poly3,C=10", SVR(kernel='poly', degree=3, C=10.0)),
    ]
    
    # --- KNN ---
    zoo["KNN"] = [
        (f"k={k},w={w}", KNeighborsRegressor(n_neighbors=k, weights=w))
        for k in [3, 5, 7, 9, 11, 15, 20]
        for w in ['uniform', 'distance']
    ]
    
    # --- Tree-based ---
    zoo["RandomForest"] = [
        (f"n={n},d={d}", RandomForestRegressor(n_estimators=n, max_depth=d, random_state=42, n_jobs=-1))
        for n in [50, 100, 200, 500]
        for d in [3, 5, 7, 10, None]
    ]
    zoo["ExtraTrees"] = [
        (f"n={n},d={d}", ExtraTreesRegressor(n_estimators=n, max_depth=d, random_state=42, n_jobs=-1))
        for n in [100, 200, 500]
        for d in [3, 5, 7, None]
    ]
    zoo["GradientBoosting"] = [
        (f"n={n},d={d},lr={lr}", GradientBoostingRegressor(
            n_estimators=n, max_depth=d, learning_rate=lr, random_state=42,
            subsample=0.8, min_samples_leaf=3
        ))
        for n in [50, 100, 200, 500]
        for d in [2, 3, 4, 5]
        for lr in [0.01, 0.05, 0.1, 0.2]
    ]
    zoo["AdaBoost"] = [
        (f"n={n},lr={lr}", AdaBoostRegressor(
            estimator=DecisionTreeRegressor(max_depth=3),
            n_estimators=n, learning_rate=lr, random_state=42
        ))
        for n in [50, 100, 200]
        for lr in [0.01, 0.1, 0.5, 1.0]
    ]
    
    if HAS_XGB:
        zoo["XGBoost"] = [
            (f"n={n},d={d},lr={lr}", XGBRegressor(
                n_estimators=n, max_depth=d, learning_rate=lr,
                random_state=42, n_jobs=-1, verbosity=0,
                subsample=0.8, colsample_bytree=0.8, reg_alpha=1.0, reg_lambda=1.0
            ))
            for n in [50, 100, 200, 500]
            for d in [2, 3, 4, 5]
            for lr in [0.01, 0.05, 0.1, 0.2]
        ]
    
    if HAS_LGBM:
        zoo["LightGBM"] = [
            (f"n={n},d={d},lr={lr}", LGBMRegressor(
                n_estimators=n, max_depth=d, learning_rate=lr,
                random_state=42, n_jobs=-1, verbose=-1,
                subsample=0.8, colsample_bytree=0.8, reg_alpha=1.0, reg_lambda=1.0,
                min_child_samples=3
            ))
            for n in [50, 100, 200, 500]
            for d in [2, 3, 4, 5, -1]
            for lr in [0.01, 0.05, 0.1, 0.2]
        ]
    
    # --- MLP ---
    zoo["MLP"] = [
        (f"h={h},a={a}", MLPRegressor(
            hidden_layer_sizes=h, activation=a, max_iter=2000,
            random_state=42, early_stopping=True, validation_fraction=0.15,
            learning_rate='adaptive', alpha=0.01
        ))
        for h in [(32,), (64,), (128,), (32, 16), (64, 32), (128, 64), (64, 32, 16)]
        for a in ['relu', 'tanh']
    ]
    
    return zoo


def main():
    t0 = time.time()
    
    # ================================================================
    # STEP 1: Load data
    # ================================================================
    print("=" * 70)
    print("DEEP MODEL SEARCH — GridSync")
    print("=" * 70)
    
    df = pd.read_csv("feature_analysis.csv")
    print(f"  Loaded {len(df)} samples × {len(df.columns)} columns")
    print(f"  Target range: {df['ground_truth_ci'].min():.0f}–{df['ground_truth_ci'].max():.0f} gCO₂/kWh")
    
    # ================================================================
    # STEP 2: Generate feature combos
    # ================================================================
    combos = generate_feature_combos(df)
    print(f"  Generated {len(combos)} feature combinations")
    
    zoo = get_model_zoo()
    total_models = sum(len(v) for v in zoo.values())
    print(f"  Model zoo: {len(zoo)} families, {total_models} configurations")
    print(f"  Total search space: ~{len(combos) * total_models} evaluations")
    print(f"  (Using LOO with {len(df)} samples each)")
    
    # ================================================================
    # STEP 3: Phase 1 — Quick scan with subset of models
    # ================================================================
    print(f"\n{'=' * 70}")
    print("PHASE 1: Quick scan — best features per model family")
    print("=" * 70)
    
    # Use one representative per family for feature screening
    quick_models = {
        "Ridge(a=1)": Ridge(alpha=1.0),
        "Ridge(a=10)": Ridge(alpha=10.0),
        "SVR(rbf,C=100)": SVR(kernel='rbf', C=100.0),
        "KNN(k=7,dist)": KNeighborsRegressor(n_neighbors=7, weights='distance'),
        "RF(n=100,d=5)": RandomForestRegressor(n_estimators=100, max_depth=5, random_state=42, n_jobs=-1),
        "GB(n=100,d=3,lr=0.1)": GradientBoostingRegressor(n_estimators=100, max_depth=3, learning_rate=0.1, random_state=42, subsample=0.8, min_samples_leaf=3),
    }
    if HAS_XGB:
        quick_models["XGB(n=100,d=3,lr=0.1)"] = XGBRegressor(n_estimators=100, max_depth=3, learning_rate=0.1, random_state=42, n_jobs=-1, verbosity=0)
    if HAS_LGBM:
        quick_models["LGBM(n=100,d=3,lr=0.1)"] = LGBMRegressor(n_estimators=100, max_depth=3, learning_rate=0.1, random_state=42, n_jobs=-1, verbose=-1, min_child_samples=3)
    
    # Track top combos per model family
    phase1_results = []
    best_overall_mae = float('inf')
    
    for model_name, model in quick_models.items():
        needs_scaling = model_name.startswith(("Ridge", "SVR", "Lasso", "Elastic", "Huber", "Bayesian", "MLP"))
        
        family_best_mae = float('inf')
        family_best_combo = None
        
        for combo_name, feats in combos:
            subset = df[['ground_truth_ci'] + feats].dropna()
            if len(subset) < 20:
                continue
            
            X = subset[feats].values
            y = subset['ground_truth_ci'].values
            
            mae, rmse, r2, preds = loo_evaluate(X, y, model, scaler=StandardScaler() if needs_scaling else None)
            
            phase1_results.append({
                "model": model_name, "combo": combo_name,
                "features": feats, "mae": mae, "rmse": rmse, "r2": r2,
                "n_samples": len(subset), "n_features": len(feats),
            })
            
            if mae < family_best_mae:
                family_best_mae = mae
                family_best_combo = combo_name
        
        marker = " ⭐" if family_best_mae < best_overall_mae else ""
        if family_best_mae < best_overall_mae:
            best_overall_mae = family_best_mae
        print(f"  {model_name:<30} best MAE={family_best_mae:6.1f}  ({family_best_combo}){marker}")
    
    # Sort all results
    phase1_results.sort(key=lambda x: x["mae"])
    
    print(f"\n  Top 15 from Phase 1:")
    print(f"  {'Model':<30} {'Features':<15} {'MAE':>6} {'RMSE':>7} {'R²':>6} {'N':>4}")
    print("  " + "-" * 72)
    for r in phase1_results[:15]:
        print(f"  {r['model']:<30} {r['combo'][:15]:<15} {r['mae']:>6.1f} {r['rmse']:>7.1f} {r['r2']:>6.3f} {r['n_samples']:>4}")
    
    # ================================================================
    # STEP 4: Phase 2 — Deep hyperparameter search on top combos
    # ================================================================
    print(f"\n{'=' * 70}")
    print("PHASE 2: Deep hyperparameter search on top feature combos")
    print("=" * 70)
    
    # Get top 10 unique feature combos from phase 1
    seen_combos = set()
    top_combos = []
    for r in phase1_results:
        key = tuple(sorted(r["features"]))
        if key not in seen_combos:
            seen_combos.add(key)
            top_combos.append(r["features"])
            if len(top_combos) >= 10:
                break
    
    phase2_results = []
    
    for feat_idx, feats in enumerate(top_combos):
        subset = df[['ground_truth_ci'] + feats].dropna()
        if len(subset) < 20:
            continue
        X = subset[feats].values
        y = subset['ground_truth_ci'].values
        
        print(f"\n  Feature set {feat_idx+1}/{len(top_combos)}: {len(feats)} features, {len(subset)} samples")
        print(f"    {feats}")
        
        feat_best_mae = float('inf')
        feat_best_model = ""
        
        for family_name, configs in zoo.items():
            needs_scaling = family_name in ("Ridge", "Lasso", "ElasticNet", "BayesianRidge", "Huber", "SVR", "MLP")
            
            for param_name, model in configs:
                mae, rmse, r2, preds = loo_evaluate(X, y, model, scaler=StandardScaler() if needs_scaling else None)
                
                full_name = f"{family_name}({param_name})"
                phase2_results.append({
                    "model": full_name, "features": feats,
                    "mae": mae, "rmse": rmse, "r2": r2,
                    "n_samples": len(subset), "n_features": len(feats),
                    "family": family_name, "params": param_name,
                    "predictions": preds, "y_true": y,
                    "regions": subset['region'].values if 'region' in subset.columns else None,
                })
                
                if mae < feat_best_mae:
                    feat_best_mae = mae
                    feat_best_model = full_name
        
        print(f"    Best: {feat_best_model} → MAE={feat_best_mae:.1f}")
    
    phase2_results.sort(key=lambda x: x["mae"])
    
    print(f"\n{'=' * 70}")
    print("PHASE 2 RESULTS: Top 30")
    print("=" * 70)
    print(f"  {'#':>3} {'Model':<40} {'MAE':>6} {'RMSE':>7} {'R²':>6} {'Feat':>4} {'N':>4}")
    print("  " + "-" * 72)
    for i, r in enumerate(phase2_results[:30]):
        print(f"  {i+1:>3} {r['model']:<40} {r['mae']:>6.1f} {r['rmse']:>7.1f} {r['r2']:>6.3f} {r['n_features']:>4} {r['n_samples']:>4}")
    
    # ================================================================
    # STEP 5: Phase 3 — Ensemble / Stacking of top models
    # ================================================================
    print(f"\n{'=' * 70}")
    print("PHASE 3: Ensemble and stacking")
    print("=" * 70)
    
    # Get top 5 diverse models (different families)
    top_diverse = []
    seen_families = set()
    for r in phase2_results:
        if r["family"] not in seen_families and len(top_diverse) < 5:
            seen_families.add(r["family"])
            top_diverse.append(r)
    
    # Use the features from the best result
    best_feats = phase2_results[0]["features"]
    subset = df[['ground_truth_ci', 'region'] + best_feats].dropna()
    X = subset[best_feats].values
    y = subset['ground_truth_ci'].values
    
    ensemble_results = []
    
    # 5a. Simple averaging of top model predictions
    print("\n  5a. Averaging top diverse model predictions...")
    for n_models in [2, 3, 4, 5]:
        models_to_avg = phase2_results[:n_models]
        # Only average if all use same features
        if all(tuple(sorted(m["features"])) == tuple(sorted(best_feats)) for m in models_to_avg):
            avg_preds = np.mean([m["predictions"] for m in models_to_avg], axis=0)
            errors = y - avg_preds
            mae = np.abs(errors).mean()
            rmse = np.sqrt((errors ** 2).mean())
            r2 = 1 - (errors ** 2).sum() / ((y - y.mean()) ** 2).sum()
            print(f"    Avg top {n_models}: MAE={mae:.1f}, RMSE={rmse:.1f}, R²={r2:.3f}")
            ensemble_results.append({
                "model": f"Avg_top{n_models}", "mae": mae, "rmse": rmse, "r2": r2,
                "features": best_feats, "predictions": avg_preds, "y_true": y,
                "n_samples": len(y), "n_features": len(best_feats),
            })
    
    # 5b. Weighted averaging (weight by 1/MAE)
    print("\n  5b. Weighted averaging (1/MAE weights)...")
    for n_models in [3, 5]:
        models_to_avg = phase2_results[:n_models]
        if all(tuple(sorted(m["features"])) == tuple(sorted(best_feats)) for m in models_to_avg):
            weights = np.array([1.0 / m["mae"] for m in models_to_avg])
            weights /= weights.sum()
            wavg_preds = np.average([m["predictions"] for m in models_to_avg], weights=weights, axis=0)
            errors = y - wavg_preds
            mae = np.abs(errors).mean()
            rmse = np.sqrt((errors ** 2).mean())
            r2 = 1 - (errors ** 2).sum() / ((y - y.mean()) ** 2).sum()
            print(f"    WAvg top {n_models}: MAE={mae:.1f}, RMSE={rmse:.1f}, R²={r2:.3f}")
            ensemble_results.append({
                "model": f"WAvg_top{n_models}", "mae": mae, "rmse": rmse, "r2": r2,
                "features": best_feats, "predictions": wavg_preds, "y_true": y,
                "n_samples": len(y), "n_features": len(best_feats),
            })
    
    # 5c. Stacking with Ridge meta-learner
    print("\n  5c. Stacking with LOO...")
    # Build stacking predictions via LOO
    top_for_stack = phase2_results[:10]
    same_feats = [r for r in top_for_stack if tuple(sorted(r["features"])) == tuple(sorted(best_feats))]
    
    if len(same_feats) >= 3:
        n_stack = min(len(same_feats), 7)
        stack_preds_matrix = np.column_stack([r["predictions"] for r in same_feats[:n_stack]])
        
        # LOO on the stacking meta-learner
        loo = LeaveOneOut()
        stack_final_preds = np.zeros(len(y))
        for train_idx, test_idx in loo.split(stack_preds_matrix):
            meta_X_train = stack_preds_matrix[train_idx]
            meta_y_train = y[train_idx]
            meta_X_test = stack_preds_matrix[test_idx]
            
            meta = Ridge(alpha=1.0)
            meta.fit(meta_X_train, meta_y_train)
            stack_final_preds[test_idx] = meta.predict(meta_X_test)
        
        errors = y - stack_final_preds
        mae = np.abs(errors).mean()
        rmse = np.sqrt((errors ** 2).mean())
        r2 = 1 - (errors ** 2).sum() / ((y - y.mean()) ** 2).sum()
        print(f"    Stacking {n_stack} models → Ridge: MAE={mae:.1f}, RMSE={rmse:.1f}, R²={r2:.3f}")
        ensemble_results.append({
            "model": f"Stack_{n_stack}_Ridge", "mae": mae, "rmse": rmse, "r2": r2,
            "features": best_feats, "predictions": stack_final_preds, "y_true": y,
            "n_samples": len(y), "n_features": len(best_feats),
        })
    
    # ================================================================
    # STEP 6: Final comparison
    # ================================================================
    print(f"\n{'=' * 70}")
    print("FINAL RESULTS")
    print("=" * 70)
    
    all_results = phase2_results + ensemble_results
    all_results.sort(key=lambda x: x["mae"])
    
    # Previous best
    prev_best_mae = 57.3
    
    print(f"\n  Previous best: Ridge E+ → LOO MAE = {prev_best_mae:.1f} gCO₂/kWh")
    print(f"\n  {'#':>3} {'Model':<42} {'MAE':>6} {'RMSE':>7} {'R²':>6} {'Feat':>4} {'Impr':>7}")
    print("  " + "-" * 76)
    for i, r in enumerate(all_results[:30]):
        impr = prev_best_mae - r["mae"]
        impr_str = f"+{impr:.1f}" if impr > 0 else f"{impr:.1f}"
        print(f"  {i+1:>3} {r['model']:<42} {r['mae']:>6.1f} {r['rmse']:>7.1f} {r['r2']:>6.3f} {r['n_features']:>4} {impr_str:>7}")
    
    winner = all_results[0]
    print(f"\n  🏆 WINNER: {winner['model']}")
    print(f"     MAE:  {winner['mae']:.1f} gCO₂/kWh")
    print(f"     RMSE: {winner['rmse']:.1f}")
    print(f"     R²:   {winner['r2']:.3f}")
    print(f"     Improvement: {prev_best_mae - winner['mae']:.1f} gCO₂/kWh ({(prev_best_mae - winner['mae'])/prev_best_mae*100:.1f}%)")
    
    # ================================================================
    # STEP 7: Per-sample analysis of winner
    # ================================================================
    if "predictions" in winner and "y_true" in winner:
        print(f"\n{'=' * 70}")
        print("PER-SAMPLE PREDICTIONS (Winner)")
        print("=" * 70)
        
        y_true = winner["y_true"]
        y_pred = winner["predictions"]
        regions = winner.get("regions", None)
        if regions is None:
            regions = subset['region'].values if 'region' in subset.columns else [f"sample_{i}" for i in range(len(y_true))]
        
        pred_df = pd.DataFrame({
            'region': regions,
            'actual': y_true,
            'predicted': np.round(y_pred, 1),
            'error': np.round(y_pred - y_true, 1),
        }).sort_values('error', key=abs, ascending=False)
        
        n_within_30 = (pred_df['error'].abs() <= 30).sum()
        n_within_50 = (pred_df['error'].abs() <= 50).sum()
        n_within_100 = (pred_df['error'].abs() <= 100).sum()
        
        print(f"\n  Within ±30:  {n_within_30}/{len(pred_df)} ({100*n_within_30/len(pred_df):.0f}%)")
        print(f"  Within ±50:  {n_within_50}/{len(pred_df)} ({100*n_within_50/len(pred_df):.0f}%)")
        print(f"  Within ±100: {n_within_100}/{len(pred_df)} ({100*n_within_100/len(pred_df):.0f}%)")
        
        print(f"\n  {'Region':<35} {'Actual':>7} {'Pred':>7} {'Error':>7}")
        print("  " + "-" * 58)
        for _, r in pred_df.iterrows():
            emoji = "❌" if abs(r['error']) > 100 else "⚠️" if abs(r['error']) > 50 else "✅"
            print(f"  {emoji} {r['region']:<33} {r['actual']:>7.0f} {r['predicted']:>7.1f} {r['error']:>+7.1f}")
    
    # ================================================================
    # STEP 8: Export winner
    # ================================================================
    print(f"\n{'=' * 70}")
    print("EXPORT")
    print("=" * 70)
    
    # Determine if winner is a simple linear model or tree-based
    winner_model_name = winner["model"]
    winner_feats = winner["features"]
    
    # Re-train winner on full data for export
    subset = df[['ground_truth_ci', 'region'] + winner_feats].dropna()
    X_final = subset[winner_feats].values
    y_final = subset['ground_truth_ci'].values
    
    # Determine model type and train
    is_linear = any(winner_model_name.startswith(t) for t in 
                    ["Ridge", "Lasso", "ElasticNet", "BayesianRidge", "Huber"])
    is_tree = any(winner_model_name.startswith(t) for t in 
                  ["RandomForest", "ExtraTrees", "GradientBoosting", "AdaBoost", "XGBoost", "LightGBM"])
    
    if is_linear:
        # Export as before — coefficients + scaler
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X_final)
        
        # Parse model params from name
        if "Ridge" in winner_model_name:
            alpha = float(winner["params"].split("=")[1]) if "params" in winner else 1.0
            final_model = Ridge(alpha=alpha)
        elif "Lasso" in winner_model_name:
            alpha = float(winner["params"].split("=")[1]) if "params" in winner else 1.0
            final_model = Lasso(alpha=alpha, max_iter=5000)
        elif "ElasticNet" in winner_model_name:
            final_model = ElasticNet(alpha=1.0, l1_ratio=0.5, max_iter=5000)
        elif "Huber" in winner_model_name:
            final_model = HuberRegressor(epsilon=1.5, max_iter=500)
        else:
            final_model = BayesianRidge()
        
        final_model.fit(X_scaled, y_final)
        
        model_config = {
            "model_type": "linear",
            "algorithm": winner_model_name,
            "features": winner_feats,
            "scaler_mean": scaler.mean_.tolist(),
            "scaler_scale": scaler.scale_.tolist(),
            "coefficients": final_model.coef_.tolist(),
            "intercept": float(final_model.intercept_),
            "training_samples": len(subset),
            "loo_mae": float(winner["mae"]),
            "loo_r2": float(winner["r2"]),
        }
        
        with open("trained_model.json", "w") as f:
            json.dump(model_config, f, indent=2)
        print(f"  ✅ Exported linear model to trained_model.json")
        
    elif is_tree:
        # Export tree-based model as a serialized pickle + JSON metadata
        import pickle
        
        # Re-instantiate + train
        # Find the model config in phase2_results
        for r in phase2_results:
            if r["model"] == winner_model_name and tuple(sorted(r["features"])) == tuple(sorted(winner_feats)):
                # Get the model class from zoo
                family = r["family"]
                params = r["params"]
                for pname, m in zoo[family]:
                    if pname == params:
                        final_model = clone_model(m)
                        break
                break
        
        final_model.fit(X_final, y_final)
        
        with open("trained_model.pkl", "wb") as f:
            pickle.dump(final_model, f)
        
        model_config = {
            "model_type": "tree",
            "algorithm": winner_model_name,
            "features": winner_feats,
            "training_samples": len(subset),
            "loo_mae": float(winner["mae"]),
            "loo_r2": float(winner["r2"]),
            "pickle_file": "trained_model.pkl",
        }
        
        with open("trained_model.json", "w") as f:
            json.dump(model_config, f, indent=2)
        print(f"  ✅ Exported tree model to trained_model.pkl + trained_model.json")
    
    else:
        # SVR, KNN, MLP — need pickle + scaler
        import pickle
        
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X_final)
        
        for r in phase2_results:
            if r["model"] == winner_model_name and tuple(sorted(r["features"])) == tuple(sorted(winner_feats)):
                family = r["family"]
                params = r["params"]
                for pname, m in zoo[family]:
                    if pname == params:
                        final_model = clone_model(m)
                        break
                break
        
        final_model.fit(X_scaled, y_final)
        
        with open("trained_model.pkl", "wb") as f:
            pickle.dump({"model": final_model, "scaler_mean": scaler.mean_.tolist(), "scaler_scale": scaler.scale_.tolist()}, f)
        
        model_config = {
            "model_type": "nonlinear",
            "algorithm": winner_model_name,
            "features": winner_feats,
            "scaler_mean": scaler.mean_.tolist(),
            "scaler_scale": scaler.scale_.tolist(),
            "training_samples": len(subset),
            "loo_mae": float(winner["mae"]),
            "loo_r2": float(winner["r2"]),
            "pickle_file": "trained_model.pkl",
        }
        
        with open("trained_model.json", "w") as f:
            json.dump(model_config, f, indent=2)
        print(f"  ✅ Exported nonlinear model to trained_model.pkl + trained_model.json")
    
    elapsed = time.time() - t0
    print(f"\n  Total search time: {elapsed:.0f}s ({elapsed/60:.1f}min)")
    print(f"  Features: {winner_feats}")
    print(f"  MAE: {winner['mae']:.1f} gCO₂/kWh (was {prev_best_mae:.1f})")


if __name__ == "__main__":
    main()
