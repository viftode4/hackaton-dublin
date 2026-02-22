"""Deep outlier analysis — what can we deduce from poor predictions?"""
import pandas as pd, numpy as np, json
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import LeaveOneOut, cross_val_predict

df = pd.read_csv("feature_analysis.csv")
feats = ['country_ci','emaps_zone_ci','country_ci_sq','country_coal_frac','country_fossil_frac','ct_grid_ci_est']
sub = df[['ground_truth_ci','region','provider','country_iso','lat','lon',
          'emaps_zone_clean_cap_frac','emaps_zone_fossil_cap_frac',
          'local_pct_coal','local_pct_clean','local_pct_fossil',
          'emissions_per_capacity','idw_weighted_ci','country_clean_frac',
          'n_plants_300km','total_emissions_300km'] + feats].dropna()
X = sub[feats].values; y = sub['ground_truth_ci'].values
sc = StandardScaler(); Xs = sc.fit_transform(X)
yp = cross_val_predict(Ridge(alpha=0.1), Xs, y, cv=LeaveOneOut())
sub = sub.copy()
sub['pred'] = yp
sub['error'] = yp - y
sub['abs_error'] = np.abs(sub['error'])
sub = sub.sort_values('abs_error', ascending=False)

sub['c_gt'] = sub['country_ci'] - sub['ground_truth_ci']
sub['z_gt'] = sub['emaps_zone_ci'] - sub['ground_truth_ci']
sub['c_z'] = sub['country_ci'] - sub['emaps_zone_ci']

SEP = "=" * 85
THRESH = 80

# ════════════════════════════════════════════════════════════
# PART 1: FAILURE MODE CATEGORISATION
# ════════════════════════════════════════════════════════════
outliers = sub[sub['abs_error'] > THRESH]
print(f"\n{SEP}")
print(f"FAILURE MODE ANALYSIS -- {len(outliers)} outliers (|error| > {THRESH})")
print(SEP)

mode_a = outliers[(outliers['c_gt'].abs() > THRESH) & (outliers['z_gt'].abs() > THRESH)]
mode_b = outliers[(outliers['z_gt'].abs() <= THRESH) & (outliers['c_gt'].abs() > THRESH)]
mode_c = outliers[(outliers['c_gt'].abs() <= THRESH) & (outliers['z_gt'].abs() > THRESH)]
mode_d = outliers[(outliers['c_gt'].abs() <= THRESH) & (outliers['z_gt'].abs() <= THRESH)]

for label, mode, desc in [
    ("A", mode_a, "Both country_ci AND zone_ci far from truth"),
    ("B", mode_b, "zone_ci OK, country_ci wrong -> country avg drags prediction"),
    ("C", mode_c, "country_ci OK, zone_ci wrong -> zone polygon mismatch"),
    ("D", mode_d, "Both inputs close, model still wrong -> interaction issue"),
]:
    print(f"\nMODE {label}: {desc} ({len(mode)} cases)")
    for _, r in mode.iterrows():
        print(f"  {r['region']:<25} GT={r['ground_truth_ci']:.0f}  "
              f"cCI={r['country_ci']:.0f}({r['c_gt']:+.0f})  "
              f"zCI={r['emaps_zone_ci']:.0f}({r['z_gt']:+.0f})  "
              f"pred={r['pred']:.0f}({r['error']:+.0f})")

# ════════════════════════════════════════════════════════════
# PART 2: SAME-COUNTRY DIVERGENCE
# ════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("SAME-COUNTRY DIVERGENCE -- regions sharing country with different GT")
print(SEP)

for cc in sorted(sub['country_iso'].unique()):
    group = sub[sub['country_iso'] == cc].sort_values('ground_truth_ci')
    if len(group) < 2:
        continue
    gt_range = group['ground_truth_ci'].max() - group['ground_truth_ci'].min()
    if gt_range < 50:
        continue
    avg_ae = group['abs_error'].mean()
    print(f"\n  {cc} -- {len(group)} regions, GT: "
          f"{group['ground_truth_ci'].min():.0f}-{group['ground_truth_ci'].max():.0f} "
          f"(spread={gt_range:.0f}), avg|err|={avg_ae:.0f}")
    for _, r in group.iterrows():
        flag = 'X' if r['abs_error'] > 100 else '!' if r['abs_error'] > 50 else ' '
        print(f"  {flag} {r['region']:<23} GT={r['ground_truth_ci']:>4.0f}  "
              f"cCI={r['country_ci']:>4.0f}  zCI={r['emaps_zone_ci']:>4.0f}  "
              f"pred={r['pred']:>4.0f}  err={r['error']:+5.0f}  "
              f"coal={r['local_pct_coal']:.2f} clean={r['local_pct_clean']:.2f}")

# ════════════════════════════════════════════════════════════
# PART 3: ZONE vs COUNTRY CI
# ════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("ZONE vs COUNTRY CI DISAGREEMENT")
print(SEP)

sub['z_better'] = sub['z_gt'].abs() < sub['c_gt'].abs()
disagree = sub[sub['c_z'].abs() > 50]
print(f"\n  {len(disagree)} regions where |country_ci - zone_ci| > 50:")
z_wins = disagree['z_better'].sum()
c_wins = len(disagree) - z_wins
print(f"    zone_ci closer to GT: {z_wins} ({100*z_wins/len(disagree):.0f}%)")
print(f"    country_ci closer:    {c_wins} ({100*c_wins/len(disagree):.0f}%)")
print(f"    zone_ci avg |gap|:    {disagree['z_gt'].abs().mean():.0f}")
print(f"    country_ci avg |gap|: {disagree['c_gt'].abs().mean():.0f}")

# ════════════════════════════════════════════════════════════
# PART 4: GT SOURCE ANALYSIS
# ════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("GROUND TRUTH SOURCE ANALYSIS")
print(SEP)
print("  GCP: Google Cloud region-carbon (2024 official)")
print("  AWS: Cloud Carbon Footprint (EPA/EEA grid factors)")
print("  Azure: Cloud Carbon Footprint (EPA/EEA)")

for prov in ['gcp', 'aws', 'azure']:
    p = sub[sub['provider'] == prov]
    print(f"\n  {prov.upper()} ({len(p)}): MAE={p['abs_error'].mean():.1f}, bias={p['error'].mean():+.1f}")

# Same coords, different providers, different GT?
print(f"\n  Co-located regions (different providers, same coordinates):")
sub['loc_key'] = sub['lat'].round(0).astype(str) + ',' + sub['lon'].round(0).astype(str)
for loc, grp in sub.groupby('loc_key'):
    provs = grp['provider'].unique()
    if len(provs) < 2:
        continue
    gt_vals = sorted(grp['ground_truth_ci'].unique())
    if len(gt_vals) > 1:
        rmap = dict(zip(grp['region'], grp['ground_truth_ci']))
        spread = max(gt_vals) - min(gt_vals)
        print(f"    ({loc}): GT spread={spread:.0f}  {rmap}")

# ════════════════════════════════════════════════════════════
# PART 5: FEATURE PROFILES
# ════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("FEATURE PROFILES: worst 15 vs best 30")
print(SEP)

worst = sub.head(15)
best = sub.tail(30)

compare_feats = ['ground_truth_ci', 'country_ci', 'emaps_zone_ci',
                 'country_coal_frac', 'country_fossil_frac', 'country_clean_frac',
                 'local_pct_coal', 'local_pct_clean', 'local_pct_fossil',
                 'emissions_per_capacity', 'idw_weighted_ci',
                 'emaps_zone_fossil_cap_frac', 'emaps_zone_clean_cap_frac',
                 'n_plants_300km', 'total_emissions_300km']

print(f"\n  {'Feature':<30} {'Worst15':>8} {'Best30':>8} {'Ratio':>6}")
print("  " + "-" * 56)
for f in compare_feats:
    w = worst[f].mean()
    b = best[f].mean()
    ratio = w / b if b != 0 else float('inf')
    print(f"  {f:<30} {w:>8.1f} {b:>8.1f} {ratio:>6.2f}")

# ════════════════════════════════════════════════════════════
# PART 6: FIXABILITY
# ════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("FIXABILITY ANALYSIS -- Can we improve each outlier?")
print(SEP)

for _, r in outliers.iterrows():
    gt = r['ground_truth_ci']
    pred = r['pred']
    err = r['error']
    cCI = r['country_ci']
    zCI = r['emaps_zone_ci']
    best_single = cCI if abs(cCI - gt) < abs(zCI - gt) else zCI
    best_err = best_single - gt
    
    print(f"\n  {r['region']} ({r['provider']}/{r['country_iso']})")
    print(f"    GT={gt:.0f}, pred={pred:.0f} (err={err:+.0f})")
    print(f"    cCI={cCI:.0f}(err={cCI-gt:+.0f})  zCI={zCI:.0f}(err={zCI-gt:+.0f})")
    
    if abs(cCI - gt) < 50 and abs(zCI - gt) > 150:
        print(f"    >>> ZONE MISMATCH: zCI={zCI:.0f} way off. cCI is {abs(cCI-gt):.0f} from GT")
    elif abs(zCI - gt) < 50 and abs(cCI - gt) > 150:
        print(f"    >>> COUNTRY AVG MISLEADING: cCI={cCI:.0f} doesn't represent this region")
    elif abs(cCI - gt) > 100 and abs(zCI - gt) > 100:
        print(f"    >>> IRREDUCIBLE: Neither source close (best={best_single:.0f}, |gap|={abs(best_err):.0f})")
    else:
        bn = "cCI" if abs(cCI - gt) < abs(zCI - gt) else "zCI"
        print(f"    >>> BLEND ISSUE: {bn}={best_single:.0f} (|gap|={abs(best_err):.0f}) but model gives |err|={abs(err):.0f}")

# ════════════════════════════════════════════════════════════
# PART 7: THEORETICAL FLOOR
# ════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("THEORETICAL ERROR FLOOR")
print(SEP)

sub['best_input'] = np.where(sub['c_gt'].abs() < sub['z_gt'].abs(), sub['country_ci'], sub['emaps_zone_ci'])
sub['best_err'] = np.abs(sub['best_input'] - sub['ground_truth_ci'])
sub['avg_err'] = np.abs((sub['country_ci'] + sub['emaps_zone_ci'])/2 - sub['ground_truth_ci'])

print(f"  Current Ridge model:         MAE = {sub['abs_error'].mean():.1f}")
print(f"  Oracle best(cCI, zCI):       MAE = {sub['best_err'].mean():.1f}")
print(f"  Simple average (cCI+zCI)/2:  MAE = {sub['avg_err'].mean():.1f}")
print(f"  country_ci only:             MAE = {sub['c_gt'].abs().mean():.1f}")
print(f"  zone_ci only:                MAE = {sub['z_gt'].abs().mean():.1f}")
ridge_delta = sub['abs_error'].mean() - sub['best_err'].mean()
print(f"\n  -> Ridge is {ridge_delta:.1f} above oracle floor")
ridge_beats = (sub['abs_error'] < sub['best_err']).sum()
print(f"  -> {ridge_beats}/{len(sub)} regions: Ridge BEATS oracle single-input")
