"""
Compare: current uniform-scaling vs time-varying spatial recomputation.

Current model:  CI(x,t) = CI_base(x) * (1 + b_avg(x) * t)
  -> frozen spatial pattern, only intensity changes

Physical model: recompute features per-year with projected plant emissions
  -> plants declining toward zero lose spatial influence
  -> clean regions expand as dirty neighbors shrink
  -> boundaries between high/low CI shift over time
"""
import numpy as np
import geo_estimator as ge
from geo_estimator import classify_fuel, FUEL_WEIGHTS

pp = ge.POWER_PLANTS_DF

# ── Setup: Saarland (Germany-France border) ──
lat, lon = 49.0, 7.0
radius_rad = 300.0 / 6371.0
target = np.array([[np.radians(lat), np.radians(lon)]])
indices = ge.POWER_TREE.query_radius(target, r=radius_rad)[0]
nearby = pp.iloc[indices]

lat_r, lon_r = np.radians(lat), np.radians(lon)
d_km = np.maximum(
    np.sqrt(
        (np.radians(nearby["lat"].values) - lat_r) ** 2
        + (np.radians(nearby["lon"].values) - lon_r) ** 2
    ) * 6371.0, 1.0,
)
w_idw = 1.0 / (d_km ** 2)  # spatial weights (fixed)
emi_base = nearby["emissions_quantity"].values
caps = np.where(nearby["capacity"].fillna(0).values > 0, nearby["capacity"].values, 1.0)
trend_bs = nearby["trend_b"].values
fuel_ci = np.array([FUEL_WEIGHTS.get(classify_fuel(st), 475) for st in nearby["source_type"]])

# Baseline CI from the model
res = ge.predict_grid_batch(np.array([lat]), np.array([lon]))
ci_base = float(res["ci"][0])
b_avg = float(res["tb"][0])

print(f"{'='*70}")
print(f"PHYSICAL MODEL vs UNIFORM SCALING: Saarland (49N, 7E)")
print(f"{'='*70}")
print(f"{len(nearby)} plants within 300km, CI_base={ci_base:.0f}, b_avg={b_avg:+.4f}")
print()

# ── Physical model: generation-weighted IDW ──
# CI(x,t) = sum[gen(p,t) * w_spatial * fuel_ci(p)] / sum[gen(p,t) * w_spatial]
# gen(p,t) proportional to capacity(p) * (1 + b(p)*t)

print(f"Year  {'Uniform':>8}  {'Physical':>8}  {'Diff':>6}  {'Phys vs base':>12}")
print("-" * 52)
for year in range(2024, 2036):
    t = year - 2024
    # Current: uniform scale
    ci_curr = ci_base * max(0, 1 + b_avg * t)

    # Physical: per-plant generation projection, then IDW-weighted average CI
    gen_scale = np.maximum(0, 1 + trend_bs * t)  # per-plant scale
    gen_t = caps * gen_scale  # projected generation (capacity * utilisation)
    w_t = gen_t * w_idw  # time-varying spatial weights
    w_sum = w_t.sum()
    if w_sum > 0:
        ci_phys = float(np.sum(w_t * fuel_ci) / w_sum)
    else:
        ci_phys = 0

    pct = (ci_phys / ci_base - 1) * 100 if ci_base > 0 else 0
    print(f"{year}  {ci_curr:8.1f}  {ci_phys:8.1f}  {ci_phys - ci_curr:+6.1f}  {pct:+10.1f}%")

# ── Transect: UK to Poland ──
print()
print(f"{'='*70}")
print(f"BOUNDARY SHIFT: CI=300 contour along lat=50N, -10E to 30E")
print(f"{'='*70}")
lats_t = np.full(161, 50.0)
lons_t = np.linspace(-10, 30, 161)
res_t = ge.predict_grid_batch(lats_t, lons_t)

# Precompute all-plant arrays
pp_lat_r = np.radians(pp["lat"].values)
pp_lon_r = np.radians(pp["lon"].values)
all_caps = np.where(pp["capacity"].fillna(0).values > 0, pp["capacity"].values, 1.0)
all_tb = pp["trend_b"].values
all_fuel_ci = np.array([FUEL_WEIGHTS.get(classify_fuel(st), 475) for st in pp["source_type"]])

threshold = 300
print(f"\n{'Year':<6} {'Current contour (lon)':>30}  {'Physical contour (lon)':>30}  Shift")
print("-" * 95)
for year_delta, label in [(0, "2024"), (2, "2026"), (4, "2028"), (6, "2030"), (8, "2032"), (10, "2034")]:
    # Current approach
    ci_curr = res_t["ci"] * np.maximum(0, 1 + res_t["tb"] * year_delta)

    # Physical approach
    ci_phys = np.zeros(len(lats_t))
    for i in range(len(lats_t)):
        lat_ri = np.radians(lats_t[i])
        lon_ri = np.radians(lons_t[i])
        pp_idx = ge.POWER_TREE.query_radius(
            np.array([[lat_ri, lon_ri]]), r=radius_rad
        )[0]
        if len(pp_idx) == 0:
            continue
        d = np.maximum(
            np.sqrt((pp_lat_r[pp_idx] - lat_ri) ** 2 + (pp_lon_r[pp_idx] - lon_ri) ** 2) * 6371.0,
            1.0,
        )
        wi = 1.0 / (d ** 2)
        gen_scale = np.maximum(0, 1 + all_tb[pp_idx] * year_delta)
        gen_t = all_caps[pp_idx] * gen_scale
        w = gen_t * wi
        ws = w.sum()
        if ws > 0:
            ci_phys[i] = float(np.sum(w * all_fuel_ci[pp_idx]) / ws)

    # Find crossings of threshold
    def find_crossings(ci_arr, thr):
        crossings = []
        for i in range(len(ci_arr) - 1):
            if ci_arr[i] > 0 and ci_arr[i+1] > 0:
                if (ci_arr[i] - thr) * (ci_arr[i + 1] - thr) < 0:
                    f = (thr - ci_arr[i]) / (ci_arr[i + 1] - ci_arr[i])
                    crossings.append(round(lons_t[i] + f * (lons_t[i + 1] - lons_t[i]), 1))
        return crossings

    cc = find_crossings(ci_curr, threshold)
    cp = find_crossings(ci_phys, threshold)

    cc_str = ", ".join(f"{x:.1f}" for x in cc) if cc else "none"
    cp_str = ", ".join(f"{x:.1f}" for x in cp) if cp else "none"

    shift_str = ""
    if cc and cp:
        shifts = [cp[i] - cc[i] for i in range(min(len(cc), len(cp)))]
        shift_str = ", ".join(f"{s:+.1f}" for s in shifts)

    print(f"{label:<6} {cc_str:>30}  {cp_str:>30}  {shift_str}")

print()
print("INTERPRETATION:")
print("  Current: boundaries move because CI scales uniformly toward 0")
print("           (all plants decline at same avg rate => contours just sweep)")
print("  Physical: boundaries move because INDIVIDUAL plants decline at different")
print("           rates => dirty plants lose influence, clean regions expand")
print("  The shift between current/physical shows how much boundary motion is")
print("  MISSED by uniform scaling vs captured by per-plant recomputation")
