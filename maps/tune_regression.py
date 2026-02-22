"""
GridSync — Regression Tuning + Outlier Analysis

Focused search: Ridge regression with systematic feature/alpha tuning,
plus deep outlier analysis to find patterns and potential fixes.

Run: python3 tune_regression.py
"""

import json, warnings, itertools, time
warnings.filterwarnings('ignore')

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import LeaveOneOut, cross_val_predict


def loo_eval(df, feats, alpha=1.0):
    """Ridge LOO evaluation. Returns dict with metrics + per-sample predictions."""
    subset = df[['ground_truth_ci', 'region', 'provider', 'country_iso'] + feats].dropna()
    X = subset[feats].values
    y = subset['ground_truth_ci'].values
    
    scaler = StandardScaler()
    X_s = scaler.fit_transform(X)
    model = Ridge(alpha=alpha)
    y_pred = cross_val_predict(model, X_s, y, cv=LeaveOneOut())
    
    err = y - y_pred
    ae = np.abs(err)
    mae = ae.mean()
    rmse = np.sqrt((err**2).mean())
    r2 = 1 - (err**2).sum() / ((y - y.mean())**2).sum()
    
    return {
        "mae": mae, "rmse": rmse, "r2": r2,
        "n": len(subset), "feats": feats, "alpha": alpha,
        "regions": subset['region'].values,
        "providers": subset['provider'].values,
        "countries": subset['country_iso'].values,
        "y_true": y, "y_pred": y_pred, "errors": y_pred - y,
    }


def main():
    t0 = time.time()
    df = pd.read_csv("feature_analysis.csv")

    # Fill state_ci NaN with country_ci (same fallback as geo_estimator at inference)
    if 'state_ci' in df.columns:
        df['state_ci'] = df['state_ci'].fillna(df['country_ci'])

    print(f"{'='*70}")
    print(f"REGRESSION TUNING — {len(df)} samples × {len(df.columns)} columns")
    print(f"{'='*70}")
    print(f"  Target: {df['ground_truth_ci'].min():.0f}–{df['ground_truth_ci'].max():.0f} gCO₂/kWh  "
          f"(mean={df['ground_truth_ci'].mean():.0f}, std={df['ground_truth_ci'].std():.0f})")

    # ── All candidate features ──
    all_feats = [
        "country_ci", "emaps_zone_ci", "emaps_idw_ci", "state_ci", "is_gcp",
        "emissions_per_capacity", "local_pct_coal", "local_pct_clean",
        "local_pct_gas", "local_pct_fossil", "local_pct_nuclear",
        "idw_weighted_ci", "country_ci_sq",
        "country_fossil_frac", "country_clean_frac", "country_coal_frac",
        "country_gas_frac", "country_nuclear_frac", "country_renew_frac",
        "ct_grid_ci_est", "local_ef_weighted", "local_mean_cf",
        "emaps_zone_clean_cap_frac", "emaps_zone_fossil_cap_frac", "emaps_zone_coal_cap_mw",
        "abs_lat", "n_plants_300km", "total_emissions_300km",
        "n_renew_nearby", "renew_cap_nearby_mw",
        "n_fossil_ops_300km", "fossil_emissions_300km",
        "n_coal_mines", "nearest_dc_km", "n_dcs_300km",
        "local_generation_gwh", "mean_emissions_per_plant",
        # Temporal features
        "country_trend_pct", "local_trend_b", "local_trend_x_ci",
    ]
    avail = [f for f in all_feats if f in df.columns]

    # ══════════════════════════════════════════════════════════════════
    # PART 1: Feature importance via correlation with residuals
    # ══════════════════════════════════════════════════════════════════
    print(f"\n{'='*70}")
    print("PART 1: Feature correlations with ground truth")
    print(f"{'='*70}")
    
    corrs = []
    for f in avail:
        vals = df[[f, 'ground_truth_ci']].dropna()
        if len(vals) > 20:
            c = vals[f].corr(vals['ground_truth_ci'])
            if np.isnan(c):
                continue
            corrs.append((f, c, abs(c)))
    corrs.sort(key=lambda x: -x[2])
    
    print(f"\n  {'Feature':<35} {'Corr':>7} {'|Corr|':>7}")
    print("  " + "-"*51)
    for f, c, ac in corrs:
        bar = "█" * int(ac * 30)
        print(f"  {f:<35} {c:>+7.3f} {ac:>7.3f} {bar}")

    # ══════════════════════════════════════════════════════════════════
    # PART 2: Systematic feature set search
    # ══════════════════════════════════════════════════════════════════
    print(f"\n{'='*70}")
    print("PART 2: Systematic feature set search (Ridge)")
    print(f"{'='*70}")
    
    # Define feature groups
    base = ["country_ci", "emaps_zone_ci"]
    top12 = [f for f, _, ac in corrs if ac > 0.3 and f not in base and f != "ground_truth_ci"][:12]
    
    print(f"  Base features: {base}")
    print(f"  Top correlated (>0.3): {top12}")
    
    results = []
    
    # --- A) Alpha sweep on current best (Model E+) ---
    print(f"\n  A) Alpha sweep on Model E+ features...")
    e_plus = ["country_ci", "emissions_per_capacity", "local_pct_coal",
              "local_pct_clean", "idw_weighted_ci", "country_ci_sq", "emaps_zone_ci"]
    for alpha in [0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0]:
        r = loo_eval(df, e_plus, alpha)
        results.append(r)
        print(f"    α={alpha:<6} MAE={r['mae']:5.1f}  R²={r['r2']:.3f}  (n={r['n']})")
    
    # --- B) Base + singles ---
    print(f"\n  B) Base + single feature...")
    for f in top12:
        r = loo_eval(df, base + [f], alpha=1.0)
        results.append(r)
    # Also try alpha variants for the best
    results_b = [(r, r['mae']) for r in results if len(r['feats']) == 3]
    results_b.sort(key=lambda x: x[1])
    for r, _ in results_b[:5]:
        print(f"    {r['feats'][-1]:<30} MAE={r['mae']:5.1f}  (n={r['n']})")
    
    # --- C) Base + pairs ---
    print(f"\n  C) Base + pairs from top-8...")
    top8 = top12[:8]
    for pair in itertools.combinations(top8, 2):
        r = loo_eval(df, base + list(pair))
        results.append(r)
    
    # --- D) Base + triples ---
    print(f"\n  D) Base + triples from top-8...")
    for triple in itertools.combinations(top8, 3):
        r = loo_eval(df, base + list(triple))
        results.append(r)
    
    # --- E) Base + quads ---
    print(f"\n  E) Base + quads from top-8...")
    for quad in itertools.combinations(top8, 4):
        r = loo_eval(df, base + list(quad))
        results.append(r)

    # --- F) Base + quints ---
    print(f"\n  F) Base + quints from top-8...")
    for quint in itertools.combinations(top8, 5):
        r = loo_eval(df, base + list(quint))
        results.append(r)
    
    # --- G) Everything from top-8 + base ---
    r = loo_eval(df, base + top8)
    results.append(r)
    print(f"  G) All top-8 + base: MAE={r['mae']:.1f}")
    
    # --- H) Best feature sets with alpha sweep ---
    results.sort(key=lambda x: x['mae'])
    print(f"\n  H) Alpha sweep on top-5 feature sets...")
    seen = set()
    alpha_results = []
    for r in results:
        key = tuple(sorted(r['feats']))
        if key in seen:
            continue
        seen.add(key)
        if len(alpha_results) >= 5:
            break
        for alpha in [0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0]:
            r2 = loo_eval(df, list(r['feats']), alpha)
            alpha_results.append(r2)
    results.extend(alpha_results)

    # --- I) Add interaction/polynomial features manually ---
    print(f"\n  I) Engineered features...")
    df['zone_x_country'] = df['emaps_zone_ci'] * df['country_ci'] / 1000.0
    df['zone_minus_country'] = df['emaps_zone_ci'] - df['country_ci']
    df['zone_sq'] = df['emaps_zone_ci'] ** 2 / 1000.0
    df['coal_x_fossil'] = df['local_pct_coal'] * df['country_fossil_frac']
    df['clean_ratio'] = df['local_pct_clean'] / (df['local_pct_fossil'] + 0.01)
    df['zone_country_avg'] = (df['emaps_zone_ci'] + df['country_ci']) / 2.0
    df['idw_zone_avg'] = (df['emaps_idw_ci'] + df['emaps_zone_ci']) / 2.0
    df['log_country_ci'] = np.log1p(df['country_ci'])
    df['log_zone_ci'] = np.log1p(df['emaps_zone_ci'])
    df['sqrt_zone_ci'] = np.sqrt(df['emaps_zone_ci'].clip(0))
    
    eng_feats = ['zone_x_country', 'zone_minus_country', 'zone_sq',
                 'coal_x_fossil', 'clean_ratio', 'zone_country_avg',
                 'idw_zone_avg', 'log_country_ci', 'log_zone_ci', 'sqrt_zone_ci']
    
    # Test each engineered feature
    for ef in eng_feats:
        r = loo_eval(df, base + [ef])
        results.append(r)
        print(f"    {ef:<25} MAE={r['mae']:5.1f}")
    
    # Best base + engineered combos
    for pair in itertools.combinations(eng_feats, 2):
        r = loo_eval(df, base + list(pair))
        results.append(r)
    
    # Mix engineered + top raw features
    best_eng = sorted(eng_feats, key=lambda f: loo_eval(df, base + [f])['mae'])[:4]
    print(f"    Best engineered: {best_eng}")
    
    for n in range(1, len(best_eng)+1):
        for combo in itertools.combinations(best_eng, n):
            for n2 in range(0, min(4, len(top8))+1):
                for raw_combo in itertools.combinations(top8[:6], n2):
                    feats = base + list(combo) + list(raw_combo)
                    if len(feats) > 12:
                        continue
                    r = loo_eval(df, feats)
                    results.append(r)

    # Sort and show top results
    results.sort(key=lambda x: x['mae'])
    
    print(f"\n{'='*70}")
    print(f"TOP 20 RESULTS")
    print(f"{'='*70}")
    print(f"  {'#':>3} {'MAE':>6} {'RMSE':>7} {'R²':>6} {'α':>5} {'N':>4} {'F':>2} Features")
    print("  " + "-"*80)
    shown = set()
    rank = 0
    for r in results:
        key = (tuple(sorted(r['feats'])), r['alpha'])
        if key in shown:
            continue
        shown.add(key)
        rank += 1
        if rank > 20:
            break
        feats_str = ", ".join(r['feats'])
        if len(feats_str) > 50:
            feats_str = feats_str[:47] + "..."
        print(f"  {rank:>3} {r['mae']:>6.1f} {r['rmse']:>7.1f} {r['r2']:>6.3f} {r['alpha']:>5.1f} {r['n']:>4} {len(r['feats']):>2} {feats_str}")

    winner = results[0]
    prev_mae = 57.3
    print(f"\n  Previous best: MAE={prev_mae:.1f}")
    print(f"  New best:      MAE={winner['mae']:.1f}  (Δ={prev_mae-winner['mae']:+.1f})")

    # ══════════════════════════════════════════════════════════════════
    # PART 3: OUTLIER ANALYSIS
    # ══════════════════════════════════════════════════════════════════
    print(f"\n{'='*70}")
    print("PART 3: OUTLIER ANALYSIS")
    print(f"{'='*70}")
    
    w = winner
    pred_df = pd.DataFrame({
        'region': w['regions'], 'provider': w['providers'], 'country': w['countries'],
        'actual': w['y_true'], 'predicted': np.round(w['y_pred'], 1),
        'error': np.round(w['errors'], 1), 'abs_error': np.round(np.abs(w['errors']), 1),
    }).sort_values('abs_error', ascending=False)
    
    n30 = (pred_df['abs_error'] <= 30).sum()
    n50 = (pred_df['abs_error'] <= 50).sum()
    n100 = (pred_df['abs_error'] <= 100).sum()
    print(f"\n  Accuracy: ±30={n30}/{len(pred_df)} ({100*n30/len(pred_df):.0f}%)  "
          f"±50={n50}/{len(pred_df)} ({100*n50/len(pred_df):.0f}%)  "
          f"±100={n100}/{len(pred_df)} ({100*n100/len(pred_df):.0f}%)")
    
    # 3a. All predictions sorted by error magnitude
    print(f"\n  {'Region':<33} {'Prov':>4} {'CC':>3} {'Actual':>6} {'Pred':>6} {'Error':>7}")
    print("  " + "-"*66)
    for _, r in pred_df.iterrows():
        emoji = "❌" if r['abs_error'] > 100 else "⚠️" if r['abs_error'] > 50 else "✅"
        print(f"  {emoji} {r['region']:<31} {r['provider']:>4} {r['country']:>3} "
              f"{r['actual']:>6.0f} {r['predicted']:>6.1f} {r['error']:>+7.1f}")
    
    # 3b. Outlier patterns
    print(f"\n  --- Outlier Patterns (|error| > 80) ---")
    outliers = pred_df[pred_df['abs_error'] > 80]
    
    if len(outliers) > 0:
        print(f"\n  {len(outliers)} outliers found:")
        
        # By provider
        print(f"\n  By provider:")
        for prov in outliers['provider'].unique():
            prov_out = outliers[outliers['provider'] == prov]
            print(f"    {prov}: {len(prov_out)} outliers, mean |error|={prov_out['abs_error'].mean():.0f}")
        
        # By country
        print(f"\n  By country:")
        for cc in outliers['country'].unique():
            cc_out = outliers[outliers['country'] == cc]
            print(f"    {cc}: {len(cc_out)} outlier(s), errors: {list(cc_out['error'].values)}")
        
        # Direction
        over = outliers[outliers['error'] > 0]
        under = outliers[outliers['error'] < 0]
        print(f"\n  Over-predicting: {len(over)} ({over['error'].mean():+.0f} avg)" if len(over) > 0 else "")
        print(f"  Under-predicting: {len(under)} ({under['error'].mean():+.0f} avg)" if len(under) > 0 else "")
        
        # Feature comparison: outliers vs non-outliers
        print(f"\n  Feature comparison (outliers vs rest):")
        non_outlier_regions = pred_df[pred_df['abs_error'] <= 80]['region'].values
        outlier_regions = outliers['region'].values
        
        df_out = df[df['region'].isin(outlier_regions)]
        df_ok = df[df['region'].isin(non_outlier_regions)]
        
        check_feats = ['country_ci', 'emaps_zone_ci', 'ground_truth_ci',
                       'local_pct_coal', 'local_pct_clean', 'emissions_per_capacity',
                       'emaps_zone_fossil_cap_frac', 'country_fossil_frac']
        print(f"  {'Feature':<30} {'Outliers':>10} {'Normal':>10} {'Ratio':>7}")
        print("  " + "-"*60)
        for f in check_feats:
            if f in df.columns:
                o_mean = df_out[f].mean()
                n_mean = df_ok[f].mean()
                ratio = o_mean / n_mean if n_mean != 0 else float('inf')
                print(f"  {f:<30} {o_mean:>10.1f} {n_mean:>10.1f} {ratio:>7.2f}")
        
        # Per-outlier deep dive
        print(f"\n  --- Per-Outlier Feature Dive ---")
        for _, row in outliers.iterrows():
            region = row['region']
            r_data = df[df['region'] == region].iloc[0]
            print(f"\n  [{region}] actual={row['actual']:.0f} pred={row['predicted']:.1f} err={row['error']:+.1f}")
            print(f"    country_ci={r_data.get('country_ci',0):.0f}  "
                  f"zone_ci={r_data.get('emaps_zone_ci',0):.0f}  "
                  f"idw_ci={r_data.get('idw_weighted_ci',0):.0f}")
            print(f"    pct_coal={r_data.get('local_pct_coal',0):.2f}  "
                  f"pct_clean={r_data.get('local_pct_clean',0):.2f}  "
                  f"fossil_frac={r_data.get('country_fossil_frac',0):.2f}")
            print(f"    zone_fossil_cap={r_data.get('emaps_zone_fossil_cap_frac',0):.2f}  "
                  f"zone_clean_cap={r_data.get('emaps_zone_clean_cap_frac',0):.2f}")
            
            # What would country_ci or zone_ci alone predict?
            print(f"    → country_ci alone would give: {r_data.get('country_ci',0):.0f} "
                  f"(err={r_data.get('country_ci',0) - row['actual']:+.0f})")
            print(f"    → zone_ci alone would give: {r_data.get('emaps_zone_ci',0):.0f} "
                  f"(err={r_data.get('emaps_zone_ci',0) - row['actual']:+.0f})")

    # 3c. Error by provider
    print(f"\n  --- Error by Provider ---")
    for prov in sorted(pred_df['provider'].unique()):
        p = pred_df[pred_df['provider'] == prov]
        print(f"  {prov}: n={len(p)}, MAE={p['abs_error'].mean():.1f}, "
              f"bias={p['error'].mean():+.1f}, max|err|={p['abs_error'].max():.0f}")

    # 3d. Error by CI range
    print(f"\n  --- Error by CI Range ---")
    for lo, hi, label in [(0, 50, "very clean"), (50, 200, "clean"),
                           (200, 400, "moderate"), (400, 600, "dirty"),
                           (600, 1000, "very dirty")]:
        band = pred_df[(pred_df['actual'] >= lo) & (pred_df['actual'] < hi)]
        if len(band) > 0:
            print(f"  {label:>12} ({lo:>3}–{hi:>3}): n={len(band):>3}, "
                  f"MAE={band['abs_error'].mean():5.1f}, bias={band['error'].mean():+6.1f}")

    # ══════════════════════════════════════════════════════════════════
    # PART 4: Export best model
    # ══════════════════════════════════════════════════════════════════
    print(f"\n{'='*70}")
    print("PART 4: Export best model")
    print(f"{'='*70}")
    
    best_feats = winner['feats']
    best_alpha = winner['alpha']
    
    subset = df[['ground_truth_ci'] + best_feats].dropna()
    X = subset[best_feats].values
    y = subset['ground_truth_ci'].values
    
    scaler = StandardScaler()
    X_s = scaler.fit_transform(X)
    model = Ridge(alpha=best_alpha)
    model.fit(X_s, y)
    
    print(f"\n  Coefficients:")
    print(f"  {'Feature':<35} {'Coeff':>8} {'|Coeff|':>8}")
    print("  " + "-"*55)
    for f, c in sorted(zip(best_feats, model.coef_), key=lambda x: -abs(x[1])):
        print(f"  {f:<35} {c:>+8.2f} {abs(c):>8.2f}")
    print(f"  {'intercept':<35} {model.intercept_:>+8.2f}")
    
    model_config = {
        "model_type": "ridge_regression",
        "alpha": best_alpha,
        "features": best_feats,
        "scaler_mean": scaler.mean_.tolist(),
        "scaler_scale": scaler.scale_.tolist(),
        "coefficients": model.coef_.tolist(),
        "intercept": float(model.intercept_),
        "training_samples": len(subset),
        "loo_mae": float(winner['mae']),
        "loo_r2": float(winner['r2']),
    }
    
    with open("trained_model.json", "w") as f:
        json.dump(model_config, f, indent=2)
    
    print(f"\n  ✅ Saved to trained_model.json")
    print(f"  Features: {best_feats}")
    print(f"  Alpha: {best_alpha}")
    print(f"  LOO MAE: {winner['mae']:.1f} gCO₂/kWh")
    print(f"  LOO R²:  {winner['r2']:.3f}")
    print(f"  Time: {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
