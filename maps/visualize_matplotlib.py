"""
Generate a 2D global heatmap of GridSync's Carbon Footprint Prediction using matplotlib.
"""
import argparse
import json
import os
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
from matplotlib.path import Path as MplPath
from geo_estimator import (
    predict_footprint, predict_grid_batch,
    load_power_plants, load_fossil_ops, load_data_centers, load_codecarbon,
)

BASELINE_YEAR = 2024  # trends are fitted on 2021-2024 (2025 excluded: incomplete data)


def _find_world_geojson_path() -> Path:
    current = Path(__file__).resolve().parent
    candidates = [
        current / "world.geojson",
        current.parent / "electricitymaps-contrib" / "geo" / "world.geojson",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "Could not find world.geojson. Expected one of: "
        + ", ".join(str(path) for path in candidates)
    )


def _load_land_polygons(world_geojson_path: Path):
    with world_geojson_path.open("r", encoding="utf-8") as file:
        geojson = json.load(file)

    polygons = []
    for feature in geojson.get("features", []):
        geometry = feature.get("geometry") or {}
        geometry_type = geometry.get("type")
        coordinates = geometry.get("coordinates") or []

        if geometry_type == "Polygon":
            polygon_list = [coordinates]
        elif geometry_type == "MultiPolygon":
            polygon_list = coordinates
        else:
            continue

        for polygon in polygon_list:
            if not polygon:
                continue
            outer_ring = polygon[0]
            if len(outer_ring) < 3:
                continue
            vertices = np.asarray(outer_ring, dtype=float)
            if vertices.ndim != 2 or vertices.shape[1] != 2:
                continue

            min_lon = float(np.min(vertices[:, 0]))
            max_lon = float(np.max(vertices[:, 0]))
            min_lat = float(np.min(vertices[:, 1]))
            max_lat = float(np.max(vertices[:, 1]))
            polygons.append((MplPath(vertices, closed=True), (min_lon, max_lon, min_lat, max_lat)))

    return polygons


def _build_land_mask(lons: np.ndarray, lats: np.ndarray, land_polygons) -> np.ndarray:
    lon_grid, lat_grid = np.meshgrid(lons, lats)
    flat_points = np.column_stack((lon_grid.ravel(), lat_grid.ravel()))
    land_mask_flat = np.zeros(flat_points.shape[0], dtype=bool)

    for polygon_path, (min_lon, max_lon, min_lat, max_lat) in land_polygons:
        candidates = (
            (~land_mask_flat)
            & (flat_points[:, 0] >= min_lon)
            & (flat_points[:, 0] <= max_lon)
            & (flat_points[:, 1] >= min_lat)
            & (flat_points[:, 1] <= max_lat)
        )
        candidate_indices = np.where(candidates)[0]
        if candidate_indices.size == 0:
            continue

        inside = polygon_path.contains_points(flat_points[candidate_indices])
        land_mask_flat[candidate_indices] |= inside

    return land_mask_flat.reshape((len(lats), len(lons)))


def _project_grid(base_grid: np.ndarray, trend_b_grid: np.ndarray,
                  target_year: int) -> np.ndarray:
    """Linear projection: CI(t) = CI_base * (1 + b*t).  (legacy fallback)"""
    t = target_year - BASELINE_YEAR
    b = np.nan_to_num(trend_b_grid, nan=0.0)
    scale = 1.0 + b * t
    projected = base_grid * scale
    projected = np.where(projected < 0, 0, projected)
    return projected


# ── Shared grid infrastructure (computed once, reused across years) ──
_GRID_CACHE: dict = {}


def _ensure_grid(lon_step: float = 1, lat_step: float = 1):
    """Build land mask and grid coordinates once, cache for reuse."""
    key = (lon_step, lat_step)
    if key in _GRID_CACHE:
        return _GRID_CACHE[key]

    from geo_estimator import POWER_PLANTS_DF
    if POWER_PLANTS_DF is None:
        print("Loading data layers for prediction engine...")
        load_codecarbon()
        load_power_plants()
        load_fossil_ops()
        load_data_centers()

    lons = np.arange(-180, 180 + lon_step, lon_step)
    lats = np.arange(-90, 90 + lat_step, lat_step)

    world_geojson_path = _find_world_geojson_path()
    print(f"Loading land mask polygons from {world_geojson_path}...")
    land_polygons = _load_land_polygons(world_geojson_path)
    land_mask = _build_land_mask(lons, lats, land_polygons)
    land_points = int(np.sum(land_mask))
    total_points = len(lats) * len(lons)
    print(f"  ✅ Land mask ready: {land_points}/{total_points} grid points on continents")

    land_ij = np.argwhere(land_mask)
    land_lats = lats[land_ij[:, 0]]
    land_lons = lons[land_ij[:, 1]]

    result = {
        "lons": lons, "lats": lats,
        "land_ij": land_ij, "land_lats": land_lats, "land_lons": land_lons,
        "land_points": land_points,
    }
    _GRID_CACHE[key] = result
    return result


def _predict_year_grid(
    lon_step: float = 1, lat_step: float = 1,
    it_load_mw: float = 50.0, target_year: int | None = None,
):
    """
    Run predict_grid_batch for a specific year, scattering results into 2D grids.

    When target_year is set, per-plant features are recomputed with projected
    emissions — so spatial boundaries shift as plants decline/grow.
    """
    g = _ensure_grid(lon_step, lat_step)
    lons, lats = g["lons"], g["lats"]
    land_ij, land_lats, land_lons = g["land_ij"], g["land_lats"], g["land_lons"]
    land_points = g["land_points"]

    year_label = f" for year {target_year}" if target_year else ""
    print(f"Running vectorised batch prediction for {land_points} land points{year_label}...")
    batch_result = predict_grid_batch(
        land_lats, land_lons, it_load_mw=it_load_mw, target_year=target_year,
    )

    ci_grid = np.full((len(lats), len(lons)), np.nan)
    footprint_grid = np.full((len(lats), len(lons)), np.nan)

    for k in range(land_points):
        i, j = land_ij[k]
        ci_grid[i, j] = batch_result["ci"][k]
        footprint_grid[i, j] = batch_result["fp"][k]

    return lons, lats, ci_grid, footprint_grid


def _build_base_grids(lon_step: float = 1, lat_step: float = 1, it_load_mw: float = 50.0):
    """Build baseline (2024) grids.  Returns (lons, lats, ci, fp, trend_b, it_load_mw)."""
    g = _ensure_grid(lon_step, lat_step)
    lons, lats = g["lons"], g["lats"]
    land_ij, land_lats, land_lons = g["land_ij"], g["land_lats"], g["land_lons"]
    land_points = g["land_points"]

    print(f"Running vectorised batch prediction for {land_points} land points...")
    batch_result = predict_grid_batch(land_lats, land_lons, it_load_mw=it_load_mw)

    footprint_grid = np.full((len(lats), len(lons)), np.nan)
    ci_grid = np.full((len(lats), len(lons)), np.nan)
    trend_b_grid = np.full((len(lats), len(lons)), np.nan)

    for k in range(land_points):
        i, j = land_ij[k]
        ci_grid[i, j] = batch_result["ci"][k]
        footprint_grid[i, j] = batch_result["fp"][k]
        trend_b_grid[i, j] = batch_result["tb"][k]

    return lons, lats, ci_grid, footprint_grid, trend_b_grid, it_load_mw


def _plot_year_maps(lons, lats, ci_grid, footprint_grid, it_load_mw: float, target_year: int, out_file: str):
    print(f"Generating year map for {target_year}...")

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(20, 8))

    cmap_ci = plt.get_cmap('RdYlGn_r')
    im1 = ax1.pcolormesh(lons, lats, ci_grid, cmap=cmap_ci, shading='nearest', vmin=0, vmax=800)
    ax1.set_title(
        f'GridSync Engine: Carbon Intensity Projection ({target_year}) (gCO₂/kWh)\nBased on country trend regression + local features',
        fontsize=14,
    )
    ax1.set_xlabel('Longitude')
    ax1.set_ylabel('Latitude')
    ax1.grid(color='white', linestyle='-', linewidth=0.5, alpha=0.3)
    fig.colorbar(im1, ax=ax1, label='gCO₂ / kWh')

    cmap_fp = plt.get_cmap('magma_r')
    vmax_fp = 50.0 * 1.58 * 800 * 8.76
    im2 = ax2.pcolormesh(lons, lats, footprint_grid, cmap=cmap_fp, shading='nearest', vmin=0, vmax=vmax_fp)
    ax2.set_title(
        f'Projected Carbon Footprint ({target_year}) (Tonnes CO₂/year)\nFor a Standard {it_load_mw} MW Data Center',
        fontsize=14,
    )
    ax2.set_xlabel('Longitude')
    ax2.set_ylabel('Latitude')
    ax2.grid(color='white', linestyle='-', linewidth=0.5, alpha=0.3)
    fig.colorbar(im2, ax=ax2, label='Tonnes CO₂ / year')

    plt.tight_layout()
    plt.savefig(out_file, dpi=200, bbox_inches='tight')
    print(f"✅ Saved year projection map to {out_file}")


def _plot_delta_map(lons, lats, delta_grid, year_from: int, year_to: int, out_file: str):
    print(f"Generating delta map: {year_from} → {year_to}...")

    fig, ax = plt.subplots(1, 1, figsize=(12, 7))
    vmax = float(np.nanpercentile(np.abs(delta_grid), 99))
    if vmax <= 0:
        vmax = 1.0
    cmap_delta = plt.get_cmap('RdBu_r')
    im = ax.pcolormesh(lons, lats, delta_grid, cmap=cmap_delta, shading='nearest', vmin=-vmax, vmax=vmax)
    ax.set_title(
        f'Change in Predicted Carbon Footprint ({year_from} → {year_to})\nTonnes CO₂/year for a 50 MW Data Center',
        fontsize=14,
    )
    ax.set_xlabel('Longitude')
    ax.set_ylabel('Latitude')
    ax.grid(color='white', linestyle='-', linewidth=0.5, alpha=0.3)
    fig.colorbar(im, ax=ax, label='Δ Tonnes CO₂ / year')

    plt.tight_layout()
    plt.savefig(out_file, dpi=200, bbox_inches='tight')
    print(f"✅ Saved delta map to {out_file}")


def _plot_ci_frame(lons, lats, ci_grid, year: int, out_file: str, vmin=0, vmax=800):
    """Plot a single-panel carbon intensity map (no footprint panel)."""
    fig, ax = plt.subplots(1, 1, figsize=(14, 7))
    cmap_ci = plt.get_cmap('RdYlGn_r')
    im = ax.pcolormesh(lons, lats, ci_grid, cmap=cmap_ci, shading='nearest', vmin=vmin, vmax=vmax)
    ax.set_title(
        f'GridSync Carbon Intensity Projection — {year}\ngCO₂/kWh  •  Based on Climate TRACE + Electricity Maps + CodeCarbon',
        fontsize=16, fontweight='bold',
    )
    ax.set_xlabel('Longitude')
    ax.set_ylabel('Latitude')
    ax.set_xlim(-180, 180)
    ax.set_ylim(-90, 90)
    ax.grid(color='white', linestyle='-', linewidth=0.3, alpha=0.3)
    fig.colorbar(im, ax=ax, label='gCO₂ / kWh', shrink=0.8)
    plt.tight_layout()
    plt.savefig(out_file, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"  ✅ Saved {out_file}")


def animate_years(start_year: int = 2026, n_years: int = 10, resolution: float = 0.5):
    """Generate per-year CI frames and stitch into an animated GIF.

    Each frame recomputes plant features with projected emissions for that year,
    so spatial boundaries shift as declining plants lose influence.
    """
    print(f"\n🎬 Generating animation: {start_year}–{start_year + n_years - 1} "
          f"(resolution={resolution}°)\n")

    # Pre-build grid/land mask (cached, done once)
    _ensure_grid(lon_step=resolution, lat_step=resolution)

    # Determine color range from baseline
    lons, lats, base_ci, _ = _predict_year_grid(
        lon_step=resolution, lat_step=resolution, target_year=BASELINE_YEAR,
    )
    vmax = float(np.nanpercentile(base_ci, 99))
    vmax = max(vmax, 100)

    frame_files = []
    years = list(range(start_year, start_year + n_years))
    for year in years:
        # Recompute features with projected per-plant emissions for this year
        lons, lats, ci_proj, _ = _predict_year_grid(
            lon_step=resolution, lat_step=resolution, target_year=year,
        )
        frame_path = f"_frame_ci_{year}.png"
        _plot_ci_frame(lons, lats, ci_proj, year, frame_path, vmin=0, vmax=vmax)
        frame_files.append(frame_path)

    # Stitch frames into GIF using Pillow
    from PIL import Image
    frames = [Image.open(f) for f in frame_files]
    gif_path = f"gridsync_animation_{start_year}_{start_year + n_years - 1}.gif"
    frames[0].save(
        gif_path,
        save_all=True,
        append_images=frames[1:],
        duration=800,   # ms per frame
        loop=0,         # loop forever
    )
    print(f"\n✅ Animation saved to {gif_path}")
    print(f"   {len(frames)} frames, {start_year}–{start_year + n_years - 1}")

    # Clean up individual frames
    for f in frame_files:
        os.remove(f)


def generate_maps(year: int | None = None, compare: tuple[int, int] | None = None):
    lons, lats, base_ci, base_footprint, trend_b, it_load_mw = _build_base_grids()

    if year is None and compare is None:
        year = BASELINE_YEAR

    if year is not None:
        # Use per-year recomputation for accurate boundary shifts
        lons, lats, ci_target, footprint_target = _predict_year_grid(target_year=year)
        out_file = f"grid_predictions_heatmap_{year}.png"
        _plot_year_maps(lons, lats, ci_target, footprint_target, it_load_mw, year, out_file)

    if compare is not None:
        year_from, year_to = compare
        _, _, _, fp_from = _predict_year_grid(target_year=year_from)
        _, _, _, fp_to = _predict_year_grid(target_year=year_to)
        delta = fp_to - fp_from
        out_file = f"grid_predictions_delta_{year_from}_to_{year_to}.png"
        _plot_delta_map(lons, lats, delta, year_from, year_to, out_file)


def _parse_args():
    parser = argparse.ArgumentParser(description="Generate GridSync yearly projection and delta maps")
    parser.add_argument("--year", type=int, default=None, help="Target year for projected CI/footprint map")
    parser.add_argument(
        "--compare",
        nargs=2,
        type=int,
        metavar=("YEAR_FROM", "YEAR_TO"),
        default=None,
        help="Generate one delta map showing footprint change from YEAR_FROM to YEAR_TO",
    )
    parser.add_argument(
        "--animate",
        action="store_true",
        help="Generate animated GIF of CI projections (default: 2026–2035)",
    )
    parser.add_argument("--start", type=int, default=2026, help="Start year for animation (default: 2026)")
    parser.add_argument("--nyears", type=int, default=10, help="Number of years in animation (default: 10)")
    parser.add_argument("--resolution", type=float, default=0.5, help="Grid resolution in degrees for animation (default: 0.5)")
    return parser.parse_args()

if __name__ == "__main__":
    args = _parse_args()
    if args.animate:
        animate_years(start_year=args.start, n_years=args.nyears, resolution=args.resolution)
    else:
        compare = tuple(args.compare) if args.compare else None
        generate_maps(year=args.year, compare=compare)
