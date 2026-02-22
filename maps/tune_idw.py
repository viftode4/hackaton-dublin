"""
Tune IDW weighting: sweep exponent p, radius, and capacity weighting
to find the optimal distance falloff for carbon intensity prediction.

Current: w = cap / dist^2,  radius=300km
"""
import sys, os, math, json, warnings, time
warnings.filterwarnings('ignore')
import numpy as np, pandas as pd
from sklearn.neighbors import BallTree
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import LeaveOneOut, cross_val_predict

# ── Paths ──
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)
HACK = os.path.dirname(ROOT)

CT_PATH = os.path.join(HACK, "electricitymaps-contrib/config/data_centers/data_centers.json")
FUEL_WEIGHTS = {
    'coal': 995, 'natural_gas': 490, 'petroleum': 816, 'fossil': 700,
    'solar': 48, 'wind': 26, 'hydroelectricity': 26, 'nuclear': 29,
    'geothermal': 38, 'biomass': 230, 'world_average': 475,
}

def classify_fuel(src):
    if pd.isna(src): return 'unknown'
    s = str(src).lower()
    if 'coal' in s: return 'coal'
    if 'gas' in s: return 'natural_gas'
    if 'oil' in s or 'petrol' in s: return 'petroleum'
    if 'solar' in s: return 'solar'
    if 'wind' in s: return 'wind'
    if 'hydro' in s: return 'hydroelectricity'
    if 'nuclear' in s: return 'nuclear'
    if 'geo' in s: return 'geothermal'
    if 'bio' in s: return 'biomass'
    return 'fossil'


def load_data():
    """Load power plants, renewables from cache, and feature_analysis.csv."""
    import pickle
    
    cache_dir = os.path.join(SCRIPT_DIR, ".cache")
    
    with open(os.path.join(cache_dir, "power_plants.pkl"), "rb") as f:
        pp_data = pickle.load(f)
    pp_df = pp_data["df"]
    print(f"Loaded {len(pp_df)} power plants from cache")
    
    with open(os.path.join(cache_dir, "renew_plants.pkl"), "rb") as f:
        rn_data = pickle.load(f)
    wri_df = rn_data["df"]
    print(f"Loaded {len(wri_df)} renewable plants from cache")
    
    fa = pd.read_csv(os.path.join(SCRIPT_DIR, "feature_analysis.csv"))
    
    return pp_df, wri_df, fa


def compute_idw(pp_df, wri_df, fa, exponent, radius_km, use_cap_weight=True):
    """Compute IDW-weighted CI for all cloud regions with given parameters."""
    
    world_avg = FUEL_WEIGHTS['world_average']
    
    # Build trees
    pp_coords = np.radians(pp_df[['lat', 'lon']].values)
    pp_tree = BallTree(pp_coords, metric='haversine')
    
    pp_fuel_cats = pp_df['source_type'].map(classify_fuel).values
    pp_fuel_ci = np.array([FUEL_WEIGHTS.get(fc, world_avg) for fc in pp_fuel_cats])
    pp_caps = pp_df['capacity'].fillna(1.0).values
    pp_caps = np.where(pp_caps > 0, pp_caps, 1.0)
    
    if wri_df is not None and len(wri_df) > 0:
        wri_coords = np.radians(wri_df[['latitude', 'longitude']].values)
        wri_tree = BallTree(wri_coords, metric='haversine')
        wri_caps = wri_df['capacity_mw'].fillna(1.0).values
        wri_cats = wri_df['fuel_cat'].values  # already classified
        wri_ci = np.array([FUEL_WEIGHTS.get(fc, 48) for fc in wri_cats])
    else:
        wri_tree = None
    
    radius_rad = radius_km / 6371.0
    idw_values = np.full(len(fa), np.nan)
    
    for i in range(len(fa)):
        lat, lon = fa.iloc[i]['lat'], fa.iloc[i]['lon']
        target = [[math.radians(lat), math.radians(lon)]]
        
        # Fossil/thermal plants
        ind = pp_tree.query_radius(target, r=radius_rad)
        pp_idx = ind[0]
        
        w_total = 0.0
        w_ci = 0.0
        
        if len(pp_idx) > 0:
            d_rad = np.sqrt((pp_coords[pp_idx, 0] - target[0][0])**2 + 
                           (pp_coords[pp_idx, 1] - target[0][1])**2)
            d_km = np.maximum(d_rad * 6371, 1.0)
            
            if use_cap_weight:
                w = pp_caps[pp_idx] / (d_km ** exponent)
            else:
                w = 1.0 / (d_km ** exponent)
            
            w_total += w.sum()
            w_ci += (w * pp_fuel_ci[pp_idx]).sum()
        
        # Renewable plants
        if wri_tree is not None:
            rn_ind = wri_tree.query_radius(target, r=radius_rad)
            rn_idx = rn_ind[0]
            
            if len(rn_idx) > 0:
                d_rad_rn = np.sqrt((wri_coords[rn_idx, 0] - target[0][0])**2 + 
                                   (wri_coords[rn_idx, 1] - target[0][1])**2)
                d_km_rn = np.maximum(d_rad_rn * 6371, 1.0)
                
                if use_cap_weight:
                    w_rn = wri_caps[rn_idx] / (d_km_rn ** exponent)
                else:
                    w_rn = 1.0 / (d_km_rn ** exponent)
                
                w_total += w_rn.sum()
                w_ci += (w_rn * wri_ci[rn_idx]).sum()
        
        if w_total > 0:
            idw_values[i] = w_ci / w_total
    
    return idw_values


def loo_mae(df, feats, alpha=1.0):
    sub = df[['ground_truth_ci'] + feats].dropna()
    X = sub[feats].values
    y = sub['ground_truth_ci'].values
    sc = StandardScaler()
    Xs = sc.fit_transform(X)
    yp = cross_val_predict(Ridge(alpha=alpha), Xs, y, cv=LeaveOneOut())
    return np.abs(y - yp).mean(), len(sub), 1 - ((y-yp)**2).sum()/((y-y.mean())**2).sum()


def main():
    t0 = time.time()
    pp_df, wri_df, fa = load_data()
    
    print(f"\n{'='*70}")
    print(f"IDW TUNING — {len(fa)} cloud regions")
    print(f"{'='*70}")
    
    # Current best model features (without idw)
    base_feats = ['country_ci', 'emaps_zone_ci', 'country_ci_sq', 'country_coal_frac']
    
    # Also compute sqrt_zone_ci and zone_x_country for current best model comparison
    fa['sqrt_zone_ci'] = np.sqrt(fa['emaps_zone_ci'].clip(0))
    fa['zone_x_country'] = fa['emaps_zone_ci'] * fa['country_ci'] / 1000.0
    
    current_best_feats = ['country_ci', 'emaps_zone_ci', 'sqrt_zone_ci', 'zone_x_country', 'country_ci_sq', 'country_coal_frac']
    mae_current, n_current, r2_current = loo_mae(fa, current_best_feats)
    print(f"\n  Current best model (6 feats): MAE={mae_current:.1f}, R²={r2_current:.3f}, n={n_current}")
    
    # ── Sweep parameters ──
    exponents = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0]
    radii = [150, 200, 300, 500, 750]
    cap_options = [True, False]
    
    print(f"\n  Sweeping {len(exponents)} exponents × {len(radii)} radii × {len(cap_options)} cap options "
          f"= {len(exponents)*len(radii)*len(cap_options)} configs")
    
    results = []
    
    # Part 1: Correlation sweep (fast)
    print(f"\n{'='*70}")
    print("PART 1: IDW Correlation with Ground Truth")
    print(f"{'='*70}")
    print(f"  {'Exp':>4} {'Radius':>6} {'Cap?':>5} {'Corr':>6} {'|Corr|':>7}")
    print("  " + "-"*35)
    
    best_corr = 0
    best_config = None
    
    for cap_w in cap_options:
        for radius in radii:
            for exp in exponents:
                col = f"idw_p{exp}_r{radius}_{'cap' if cap_w else 'nocap'}"
                idw_vals = compute_idw(pp_df, wri_df, fa, exp, radius, cap_w)
                fa[col] = idw_vals
                
                valid = fa[['ground_truth_ci', col]].dropna()
                corr = valid['ground_truth_ci'].corr(valid[col])
                
                if abs(corr) > best_corr:
                    best_corr = abs(corr)
                    best_config = (exp, radius, cap_w, col)
                
                results.append({
                    'exp': exp, 'radius': radius, 'cap_weight': cap_w,
                    'col': col, 'corr': corr, 'abs_corr': abs(corr),
                })
    
    results.sort(key=lambda x: -x['abs_corr'])
    for r in results[:15]:
        print(f"  {r['exp']:>4.1f} {r['radius']:>5}km {'yes' if r['cap_weight'] else 'no':>5} "
              f"{r['corr']:>+6.3f} {r['abs_corr']:>7.3f}")
    
    print(f"\n  Current IDW (p=2, r=300, cap): corr={fa['ground_truth_ci'].corr(fa['idw_weighted_ci']):.3f}")
    print(f"  Best: p={best_config[0]}, r={best_config[1]}, cap={'yes' if best_config[2] else 'no'} "
          f"→ corr={best_corr:.3f}")
    
    # Part 2: Model integration (use top-N IDW variants as features)
    print(f"\n{'='*70}")
    print("PART 2: Model Integration — does IDW improve the Ridge model?")
    print(f"{'='*70}")
    
    # Test top 10 IDW variants as additional features
    top_idw = [r['col'] for r in results[:10]]
    
    print(f"\n  {'IDW Config':<40} {'MAE':>6} {'Δ':>6} {'R²':>6} {'N':>4}")
    print("  " + "-"*65)
    print(f"  {'(baseline, no IDW)':<40} {mae_current:>6.1f} {'':>6} {r2_current:>6.3f} {n_current:>4}")
    
    improvements = []
    for col in top_idw:
        feats = current_best_feats + [col]
        mae, n, r2 = loo_mae(fa, feats)
        delta = mae - mae_current
        improvements.append((col, mae, delta, r2, n))
        marker = '✅' if delta < -0.5 else '⚠️' if delta < 0 else '❌'
        print(f"  {marker} {col:<38} {mae:>6.1f} {delta:>+6.1f} {r2:>6.3f} {n:>4}")
    
    # Also test: replace existing idw_weighted_ci with best variant
    print(f"\n  Replacing idw_weighted_ci with best variants in model:")
    for col in top_idw[:5]:
        # Try current model but swap idw if it was in there
        for alpha in [0.1, 0.5, 1.0, 2.0]:
            feats = current_best_feats + [col]
            mae, n, r2 = loo_mae(fa, feats, alpha=alpha)
            delta = mae - mae_current
            if delta < -0.3:
                print(f"    {col} α={alpha}: MAE={mae:.1f} (Δ={delta:+.1f})")
    
    # Part 3: Interaction with other features
    print(f"\n{'='*70}")
    print("PART 3: Best IDW × other features")
    print(f"{'='*70}")
    
    best_col = results[0]['col']
    extra_candidates = ['country_fossil_frac', 'ct_grid_ci_est', 'local_pct_coal',
                        'local_pct_clean', 'emissions_per_capacity', 'abs_lat',
                        'emaps_zone_fossil_cap_frac', 'is_gcp']
    
    print(f"\n  Base: current 6 feats + {best_col}")
    base_plus_idw = current_best_feats + [best_col]
    mae_bi, n_bi, r2_bi = loo_mae(fa, base_plus_idw)
    print(f"  MAE={mae_bi:.1f} (Δ={mae_bi-mae_current:+.1f})")
    
    print(f"\n  + one more feature:")
    for ec in extra_candidates:
        if ec in fa.columns:
            feats = base_plus_idw + [ec]
            mae, n, r2 = loo_mae(fa, feats)
            delta = mae - mae_current
            marker = '✅' if delta < -0.5 else '❌'
            print(f"  {marker} +{ec:<35} MAE={mae:>6.1f} (Δ={delta:+.1f})")
    
    # Part 4: Summary
    print(f"\n{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}")
    
    best_improvement = min(improvements, key=lambda x: x[1])
    print(f"  Current model MAE:  {mae_current:.1f}")
    print(f"  Best with IDW:      {best_improvement[1]:.1f} (using {best_improvement[0]})")
    print(f"  Improvement:        {best_improvement[2]:+.1f}")
    
    if best_improvement[2] < -0.5:
        print(f"\n  ✅ IDW tuning helps! Best config: {best_improvement[0]}")
    else:
        print(f"\n  ⚠️  IDW tuning provides marginal/no improvement over current model")
    
    # Show optimal vs current IDW
    print(f"\n  Optimal IDW params: exponent={results[0]['exp']}, radius={results[0]['radius']}km, "
          f"cap_weight={'yes' if results[0]['cap_weight'] else 'no'}")
    print(f"  Current IDW params: exponent=2.0, radius=300km, cap_weight=yes")
    
    print(f"\n  Time: {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
