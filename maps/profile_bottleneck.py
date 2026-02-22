"""Benchmark old (per-point) vs new (batch) prediction."""
import time
import numpy as np

# === OLD per-point approach ===
from geo_estimator import predict_footprint, predict_grid_batch

# Generate a set of test coordinates (land-ish points)
test_lats = np.array([48.8, 40.7, 35.6, 51.5, -33.8, 55.7, 37.4, 31.2, 19.4, 28.6,
                       1.3, -22.9, 30.0, 45.0, 60.0, -15.0, 10.0, 52.0, 25.0, 35.0])
test_lons = np.array([2.3, -74.0, 139.7, -0.1, 151.2, 37.6, -122.1, 121.5, -99.1, 77.2,
                       103.8, -43.2, 31.0, -75.0, 25.0, -47.0, -67.0, 21.0, 55.0, 136.0])

N = len(test_lats)

# --- OLD: per-point serial ---
t0 = time.perf_counter()
for i in range(N):
    predict_footprint(test_lats[i], test_lons[i], 50, disable_live_api=True, disable_reverse_geocoder=True)
t_old = time.perf_counter() - t0
print(f"\nOLD (serial, {N} pts):  {t_old:.3f}s  ({t_old/N*1000:.1f} ms/pt)")

# --- NEW: batch ---
t0 = time.perf_counter()
result = predict_grid_batch(test_lats, test_lons, it_load_mw=50.0)
t_new = time.perf_counter() - t0
print(f"NEW (batch,  {N} pts):  {t_new:.3f}s  ({t_new/N*1000:.1f} ms/pt)")
print(f"\nSpeedup: {t_old/t_new:.1f}x")

# Verify results are similar
for i in range(min(5, N)):
    old = predict_footprint(test_lats[i], test_lons[i], 50, disable_live_api=True, disable_reverse_geocoder=True)
    old_ci = old['carbon_intensity_gCO2_kWh']
    new_ci = result['ci'][i]
    print(f"  ({test_lats[i]:.1f}, {test_lons[i]:.1f}): old_ci={old_ci:.1f}  new_ci={new_ci:.1f}  diff={abs(old_ci-new_ci):.1f}")

# Scale test: simulate 3819 points
print(f"\n--- Larger scale test ---")
# Create 3819 random land-ish points
rng = np.random.default_rng(42)
big_lats = rng.uniform(-60, 70, 3819)
big_lons = rng.uniform(-180, 180, 3819)

t0 = time.perf_counter()
big_result = predict_grid_batch(big_lats, big_lons, it_load_mw=50.0)
t_big = time.perf_counter() - t0
print(f"Batch 3819 pts: {t_big:.2f}s  ({t_big/3819*1000:.2f} ms/pt)")
print(f"Old estimate:   {3819 * t_old/N:.1f}s")
print(f"Actual speedup: {3819 * t_old/N / t_big:.1f}x")
