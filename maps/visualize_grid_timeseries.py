"""
GridSync — Region-Based Time-Series CI Grid (0.25° resolution)

Builds a global 0.25° lat/lon grid, predicts carbon intensity at every land
point using the trained Ridge model, projects forward to 2030, and renders
an animated GIF showing CI evolution + a final differential frame.

Outputs:
  gridsync_grid_anim.gif   — animated GIF (2026 → 2030 + differential)
  gridsync_diff_2030.png   — static differential map

Run: python3 visualize_grid_timeseries.py
"""

import os, sys, json, math, time
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from matplotlib.colors import LinearSegmentedColormap

# ── Import engine (loads data at import time) ──
import geo_estimator as ge

# ── Config ──
RESOLUTION = 0.25          # degrees
LAT_RANGE = (-60, 80)
LON_RANGE = (-180, 180)
YEARS = [2026, 2027, 2028, 2029, 2030]
BASE_YEAR = 2025
MAX_TREND = 0.15           # cap |trend_b| at 15%/yr

OUT_DIR = os.path.dirname(__file__)


# =====================================================================
#  ISO-2 → ISO-3 mapping (for zone name → CodeCarbon lookup)
# =====================================================================
def build_iso2_to_iso3():
    """Build ISO Alpha-2 → Alpha-3 map from CodeCarbon's energy mix data."""
    # Standard mapping (covers the important ones)
    ISO2_TO_ISO3 = {
        "AD":"AND","AE":"ARE","AF":"AFG","AG":"ATG","AL":"ALB","AM":"ARM",
        "AO":"AGO","AR":"ARG","AT":"AUT","AU":"AUS","AW":"ABW","AX":"ALA",
        "AZ":"AZE","BA":"BIH","BB":"BRB","BD":"BGD","BE":"BEL","BF":"BFA",
        "BG":"BGR","BH":"BHR","BI":"BDI","BJ":"BEN","BM":"BMU","BN":"BRN",
        "BO":"BOL","BR":"BRA","BS":"BHS","BT":"BTN","BW":"BWA","BY":"BLR",
        "BZ":"BLZ","CA":"CAN","CD":"COD","CF":"CAF","CG":"COG","CH":"CHE",
        "CI":"CIV","CL":"CHL","CM":"CMR","CN":"CHN","CO":"COL","CR":"CRI",
        "CU":"CUB","CV":"CPV","CY":"CYP","CZ":"CZE","DE":"DEU","DJ":"DJI",
        "DK":"DNK","DM":"DMA","DO":"DOM","DZ":"DZA","EC":"ECU","EE":"EST",
        "EG":"EGY","ER":"ERI","ES":"ESP","ET":"ETH","FI":"FIN","FJ":"FJI",
        "FO":"FRO","FR":"FRA","GA":"GAB","GB":"GBR","GD":"GRD","GE":"GEO",
        "GH":"GHA","GI":"GIB","GL":"GRL","GM":"GMB","GN":"GIN","GQ":"GNQ",
        "GR":"GRC","GT":"GTM","GW":"GNB","GY":"GUY","HK":"HKG","HN":"HND",
        "HR":"HRV","HT":"HTI","HU":"HUN","ID":"IDN","IE":"IRL","IL":"ISR",
        "IN":"IND","IQ":"IRQ","IR":"IRN","IS":"ISL","IT":"ITA","JM":"JAM",
        "JO":"JOR","JP":"JPN","KE":"KEN","KG":"KGZ","KH":"KHM","KI":"KIR",
        "KM":"COM","KN":"KNA","KP":"PRK","KR":"KOR","KW":"KWT","KY":"CYM",
        "KZ":"KAZ","LA":"LAO","LB":"LBN","LC":"LCA","LI":"LIE","LK":"LKA",
        "LR":"LBR","LS":"LSO","LT":"LTU","LU":"LUX","LV":"LVA","LY":"LBY",
        "MA":"MAR","MC":"MCO","MD":"MDA","ME":"MNE","MG":"MDG","MK":"MKD",
        "ML":"MLI","MM":"MMR","MN":"MNG","MO":"MAC","MR":"MRT","MT":"MLT",
        "MU":"MUS","MV":"MDV","MW":"MWI","MX":"MEX","MY":"MYS","MZ":"MOZ",
        "NA":"NAM","NE":"NER","NG":"NGA","NI":"NIC","NL":"NLD","NO":"NOR",
        "NP":"NPL","NR":"NRU","NZ":"NZL","OM":"OMN","PA":"PAN","PE":"PER",
        "PG":"PNG","PH":"PHL","PK":"PAK","PL":"POL","PM":"SPM","PR":"PRI",
        "PS":"PSE","PT":"PRT","PW":"PLW","PY":"PRY","QA":"QAT","RO":"ROU",
        "RS":"SRB","RU":"RUS","RW":"RWA","SA":"SAU","SB":"SLB","SC":"SYC",
        "SD":"SDN","SE":"SWE","SG":"SGP","SI":"SVN","SK":"SVK","SL":"SLE",
        "SM":"SMR","SN":"SEN","SO":"SOM","SR":"SUR","SS":"SSD","ST":"STP",
        "SV":"SLV","SX":"SXM","SY":"SYR","SZ":"SWZ","TC":"TCA","TD":"TCD",
        "TG":"TGO","TH":"THA","TJ":"TJK","TL":"TLS","TM":"TKM","TN":"TUN",
        "TO":"TON","TR":"TUR","TT":"TTO","TV":"TUV","TW":"TWN","TZ":"TZA",
        "UA":"UKR","UG":"UGA","US":"USA","UY":"URY","UZ":"UZB","VA":"VAT",
        "VC":"VCT","VE":"VEN","VN":"VNM","VU":"VUT","WS":"WSM","XK":"XKX",
        "YE":"YEM","YT":"MYT","ZA":"ZAF","ZM":"ZMB","ZW":"ZWE",
    }
    return ISO2_TO_ISO3


# =====================================================================
#  1.  Batch zone-name lookup (vectorised with STRtree)
# =====================================================================
def batch_zone_names(lats, lons):
    """Return zone name for each (lat, lon). '' where no zone found."""
    N = len(lats)
    names = np.full(N, '', dtype=object)

    if ge.ZONE_POLY_TREE is None:
        return names

    from shapely import points as make_points
    pts = make_points(lons, lats)
    result = ge.ZONE_POLY_TREE.query(pts, predicate='intersects')

    if result.shape[1] > 0:
        for inp_i, tree_i in zip(result[0], result[1]):
            if names[inp_i] == '':
                names[inp_i] = ge.ZONE_POLY_NAMES[tree_i]

    # Nearest fallback for coastline points
    unmatched = np.where(names == '')[0]
    if len(unmatched) > 0 and len(unmatched) < 200_000:
        nearest_idx = ge.ZONE_POLY_TREE.nearest(pts[unmatched])
        for i, ui in enumerate(unmatched):
            ni = nearest_idx[i]
            if ge.ZONE_POLYGONS[ni].distance(pts[ui]) < 0.3:
                names[ui] = ge.ZONE_POLY_NAMES[ni]

    return names


# =====================================================================
#  2.  Batch local_trend_b via BallTree
# =====================================================================
def batch_local_trend_b(lats, lons, radius_km=300):
    """Capacity-weighted local trend for each point. Falls back to country trend."""
    N = len(lats)
    trends = np.zeros(N)

    if ge.POWER_TREE is None:
        return trends

    coords = np.column_stack([np.radians(lats), np.radians(lons)])
    radius_rad = radius_km / 6371.0

    # Batch query — returns list of index arrays
    indices = ge.POWER_TREE.query_radius(coords, r=radius_rad)

    trend_b_vals = ge.POWER_PLANTS_DF['trend_b'].values
    cap_vals = ge.POWER_PLANTS_DF['capacity'].fillna(1.0).values

    for i in range(N):
        idx = indices[i]
        if len(idx) > 0:
            caps = cap_vals[idx]
            w = caps / max(caps.sum(), 1.0)
            trends[i] = float(np.dot(trend_b_vals[idx], w))

    return trends


# =====================================================================
#  3.  Main pipeline: grid → predict → project
# =====================================================================
def compute_grid():
    t0 = time.time()
    ISO2_TO_ISO3 = build_iso2_to_iso3()

    # ── Build grid ──
    lats = np.arange(LAT_RANGE[0], LAT_RANGE[1], RESOLUTION)
    lons = np.arange(LON_RANGE[0], LON_RANGE[1], RESOLUTION)
    LAT, LON = np.meshgrid(lats, lons, indexing='ij')
    n_lat, n_lon = LAT.shape
    flat_lat = LAT.ravel()
    flat_lon = LON.ravel()
    N = len(flat_lat)
    print(f"Grid: {n_lat} × {n_lon} = {N:,} points (0.25° resolution)")

    # ── Zone name + CI lookup (vectorised) ──
    print("Step 1/4: Zone lookup …")
    zone_names = batch_zone_names(flat_lat, flat_lon)
    zone_ci_flat = np.array([
        ge.ZONE_POLY_CI.get(z, np.nan) for z in zone_names
    ], dtype=float)

    land_mask = (zone_names != '') & np.isfinite(zone_ci_flat) & (zone_ci_flat > 0)
    n_land = land_mask.sum()
    print(f"  {n_land:,} land points with zone CI ({100*n_land/N:.1f}%)")

    # ── Country features for land points ──
    print("Step 2/4: Country features …")
    land_zones = zone_names[land_mask]
    land_zone_ci = zone_ci_flat[land_mask]
    land_lats = flat_lat[land_mask]
    land_lons = flat_lon[land_mask]

    # Zone name → country ISO3
    def zone_to_iso3(z):
        prefix = z.split('-')[0] if '-' in z else z
        return ISO2_TO_ISO3.get(prefix, '')

    land_iso3 = np.array([zone_to_iso3(z) for z in land_zones])

    # Country CI + coal fraction + trend
    land_country_ci = np.array([
        ge.CODECARBON_MIX.get(iso, {}).get('carbon_intensity', np.nan)
        for iso in land_iso3
    ], dtype=float)

    # Fallback: if no country CI, use zone CI
    no_country = np.isnan(land_country_ci)
    land_country_ci[no_country] = land_zone_ci[no_country]

    land_coal_frac = np.array([
        (ge.CODECARBON_MIX.get(iso, {}).get('coal_TWh', 0) or 0) /
        max(ge.CODECARBON_MIX.get(iso, {}).get('total_TWh', 0) or 1, 1e-9)
        for iso in land_iso3
    ], dtype=float)

    land_trend_pct = np.array([
        ge.COUNTRY_TRENDS.get(iso, {}).get('pct_change_per_year', 0.0)
        for iso in land_iso3
    ], dtype=float)

    # ── Local trend_b (BallTree batch) ──
    print("Step 3/4: Local trends (BallTree) …")
    land_local_trend = batch_local_trend_b(land_lats, land_lons, radius_km=300)

    # Fallback to country trend where no local plants
    no_local = land_local_trend == 0.0
    land_local_trend[no_local] = land_trend_pct[no_local] / 100.0

    # Cap extreme trends
    land_local_trend = np.clip(land_local_trend, -MAX_TREND, MAX_TREND)

    # ── Ridge prediction (vectorised) ──
    print("Step 4/4: Ridge prediction …")
    model = ge.REGRESSION_MODEL
    features = model['features']
    scaler_mean = np.array(model['scaler_mean'])
    scaler_scale = np.array(model['scaler_scale'])
    coefs = np.array(model['coefficients'])
    intercept = model['intercept']

    # Build feature matrix (n_land × 8)
    feat_dict = {
        'country_ci': land_country_ci,
        'emaps_zone_ci': land_zone_ci,
        'sqrt_zone_ci': np.sqrt(np.maximum(land_zone_ci, 0)),
        'zone_x_country': land_zone_ci * land_country_ci / 1000.0,
        'country_ci_sq': land_country_ci ** 2 / 1000.0,
        'country_coal_frac': land_coal_frac,
        'country_trend_pct': land_trend_pct,
        'local_trend_x_ci': land_local_trend * land_zone_ci,
    }

    X = np.column_stack([feat_dict.get(f, np.zeros(n_land)) for f in features])
    X_scaled = (X - scaler_mean) / scaler_scale
    predicted_ci = X_scaled @ coefs + intercept

    # Hybrid: for clean grids (zone CI < 100), use zone CI directly
    clean_mask = land_zone_ci < 100
    predicted_ci[clean_mask] = land_zone_ci[clean_mask]
    predicted_ci = np.clip(predicted_ci, 0, 1200)

    # ── Project to future years ──
    grids = {}
    for yr in YEARS:
        dt = yr - BASE_YEAR
        scale = np.clip(1.0 + land_local_trend * dt, 0.05, 3.0)
        ci_yr = np.clip(predicted_ci * scale, 0, 1200)

        full = np.full(N, np.nan)
        full[land_mask] = ci_yr
        grids[yr] = full.reshape(n_lat, n_lon)

    # Differential
    diff = grids[2030] - grids[2026]

    elapsed = time.time() - t0
    print(f"✅ Done in {elapsed:.1f}s")

    return lats, lons, grids, diff


# =====================================================================
#  4.  Render matplotlib frames + GIF
# =====================================================================
def render_gif(lats, lons, grids, diff):
    """Render 6 frames: CI 2026-2030 + differential, save as GIF."""
    import imageio.v2 as imageio

    # ── Colormaps ──
    # Absolute CI: green → yellow → orange → red → dark red
    ci_cmap = LinearSegmentedColormap.from_list('ci', [
        (0.00, '#0a3d0a'),    # very clean (forest green)
        (0.08, '#1a8a1a'),    # clean
        (0.20, '#2ecc71'),    # moderate clean
        (0.35, '#f1c40f'),    # moderate
        (0.50, '#e67e22'),    # high
        (0.70, '#e74c3c'),    # very high
        (0.85, '#8b0000'),    # extreme
        (1.00, '#4a0000'),    # max
    ])

    # Diff: green (improving) → white (neutral) → red (worsening)
    diff_cmap = LinearSegmentedColormap.from_list('diff', [
        (0.0,  '#1a9641'),
        (0.25, '#66bd63'),
        (0.45, '#d9ef8b'),
        (0.5,  '#ffffbf'),
        (0.55, '#fee08b'),
        (0.75, '#f46d43'),
        (1.0,  '#d73027'),
    ])

    LON, LAT = np.meshgrid(lons, lats)
    frames = []
    frame_paths = []

    # Pre-extract zone boundary coordinates for drawing outlines
    zone_boundaries = []
    if ge.ZONE_POLYGONS is not None:
        from shapely.geometry import MultiPolygon, Polygon
        for geom in ge.ZONE_POLYGONS:
            if geom is None:
                continue
            polys = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
            for poly in polys:
                if poly.is_empty:
                    continue
                coords = np.array(poly.exterior.coords)
                zone_boundaries.append(coords)

    def draw_boundaries(ax):
        """Draw zone polygon outlines on the axes."""
        for coords in zone_boundaries:
            ax.plot(coords[:, 0], coords[:, 1], color='#555555',
                    linewidth=0.3, alpha=0.6)

    annotations = [
        (53.3, -6.3, 'Dublin'),
        (50.1, 8.7, 'Frankfurt'),
        (1.3, 103.8, 'Singapore'),
        (-33.9, 151.2, 'Sydney'),
        (19.1, 72.9, 'Mumbai'),
        (-23.5, -46.6, 'São Paulo'),
        (41.9, -93.1, 'Iowa'),
        (-26.2, 28.0, 'Joburg'),
    ]

    for i, yr in enumerate(YEARS):
        print(f"  Rendering {yr} …")
        fig, ax = plt.subplots(figsize=(18, 9), facecolor='#0d1117')
        ax.set_facecolor('#0d1117')

        im = ax.pcolormesh(
            LON, LAT, grids[yr],
            cmap=ci_cmap, vmin=0, vmax=900,
            shading='auto', rasterized=True,
        )

        draw_boundaries(ax)

        cbar = fig.colorbar(im, ax=ax, shrink=0.6, pad=0.02, aspect=30)
        cbar.set_label('Carbon Intensity (gCO₂/kWh)', color='white', fontsize=12)
        cbar.ax.tick_params(colors='white')

        ax.set_title(
            f'GridSync — Predicted Carbon Intensity {yr}',
            color='white', fontsize=18, fontweight='bold', pad=15,
        )
        ax.set_xlabel('Longitude', color='white', fontsize=11)
        ax.set_ylabel('Latitude', color='white', fontsize=11)
        ax.tick_params(colors='white')
        for spine in ax.spines.values():
            spine.set_color('#333')

        ax.set_xlim(LON_RANGE)
        ax.set_ylim(LAT_RANGE)
        ax.grid(True, alpha=0.15, color='white', linewidth=0.3)

        for alat, alon, aname in annotations:
            ax.plot(alon, alat, 'w*', markersize=6, markeredgewidth=0.3)
            ax.annotate(aname, (alon, alat), color='white', fontsize=7,
                        xytext=(4, 4), textcoords='offset points',
                        fontweight='bold', alpha=0.8,
                        bbox=dict(boxstyle='round,pad=0.15', fc='black', alpha=0.5, ec='none'))

        fig.tight_layout()
        fpath = os.path.join(OUT_DIR, f'_frame_{yr}.png')
        fig.savefig(fpath, dpi=120, facecolor='#0d1117')
        frame_paths.append(fpath)
        plt.close(fig)

    # ── Differential frame ──
    print("  Rendering differential …")
    fig, ax = plt.subplots(figsize=(18, 9), facecolor='#0d1117')
    ax.set_facecolor('#0d1117')

    max_abs = np.nanquantile(np.abs(diff), 0.95)
    max_abs = min(200, max(50, max_abs))

    im = ax.pcolormesh(
        LON, LAT, diff,
        cmap=diff_cmap, vmin=-max_abs, vmax=max_abs,
        shading='auto', rasterized=True,
    )

    draw_boundaries(ax)

    cbar = fig.colorbar(im, ax=ax, shrink=0.6, pad=0.02, aspect=30)
    cbar.set_label('ΔCI 2030−2026 (gCO₂/kWh)', color='white', fontsize=12)
    cbar.ax.tick_params(colors='white')

    ax.set_title(
        'GridSync — Carbon Intensity Change 2030 vs 2026\n'
        'Green = Improving  |  Red = Worsening',
        color='white', fontsize=18, fontweight='bold', pad=15,
    )
    ax.set_xlabel('Longitude', color='white', fontsize=11)
    ax.set_ylabel('Latitude', color='white', fontsize=11)
    ax.tick_params(colors='white')
    for spine in ax.spines.values():
        spine.set_color('#333')
    ax.set_xlim(LON_RANGE)
    ax.set_ylim(LAT_RANGE)
    ax.grid(True, alpha=0.15, color='white', linewidth=0.3)

    for alat, alon, aname in annotations:
        ax.plot(alon, alat, 'w*', markersize=6, markeredgewidth=0.3)
        ax.annotate(aname, (alon, alat), color='white', fontsize=7,
                    xytext=(4, 4), textcoords='offset points',
                    fontweight='bold', alpha=0.8,
                    bbox=dict(boxstyle='round,pad=0.15', fc='black', alpha=0.5, ec='none'))

    fig.tight_layout()
    diff_path = os.path.join(OUT_DIR, 'gridsync_diff_2030.png')
    fig.savefig(diff_path, dpi=120, facecolor='#0d1117')
    frame_paths.append(diff_path)
    plt.close(fig)
    print(f"✅ Saved {diff_path}")

    # ── Assemble GIF ──
    print("  Assembling GIF …")
    images = []
    for fp in frame_paths:
        images.append(imageio.imread(fp))

    # Ensure all frames are the same size (crop/pad to min common size)
    shapes = [img.shape for img in images]
    min_h = min(s[0] for s in shapes)
    min_w = min(s[1] for s in shapes)
    images = [img[:min_h, :min_w] for img in images]

    # Last frame (diff) stays longer
    durations = [1.2] * len(YEARS) + [3.0]

    gif_path = os.path.join(OUT_DIR, 'gridsync_grid_anim.gif')
    imageio.mimsave(gif_path, images, duration=durations, loop=0)
    print(f"✅ Saved {gif_path}")

    # Clean up temp frames
    for fp in frame_paths:
        if '_frame_' in fp:
            os.remove(fp)

    return gif_path, diff_path


# =====================================================================
#  Main
# =====================================================================
def main():
    print("\n" + "=" * 60)
    print("GridSync — Grid-Based Time-Series CI Map (0.25° resolution)")
    print("=" * 60)

    lats, lons, grids, diff = compute_grid()

    # Print summary
    for yr in YEARS:
        g = grids[yr]
        land = g[np.isfinite(g)]
        print(f"  {yr}: mean={land.mean():.0f}  median={np.median(land):.0f}  "
              f"min={land.min():.0f}  max={land.max():.0f}")
    d = diff[np.isfinite(diff)]
    print(f"  Δ:    mean={d.mean():+.1f}  median={np.median(d):+.1f}  "
          f"min={d.min():+.0f}  max={d.max():+.0f}")
    improving = (d < -5).sum()
    worsening = (d > 5).sum()
    stable = len(d) - improving - worsening
    print(f"  Pixels: {improving:,} improving | {stable:,} stable | {worsening:,} worsening")

    print("\nRendering frames …")
    render_gif(lats, lons, grids, diff)

    print("\nDone!")


if __name__ == "__main__":
    main()
