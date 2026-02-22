"""
GridSync Hybrid Carbon Engine — Multi-Source Prediction Backend

Data layers:
  Layer 1: CodeCarbon global_energy_mix.json  (~213 countries)
  Layer 2: Climate TRACE power plants         (11,589 assets)
  Layer 2b: Climate TRACE fossil fuel ops     (coal mines, refineries)
  Layer 2c: WRI GPPD clean plants             (23,559 solar/wind/hydro/nuclear)
  Layer 3: UK Carbon Intensity API            (GB real-time)
  Layer 4: Electricity Maps zone polygons     (364 grid zones, point-in-polygon)
  Ref: carbon_intensity_per_source.json       (fuel-type weights)
  Ref: Data centers                           (147 hyperscalers)

Prediction: Hybrid IDW + MCDA → Green Score 0–100 (A–F grade)

Run: python3 geo_estimator.py
API: http://localhost:8000/docs
"""

import json
import math
import os
from collections import defaultdict
import urllib.request
import urllib.error
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.neighbors import BallTree

app = FastAPI(title="GridSync Hybrid Carbon Engine", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================================
#  GLOBAL DATA STORES
# =====================================================================
DATA_CENTERS = []
DC_TREE = None
DC_COORDS = []

POWER_PLANTS_DF = None
POWER_TREE = None

FOSSIL_OPS_DF = None    # Coal mines + oil refineries + gas production
FOSSIL_TREE = None

RENEW_PLANTS_DF = None  # WRI Global Power Plant Database (clean plants)
RENEW_TREE = None

ZONE_POLYGONS = None     # list of shapely MultiPolygon geometries
ZONE_POLY_NAMES = None   # list of zone names (matches polygon order)
ZONE_POLY_TREE = None    # shapely STRtree for vectorised point-in-polygon
ZONE_POLY_CI = {}        # zone_name -> CI value (gCO₂/kWh)

# Resolve all paths relative to this script's directory (works regardless of CWD)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_SCRIPT_DIR)  # hackaton-dublin/
_HACK = os.path.dirname(_ROOT)        # hackathon/
_p = lambda *parts: os.path.join(*parts)

CODECARBON_USA_PATH = _p(_HACK, "codecarbon/codecarbon/data/private_infra/2016/usa_emissions.json")
CODECARBON_CAN_PATH = _p(_HACK, "codecarbon/codecarbon/data/private_infra/2023/canada_energy_mix.json")
REGRESSION_MODEL_PATH = _p(_SCRIPT_DIR, "trained_model.json")

CODECARBON_MIX = {}
FUEL_WEIGHTS = {}       # gCO2eq/kWh per fuel type from CodeCarbon
USA_EMISSIONS = {}
CAN_EMISSIONS = {}
REGRESSION_MODEL = {}
EMAPS_ZONE_TREE = None   # BallTree for Electricity Maps zone lookups
EMAPS_ZONE_CI = None     # array of zone CI values  
EMAPS_ZONE_KEYS = []     # zone key names
EMAPS_ZONE_CLEAN_FRAC = None  # array of zone clean capacity fractions
EMAPS_ZONE_FOSSIL_FRAC = None # array of zone fossil capacity fractions
EMAPS_ZONE_COAL_MW = None     # array of zone coal capacity in MW

COUNTRY_TRENDS = {}     # {iso3: {years: [...], emissions: [...], slope, r2, projected}}

UK_CI_API = "https://api.carbonintensity.org.uk"

# Paths (relative to workspace root via _HACK)
DATA_CENTERS_PATH = _p(_HACK, "electricitymaps-contrib/config/data_centers/data_centers.json")
EMAPS_ZONES_DIR = _p(_HACK, "electricitymaps-contrib/config/zones")
CLIMATE_TRACE_POWER = _p(_HACK, "datasets_tracer/power/DATA/electricity-generation_emissions_sources_v5_3_0.csv")
CLIMATE_TRACE_COAL = _p(_HACK, "datasets_tracer/fossil_fuel_operations/DATA/coal-mining_emissions_sources_v5_3_0.csv")
CLIMATE_TRACE_REFINING = _p(_HACK, "datasets_tracer/fossil_fuel_operations/DATA/oil-and-gas-refining_emissions_sources_v5_3_0.csv")
CLIMATE_TRACE_OILGAS = _p(_HACK, "datasets_tracer/fossil_fuel_operations/DATA/oil-and-gas-production_emissions_sources_v5_3_0.csv")
WRI_GPPD_PATH = _p(_HACK, "datasets_tracer/globalpowerplantdatabasev130/global_power_plant_database.csv")
WORLD_GEOJSON_PATH = _p(_HACK, "electricitymaps-contrib/geo/world.geojson")
CODECARBON_MIX_PATH = _p(_HACK, "codecarbon/codecarbon/data/private_infra/global_energy_mix.json")
CODECARBON_FUEL_PATH = _p(_HACK, "codecarbon/codecarbon/data/private_infra/carbon_intensity_per_source.json")


# =====================================================================
#  LAYER 1: CodeCarbon
# =====================================================================
def load_codecarbon():
    global CODECARBON_MIX, FUEL_WEIGHTS, USA_EMISSIONS, CAN_EMISSIONS, REGRESSION_MODEL
    print("[Layer 1] Loading CodeCarbon data...")
    with open(CODECARBON_MIX_PATH) as f:
        CODECARBON_MIX = json.load(f)
    with open(CODECARBON_FUEL_PATH) as f:
        FUEL_WEIGHTS = json.load(f)
    try:
        with open(CODECARBON_USA_PATH) as f:
            USA_EMISSIONS = json.load(f)
        with open(CODECARBON_CAN_PATH) as f:
            CAN_EMISSIONS = json.load(f)
        with open(REGRESSION_MODEL_PATH) as f:
            REGRESSION_MODEL = json.load(f)
        print(f"  ✅ {len(CODECARBON_MIX)} countries, {len(USA_EMISSIONS)} states, {len(CAN_EMISSIONS)} provinces")
        print(f"  ✅ Trained Regression Model loaded")
    except Exception as e:
        print(f"  ⚠️ Could not load sub-national data: {e}")


# =====================================================================
#  LAYER 2: Climate TRACE Power Plants
# =====================================================================
_CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache")

def _cache_path(name: str) -> str:
    os.makedirs(_CACHE_DIR, exist_ok=True)
    return os.path.join(_CACHE_DIR, name)

def _source_mtime(path: str) -> float:
    try:
        return os.path.getmtime(path)
    except Exception:
        return 0.0


def load_power_plants():
    global POWER_PLANTS_DF, POWER_TREE, COUNTRY_TRENDS
    import pickle

    cache_file = _cache_path("power_plants.pkl")
    source_mtime = _source_mtime(CLIMATE_TRACE_POWER)

    # Try loading from cache
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "rb") as f:
                cached = pickle.load(f)
            if cached.get("source_mtime") == source_mtime:
                POWER_PLANTS_DF = cached["df"]
                COUNTRY_TRENDS = cached["trends"]
                coords = np.radians(POWER_PLANTS_DF[['lat', 'lon']].values)
                POWER_TREE = BallTree(coords, metric='haversine')
                print(f"[Layer 2] ⚡ Loaded {len(POWER_PLANTS_DF)} power plants from cache "
                      f"({len(COUNTRY_TRENDS)} trends)")
                return
        except Exception as e:
            print(f"  ⚠️ Cache invalid: {e}")

    print("[Layer 2] Loading power plants (all years for trends)...")
    cols = ['source_name', 'source_type', 'start_time', 'iso3_country',
            'lat', 'lon', 'emissions_quantity', 'capacity',
            'emissions_factor', 'activity', 'other5']
    raw = pd.read_csv(CLIMATE_TRACE_POWER, usecols=cols)
    raw = raw.dropna(subset=['lat', 'lon', 'emissions_quantity'])
    raw['year'] = pd.to_datetime(raw['start_time']).dt.year
    years_available = sorted(raw['year'].unique())
    latest = raw['year'].max()
    # The most recent year often has incomplete/preliminary data in Climate TRACE
    # (e.g. every country shows ~10% emission drop in 2025 that's missing data,
    # not real decarbonization).  Exclude it from trend fitting.
    TREND_YEARS_MAX = latest - 1   # fit on 2021-2024, use 2025 only as baseline
    print(f"  Years available: {years_available}  (trends fitted on ≤{TREND_YEARS_MAX})")

    # Build country-year emission trends
    country_year = raw.groupby(['iso3_country', 'year'])['emissions_quantity'].sum().reset_index()
    for iso3, grp in country_year.groupby('iso3_country'):
        grp = grp.sort_values('year')
        # Use only complete years for trend fitting
        grp_trend = grp[grp['year'] <= TREND_YEARS_MAX]
        years = grp_trend['year'].values.astype(float)
        emissions = grp_trend['emissions_quantity'].values
        if len(years) >= 2:
            # Linear regression: emissions = slope * year + intercept
            x_mean = years.mean()
            y_mean = emissions.mean()
            ss_xy = ((years - x_mean) * (emissions - y_mean)).sum()
            ss_xx = ((years - x_mean) ** 2).sum()
            slope = ss_xy / ss_xx if ss_xx > 0 else 0
            intercept = y_mean - slope * x_mean
            # R² goodness of fit
            y_pred = slope * years + intercept
            ss_res = ((emissions - y_pred) ** 2).sum()
            ss_tot = ((emissions - y_mean) ** 2).sum()
            r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
            # Projection
            current = slope * latest + intercept
            proj_2027 = slope * 2027 + intercept
            proj_2030 = slope * 2030 + intercept
            pct_change_per_year = (slope / max(abs(current), 1)) * 100
            COUNTRY_TRENDS[iso3] = {
                "years": years.astype(int).tolist(),
                "emissions_by_year": {int(y): round(float(e)) for y, e in zip(years, emissions)},
                "slope_tonnes_per_year": round(float(slope)),
                "pct_change_per_year": round(float(pct_change_per_year), 2),
                "r_squared": round(float(r2), 3),
                "projected_2027": max(0, round(float(proj_2027))),
                "projected_2030": max(0, round(float(proj_2030))),
                "trend": "improving" if slope < -abs(current) * 0.01 else
                         "worsening" if slope > abs(current) * 0.01 else "stable",
            }
    print(f"  ✅ {len(COUNTRY_TRENDS)} country emission trends computed")

    # ── Per-plant LINEAR emission trends (vectorised) ──
    # For each plant, aggregate annual emissions and fit a linear slope on
    # COMPLETE years only:  emissions(t) = b·t + c   where t = year - BASELINE
    # Linear is preferred over quadratic because with only 4 data points
    # (2021-2024) quadratic has just 1 DOF and diverges on extrapolation.
    BASELINE = float(TREND_YEARS_MAX)  # normalise so t=0 is the last complete year
    plant_annual = raw[raw['year'] <= TREND_YEARS_MAX].groupby(
        ['source_name', 'year']
    ).agg(
        emissions=('emissions_quantity', 'sum'),
        capacity=('capacity', 'first'),
    ).reset_index()

    # Vectorised linear regression via pivot table
    pivot = plant_annual.pivot_table(
        index='source_name', columns='year', values='emissions', aggfunc='sum'
    )
    trend_years = sorted([y for y in pivot.columns if y <= TREND_YEARS_MAX])
    pivot_mat = pivot[trend_years].values  # (n_plants, n_years)
    t_vec = np.array(trend_years, dtype=float) - BASELINE  # e.g. [-3, -2, -1, 0]
    n_years = len(t_vec)

    # For each plant: fit b via least-squares  b = Σ(t·e) / Σ(t²) after centering
    t_mean = t_vec.mean()
    tc = t_vec - t_mean  # centered t
    ss_t = (tc ** 2).sum()  # scalar

    # Handle NaN (plant missing some years): use nanmean/nansum
    e_mean = np.nanmean(pivot_mat, axis=1, keepdims=True)  # (n_plants, 1)
    ec = np.where(np.isnan(pivot_mat), 0.0, pivot_mat - e_mean)  # centered emissions
    valid_mask = ~np.isnan(pivot_mat)  # which cells are valid
    # Slope: b = Σ(tc * ec) / Σ(tc² * valid)  per plant
    numerator = (ec * tc[np.newaxis, :]).sum(axis=1)
    denominator = (valid_mask * (tc ** 2)[np.newaxis, :]).sum(axis=1)
    b_raw = np.where(denominator > 0, numerator / denominator, 0.0)
    # Intercept: c = e_mean - b * t_mean
    c_vals = e_mean.ravel() - b_raw * t_mean
    # Current emissions at t=0 (baseline year): c is the intercept at t=0
    e_current = c_vals.copy()
    small = np.abs(e_current) < 1
    e_current[small] = np.maximum(np.abs(e_mean.ravel()[small]), 1.0)
    # Normalise to fractional change per year
    b_norm = b_raw / e_current
    # Clamp to physically reasonable bounds: |b| ≤ 0.15 → max ±15%/yr
    MAX_B = 0.15
    b_norm = np.clip(b_norm, -MAX_B, MAX_B)

    # Get capacity per plant (from latest available year)
    cap_df = plant_annual.groupby('source_name')['capacity'].last()
    plant_names = pivot.index.values

    plant_trends = {}
    for i, name in enumerate(plant_names):
        cap = cap_df.get(name, 1.0)
        cap = float(cap) if pd.notna(cap) and cap > 0 else 1.0
        plant_trends[name] = {'b': float(b_norm[i]), 'cap': cap}
    print(f"  ✅ {len(plant_trends)} plant-level linear trends computed")

    # For spatial queries, use only latest year
    latest_df = raw[raw['year'] == latest]
    POWER_PLANTS_DF = latest_df.groupby('source_name', as_index=False).agg({
        'source_type': 'first', 'iso3_country': 'first',
        'lat': 'first', 'lon': 'first',
        'emissions_quantity': 'sum', 'capacity': 'first',
        'emissions_factor': 'mean',   # plant-level t CO2e/MWh
        'activity': 'sum',            # annual MWh generated
        'other5': 'mean',             # capacity factor (0-1)
    })
    # Attach linear trend coefficient to each plant
    POWER_PLANTS_DF['trend_b'] = POWER_PLANTS_DF['source_name'].map(
        lambda n: plant_trends.get(n, {}).get('b', 0.0)
    )
    coords = np.radians(POWER_PLANTS_DF[['lat', 'lon']].values)
    POWER_TREE = BallTree(coords, metric='haversine')
    print(f"  ✅ {len(POWER_PLANTS_DF)} power plants (spatial index, year {latest})")

    # Save to cache for fast reload
    try:
        with open(cache_file, "wb") as f:
            pickle.dump({
                "source_mtime": source_mtime,
                "df": POWER_PLANTS_DF,
                "trends": COUNTRY_TRENDS,
            }, f, protocol=pickle.HIGHEST_PROTOCOL)
        print(f"  💾 Cached to {cache_file}")
    except Exception as e:
        print(f"  ⚠️ Cache save failed: {e}")


# =====================================================================
#  LAYER 2b: Fossil Fuel Operations
# =====================================================================
def load_fossil_ops():
    global FOSSIL_OPS_DF, FOSSIL_TREE
    import pickle

    cache_file = _cache_path("fossil_ops.pkl")
    source_mtimes = tuple(_source_mtime(p) for p, _ in [
        (CLIMATE_TRACE_COAL, ""), (CLIMATE_TRACE_REFINING, ""), (CLIMATE_TRACE_OILGAS, "")])
    
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "rb") as f:
                cached = pickle.load(f)
            if cached.get("source_mtimes") == source_mtimes:
                FOSSIL_OPS_DF = cached["df"]
                coords = np.radians(FOSSIL_OPS_DF[['lat', 'lon']].values)
                FOSSIL_TREE = BallTree(coords, metric='haversine')
                print(f"[Layer 2b] ⚡ Loaded {len(FOSSIL_OPS_DF)} fossil ops from cache")
                return
        except Exception:
            pass

    print("[Layer 2b] Loading fossil fuel operations...")
    cols = ['source_name', 'source_type', 'iso3_country', 'start_time',
            'lat', 'lon', 'emissions_quantity', 'capacity']
    dfs = []
    for path, label in [(CLIMATE_TRACE_COAL, "coal-mining"),
                         (CLIMATE_TRACE_REFINING, "oil-refining"),
                         (CLIMATE_TRACE_OILGAS, "oil-gas-production")]:
        try:
            df = pd.read_csv(path, usecols=cols)
            df = df.dropna(subset=['lat', 'lon', 'emissions_quantity'])
            df['year'] = pd.to_datetime(df['start_time']).dt.year
            latest = df['year'].max()
            df = df[df['year'] == latest]
            dedup = df.groupby('source_name', as_index=False).agg({
                'source_type': 'first', 'iso3_country': 'first',
                'lat': 'first', 'lon': 'first',
                'emissions_quantity': 'sum', 'capacity': 'first',
            })
            dedup['sector'] = label
            dfs.append(dedup)
            print(f"     {label}: {len(dedup)} assets")
        except Exception as e:
            print(f"     ⚠️ {label}: {e}")

    if dfs:
        FOSSIL_OPS_DF = pd.concat(dfs, ignore_index=True)
        coords = np.radians(FOSSIL_OPS_DF[['lat', 'lon']].values)
        FOSSIL_TREE = BallTree(coords, metric='haversine')
        print(f"  ✅ {len(FOSSIL_OPS_DF)} total fossil operations")
        try:
            with open(cache_file, "wb") as f:
                pickle.dump({"source_mtimes": source_mtimes, "df": FOSSIL_OPS_DF},
                            f, protocol=pickle.HIGHEST_PROTOCOL)
        except Exception:
            pass
    else:
        print("  ⚠️ No fossil operation data loaded")


# =====================================================================
#  LAYER 2c: WRI Renewable Plants
# =====================================================================
def load_renewables():
    """Load WRI Global Power Plant Database — clean energy plants only.

    These plants have lat/lon + capacity but NO emissions (they're clean).
    Used to correct local_pct_clean and dilute IDW-weighted CI near
    hydro/nuclear/solar/wind-dominated grids.
    """
    global RENEW_PLANTS_DF, RENEW_TREE
    import pickle

    cache_file = _cache_path("renew_plants.pkl")
    source_mtime = _source_mtime(WRI_GPPD_PATH)

    if os.path.exists(cache_file):
        try:
            with open(cache_file, "rb") as f:
                cached = pickle.load(f)
            if cached.get("source_mtime") == source_mtime:
                RENEW_PLANTS_DF = cached["df"]
                coords = np.radians(RENEW_PLANTS_DF[['latitude', 'longitude']].values)
                RENEW_TREE = BallTree(coords, metric='haversine')
                print(f"[Layer 2c] ⚡ Loaded {len(RENEW_PLANTS_DF)} renewable plants from cache")
                return
        except Exception:
            pass

    print("[Layer 2c] Loading WRI Global Power Plant Database (renewables)...")
    clean_fuels = {'Solar', 'Wind', 'Hydro', 'Nuclear', 'Geothermal', 'Wave and Tidal'}
    df = pd.read_csv(WRI_GPPD_PATH, low_memory=False)
    df = df[df['primary_fuel'].isin(clean_fuels)].copy()
    df = df.dropna(subset=['latitude', 'longitude', 'capacity_mw'])
    df = df[df['capacity_mw'] > 0]

    # Classify fuel type to match our naming convention
    fuel_map = {
        'Hydro': 'hydroelectricity', 'Nuclear': 'nuclear',
        'Solar': 'solar', 'Wind': 'wind',
        'Geothermal': 'geothermal', 'Wave and Tidal': 'hydroelectricity',
    }
    df['fuel_cat'] = df['primary_fuel'].map(fuel_map)

    RENEW_PLANTS_DF = df[['name', 'country', 'primary_fuel', 'fuel_cat',
                          'capacity_mw', 'latitude', 'longitude']].reset_index(drop=True)

    coords = np.radians(RENEW_PLANTS_DF[['latitude', 'longitude']].values)
    RENEW_TREE = BallTree(coords, metric='haversine')
    print(f"  ✅ {len(RENEW_PLANTS_DF)} clean power plants")
    by_fuel = RENEW_PLANTS_DF['primary_fuel'].value_counts()
    for fuel, cnt in by_fuel.items():
        print(f"     {fuel}: {cnt}")

    try:
        with open(cache_file, "wb") as f:
            pickle.dump({"source_mtime": source_mtime, "df": RENEW_PLANTS_DF},
                        f, protocol=pickle.HIGHEST_PROTOCOL)
        print(f"  💾 Cached to {cache_file}")
    except Exception as e:
        print(f"  ⚠️ Cache save failed: {e}")


# =====================================================================
#  DATA CENTERS
# =====================================================================
def load_data_centers():
    global DATA_CENTERS, DC_TREE, DC_COORDS
    print("[DC Index] Loading data centers...")
    with open(DATA_CENTERS_PATH) as f:
        dc_raw = json.load(f)
    for key, data in dc_raw.items():
        if "lonlat" in data:
            lon, lat = data["lonlat"]
            DATA_CENTERS.append({
                "id": key, "provider": data.get("provider", "unknown"),
                "zoneKey": data.get("zoneKey", "unknown"),
                "lon": lon, "lat": lat
            })
            DC_COORDS.append([math.radians(lat), math.radians(lon)])
    if DC_COORDS:
        DC_TREE = BallTree(DC_COORDS, metric='haversine')
    print(f"  ✅ {len(DATA_CENTERS)} data centers")


# =====================================================================
#  ELECTRICITY MAPS ZONE CI DATA
# =====================================================================
def load_emaps_zones():
    """Load Electricity Maps zone configs and compute estimated CI per zone."""
    global EMAPS_ZONE_TREE, EMAPS_ZONE_CI, EMAPS_ZONE_KEYS
    global EMAPS_ZONE_CLEAN_FRAC, EMAPS_ZONE_FOSSIL_FRAC, EMAPS_ZONE_COAL_MW
    import yaml, glob, pickle as _pkl

    cache_file = _cache_path("emaps_zones.pkl")
    # Use directory mtime as cache key
    dir_mtime = _source_mtime(EMAPS_ZONES_DIR)
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "rb") as f:
                cached = _pkl.load(f)
            if cached.get("dir_mtime") == dir_mtime:
                EMAPS_ZONE_KEYS = cached["keys"]
                _coords = cached["coords"]
                EMAPS_ZONE_TREE = BallTree(np.radians(_coords), metric='haversine')
                EMAPS_ZONE_CI = cached["ci"]
                EMAPS_ZONE_CLEAN_FRAC = cached["clean_frac"]
                EMAPS_ZONE_FOSSIL_FRAC = cached["fossil_frac"]
                EMAPS_ZONE_COAL_MW = cached["coal_mw"]
                print(f"[eMaps] ⚡ Loaded {len(EMAPS_ZONE_KEYS)} zones from cache")
                return
        except Exception:
            pass

    print("[eMaps] Loading Electricity Maps zone CI data...")
    zone_ci_data = {}
    zone_files = glob.glob(os.path.join(EMAPS_ZONES_DIR, "*.yaml"))
    fuel_ef_defaults = {
        'coal': 995, 'gas': 490, 'oil': 816, 'biomass': 230,
        'nuclear': 29, 'hydro': 26, 'wind': 26, 'solar': 48,
        'geothermal': 38, 'unknown': 475,
        'hydro discharge': 26, 'battery discharge': 200,
    }
    for zpath in zone_files:
        try:
            with open(zpath) as zf:
                zdata = yaml.safe_load(zf)
            if not zdata:
                continue
            zone_key = os.path.basename(zpath).replace('.yaml', '')
            cp_raw = zdata.get('center_point')
            if isinstance(cp_raw, list) and len(cp_raw) == 2:
                cp = {'lon': cp_raw[0], 'lat': cp_raw[1]}
            elif isinstance(cp_raw, dict):
                cp = cp_raw
            else:
                bb = zdata.get('bounding_box', [])
                if isinstance(bb, list) and len(bb) == 2:
                    cp = {'lon': (bb[0][0] + bb[1][0]) / 2, 'lat': (bb[0][1] + bb[1][1]) / 2}
                else:
                    continue
            fbm = zdata.get('fallbackZoneMixes', {})
            power_mix = fbm.get('powerOriginRatios', [])
            ef = zdata.get('emissionFactors', {})
            direct_ef = ef.get('direct', {})
            if power_mix:
                latest_mix = power_mix[-1] if isinstance(power_mix, list) else power_mix
                if isinstance(latest_mix, dict):
                    mix_ratios = latest_mix.get('value', latest_mix)
                    if isinstance(mix_ratios, dict):
                        zone_ci = 0.0
                        for fuel, ratio in mix_ratios.items():
                            if fuel in ('_source', 'datetime', '_comment'):
                                continue
                            if isinstance(ratio, (int, float)) and ratio > 0:
                                ef_val = fuel_ef_defaults.get(fuel, 475)
                                if fuel in direct_ef:
                                    ef_entry = direct_ef[fuel]
                                    if isinstance(ef_entry, list):
                                        ef_val = ef_entry[-1].get('value', ef_val)
                                    elif isinstance(ef_entry, dict):
                                        ef_val = ef_entry.get('value', ef_val)
                                zone_ci += ratio * ef_val
                        if zone_ci > 0:
                            zone_ci_data[zone_key] = {
                                'center': (cp.get('lat', 0), cp.get('lon', 0)),
                                'ci': zone_ci,
                            }
        except Exception:
            pass

    if zone_ci_data:
        EMAPS_ZONE_KEYS = list(zone_ci_data.keys())
        coords = np.array([[v['center'][0], v['center'][1]] for v in zone_ci_data.values()])
        EMAPS_ZONE_TREE = BallTree(np.radians(coords), metric='haversine')
        EMAPS_ZONE_CI = np.array([zone_ci_data[k]['ci'] for k in EMAPS_ZONE_KEYS])
        print(f"  ✅ {len(zone_ci_data)} zones with CI estimates "
              f"(range: {EMAPS_ZONE_CI.min():.0f}-{EMAPS_ZONE_CI.max():.0f} gCO₂/kWh)")
    else:
        print("  ⚠️ No zone CI data loaded")

    # Parse zone capacity data (installed MW per fuel type)
    CLEAN_FUELS = {'solar', 'wind', 'hydro', 'nuclear', 'geothermal', 'hydro storage'}
    FOSSIL_FUELS = {'coal', 'gas', 'oil'}
    zone_cap = {}  # zone_key -> {clean_frac, fossil_frac, coal_mw}
    for zpath in zone_files:
        try:
            with open(zpath) as zf:
                zdata = yaml.safe_load(zf)
            if not zdata:
                continue
            zk = os.path.basename(zpath).replace('.yaml', '')
            cap = zdata.get('capacity', {})
            if not cap:
                continue
            fuel_mw = {}
            for fuel, entries in cap.items():
                if isinstance(entries, list) and len(entries) > 0:
                    last = entries[-1]
                    fuel_mw[fuel] = (last.get('value', 0) or 0) if isinstance(last, dict) else (float(last) if last else 0)
                elif isinstance(entries, (int, float)):
                    fuel_mw[fuel] = entries
            total_mw = sum(fuel_mw.values())
            if total_mw > 0:
                zone_cap[zk] = {
                    'clean_frac': sum(fuel_mw.get(f, 0) for f in CLEAN_FUELS) / total_mw,
                    'fossil_frac': sum(fuel_mw.get(f, 0) for f in FOSSIL_FUELS) / total_mw,
                    'coal_mw': fuel_mw.get('coal', 0),
                }
        except Exception:
            pass
    EMAPS_ZONE_CLEAN_FRAC = np.full(len(EMAPS_ZONE_KEYS), np.nan)
    EMAPS_ZONE_FOSSIL_FRAC = np.full(len(EMAPS_ZONE_KEYS), np.nan)
    EMAPS_ZONE_COAL_MW = np.full(len(EMAPS_ZONE_KEYS), 0.0)
    for i, zk in enumerate(EMAPS_ZONE_KEYS):
        if zk in zone_cap:
            EMAPS_ZONE_CLEAN_FRAC[i] = zone_cap[zk]['clean_frac']
            EMAPS_ZONE_FOSSIL_FRAC[i] = zone_cap[zk]['fossil_frac']
            EMAPS_ZONE_COAL_MW[i] = zone_cap[zk]['coal_mw']
    n_cap = np.isfinite(EMAPS_ZONE_CLEAN_FRAC).sum()
    print(f"  ✅ {n_cap}/{len(EMAPS_ZONE_KEYS)} zones with installed capacity data")

    # Save to cache
    try:
        coords_arr = np.array([[zone_ci_data[k]['center'][0], zone_ci_data[k]['center'][1]]
                                for k in EMAPS_ZONE_KEYS])
        with open(cache_file, "wb") as f:
            _pkl.dump({
                "dir_mtime": dir_mtime,
                "keys": EMAPS_ZONE_KEYS,
                "coords": coords_arr,
                "ci": EMAPS_ZONE_CI,
                "clean_frac": EMAPS_ZONE_CLEAN_FRAC,
                "fossil_frac": EMAPS_ZONE_FOSSIL_FRAC,
                "coal_mw": EMAPS_ZONE_COAL_MW,
            }, f, protocol=_pkl.HIGHEST_PROTOCOL)
    except Exception:
        pass


# =====================================================================
#  ZONE BOUNDARY POLYGONS (point-in-polygon → grid connectivity)
# =====================================================================
def load_zone_polygons():
    """Load zone boundary polygons from world.geojson for point-in-polygon lookups.

    This maps every lat/lon to its actual electrical grid zone rather than
    relying on geographic proximity to zone centre-points.  A data-centre
    in Montreal is correctly placed in CA-QC (92 % hydro, CI ≈ 38) instead
    of being matched to a nearby fossil plant across the provincial border.
    """
    global ZONE_POLYGONS, ZONE_POLY_NAMES, ZONE_POLY_TREE, ZONE_POLY_CI
    from shapely.geometry import shape
    from shapely.strtree import STRtree
    from shapely import prepare as _prepare

    if not os.path.exists(WORLD_GEOJSON_PATH):
        print("[Zones] ⚠️  world.geojson not found — zone polygons disabled")
        return

    print("[Zones] Loading zone boundary polygons...")
    with open(WORLD_GEOJSON_PATH) as f:
        geo = json.load(f)

    names = []
    polys = []
    for feat in geo['features']:
        zn = feat['properties']['zoneName']
        poly = shape(feat['geometry'])
        _prepare(poly)          # pre-compute spatial index for fast contains()
        names.append(zn)
        polys.append(poly)

    ZONE_POLY_NAMES = names
    ZONE_POLYGONS = polys
    ZONE_POLY_TREE = STRtree(polys)

    # Build zone_name → CI lookup from already-loaded eMaps data
    ZONE_POLY_CI = {}
    if EMAPS_ZONE_CI is not None:
        for i, zk in enumerate(EMAPS_ZONE_KEYS):
            ZONE_POLY_CI[zk] = float(EMAPS_ZONE_CI[i])

    n_ci = sum(1 for zn in names if zn in ZONE_POLY_CI)
    print(f"  ✅ {len(polys)} zone polygons, {n_ci} with CI values")


def batch_zone_ci(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """Vectorised zone CI lookup for arrays of (lat, lon).

    Uses shapely STRtree + prepared polygon containment.
    Falls back to nearest-polygon lookup for coastline edge-cases where
    a point is just outside a simplified polygon boundary.

    Returns array of shape (N,) with zone CI values (NaN where no zone found).
    """
    N = len(lats)
    if ZONE_POLY_TREE is None or len(ZONE_POLY_CI) == 0:
        return np.full(N, np.nan)

    from shapely import points as make_points
    pts = make_points(lons, lats)

    # Vectorised query: returns (input_indices, tree_indices) pairs
    result = ZONE_POLY_TREE.query(pts, predicate='intersects')

    zone_ci_arr = np.full(N, np.nan)
    if result.shape[1] > 0:
        # Assign first matching zone to each point
        for inp_i, tree_i in zip(result[0], result[1]):
            if np.isnan(zone_ci_arr[inp_i]):     # first match wins
                zn = ZONE_POLY_NAMES[tree_i]
                ci = ZONE_POLY_CI.get(zn)
                if ci is not None:
                    zone_ci_arr[inp_i] = ci

    # Fallback: for unmatched points (coastline edge-cases), use nearest polygon
    # if it's within ~50 km (≈ 0.5° at mid-latitudes)
    unmatched = np.where(np.isnan(zone_ci_arr))[0]
    if len(unmatched) > 0:
        nearest_idx = ZONE_POLY_TREE.nearest(pts[unmatched])
        for i, ui in enumerate(unmatched):
            ni = nearest_idx[i]
            dist_deg = ZONE_POLYGONS[ni].distance(pts[ui])
            if dist_deg < 0.5:          # ≈ 50 km
                zn = ZONE_POLY_NAMES[ni]
                ci = ZONE_POLY_CI.get(zn)
                if ci is not None:
                    zone_ci_arr[ui] = ci

    return zone_ci_arr


# =====================================================================
#  LAYER 3: UK API
# =====================================================================
def query_uk_carbon_intensity():
    try:
        req = urllib.request.Request(f"{UK_CI_API}/intensity",
                                     headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            if "data" in data and len(data["data"]) > 0:
                entry = data["data"][0]
                return {
                    "forecast": entry.get("intensity", {}).get("forecast"),
                    "actual": entry.get("intensity", {}).get("actual"),
                    "index": entry.get("intensity", {}).get("index"),
                }
    except Exception:
        pass
    return None


# =====================================================================
#  GREEN SCORE ALGORITHM
# =====================================================================
def classify_fuel(source_type: str) -> str:
    """Map Climate TRACE source_type to CodeCarbon fuel category."""
    s = str(source_type).lower()
    if any(k in s for k in ['coal']):
        return 'coal'
    if any(k in s for k in ['gas', 'ccgt', 'ocgt']):
        return 'natural_gas'
    if any(k in s for k in ['oil', 'petrol', 'diesel', 'petroleum']):
        return 'petroleum'
    if any(k in s for k in ['solar', 'pv']):
        return 'solar'
    if any(k in s for k in ['wind']):
        return 'wind'
    if any(k in s for k in ['hydro', 'water']):
        return 'hydroelectricity'
    if any(k in s for k in ['nuclear']):
        return 'nuclear'
    if any(k in s for k in ['geotherm']):
        return 'geothermal'
    if any(k in s for k in ['biomass', 'bio']):
        return 'fossil'  # biomass ≈ low fossil
    return 'fossil'  # unknown → conservative


def compute_green_score(
    lat: float,
    lon: float,
    radius_km: float = 300.0,
    disable_live_api: bool = False,
    disable_reverse_geocoder: bool = False,
) -> dict:
    """
    Data-driven regression engine (Phase 5).
    Replaces IDW and arbitrary fossil penalties with a trained Ridge model.
    """
    target_rad = [[math.radians(lat), math.radians(lon)]]
    radius_rad = radius_km / 6371.0
    world_avg = FUEL_WEIGHTS.get("world_average", 475)

    # ── 1. Country & State CI Lookup ──
    country_iso3 = "Unknown"
    state_name = ""
    country_name = "Unknown"
    
    if POWER_TREE is not None:
        dist_p, ind_p = POWER_TREE.query(target_rad, k=1)
        if len(ind_p[0]) > 0:
            nearest_iso = POWER_PLANTS_DF.iloc[ind_p[0][0]]['iso3_country']
            if nearest_iso in CODECARBON_MIX:
                country_iso3 = nearest_iso
                country_name = CODECARBON_MIX[country_iso3].get("country_name", nearest_iso)

    if not disable_reverse_geocoder:
        try:
            import reverse_geocoder as rg
            res = rg.search((lat, lon), verbose=False)
            if res:
                loc = res[0]
                if country_iso3 == "Unknown" and "cc" in loc:
                    cc = loc["cc"]
                    iso_map = {"US": "USA", "CA": "CAN", "GB": "GBR", "IE": "IRL", "FR": "FRA", "DE": "DEU"}
                    if cc in iso_map:
                        country_iso3 = iso_map[cc]
                state_name = loc.get("admin1", "").lower()
        except Exception:
            pass

    # Fix state aliases: "northern virginia" → "virginia" etc.
    US_STATE_ALIASES = {"northern virginia": "virginia"}
    if state_name in US_STATE_ALIASES:
        state_name = US_STATE_ALIASES[state_name]

    base_ci = np.nan
    # ── Zone polygon CI (grid connectivity) ──
    # Prefer sub-national zone CI over coarse country average
    if ZONE_POLY_TREE is not None:
        from shapely.geometry import Point as _Point
        _pt = _Point(lon, lat)
        _candidates = ZONE_POLY_TREE.query(_pt)
        for _ci_idx in _candidates:
            if ZONE_POLYGONS[_ci_idx].contains(_pt):
                _zn = ZONE_POLY_NAMES[_ci_idx]
                _zci = ZONE_POLY_CI.get(_zn)
                if _zci is not None:
                    base_ci = _zci
                break
        # Fallback: nearest polygon within ~50 km for coastline edge-cases
        if np.isnan(base_ci):
            _ni = ZONE_POLY_TREE.nearest(_pt)
            if ZONE_POLYGONS[_ni].distance(_pt) < 0.5:
                _zn = ZONE_POLY_NAMES[_ni]
                _zci = ZONE_POLY_CI.get(_zn)
                if _zci is not None:
                    base_ci = _zci
    if np.isnan(base_ci):
        if country_iso3 == "USA" and state_name in USA_EMISSIONS:
            base_ci = USA_EMISSIONS[state_name]["emissions"] * 0.453592
        elif country_iso3 == "CAN" and state_name in CAN_EMISSIONS:
            mix = CAN_EMISSIONS[state_name]
            base_ci = (
                (mix.get("coal", 0) / 100.0) * FUEL_WEIGHTS.get("coal", 995) +
                (mix.get("naturalGas", 0) / 100.0) * FUEL_WEIGHTS.get("natural_gas", 743) +
                (mix.get("petroleum", 0) / 100.0) * FUEL_WEIGHTS.get("petroleum", 816) +
                (mix.get("biomass", 0) / 100.0) * FUEL_WEIGHTS.get("biomass", 230) +
                (mix.get("solar", 0) / 100.0) * FUEL_WEIGHTS.get("solar", 48) +
                (mix.get("wind", 0) / 100.0) * FUEL_WEIGHTS.get("wind", 26) +
                (mix.get("hydro", 0) / 100.0) * FUEL_WEIGHTS.get("hydroelectricity", 26) +
                (mix.get("nuclear", 0) / 100.0) * FUEL_WEIGHTS.get("nuclear", 29)
            )
        elif country_iso3 in CODECARBON_MIX:
            base_ci = CODECARBON_MIX[country_iso3].get("carbon_intensity", np.nan)
            if "country_name" in CODECARBON_MIX[country_iso3]:
                country_name = CODECARBON_MIX[country_iso3]["country_name"]

    # Separate state/province CI feature (independent of zone polygon)
    state_ci_val = np.nan
    if country_iso3 == "USA" and state_name in USA_EMISSIONS:
        state_ci_val = USA_EMISSIONS[state_name]["emissions"] * 0.453592
    elif country_iso3 == "CAN" and state_name in CAN_EMISSIONS:
        _cmix = CAN_EMISSIONS[state_name]
        state_ci_val = (
            (_cmix.get("coal", 0) / 100.0) * FUEL_WEIGHTS.get("coal", 995) +
            (_cmix.get("naturalGas", 0) / 100.0) * FUEL_WEIGHTS.get("natural_gas", 743) +
            (_cmix.get("petroleum", 0) / 100.0) * FUEL_WEIGHTS.get("petroleum", 816) +
            (_cmix.get("biomass", 0) / 100.0) * FUEL_WEIGHTS.get("biomass", 230) +
            (_cmix.get("solar", 0) / 100.0) * FUEL_WEIGHTS.get("solar", 48) +
            (_cmix.get("wind", 0) / 100.0) * FUEL_WEIGHTS.get("wind", 26) +
            (_cmix.get("hydro", 0) / 100.0) * FUEL_WEIGHTS.get("hydroelectricity", 26) +
            (_cmix.get("nuclear", 0) / 100.0) * FUEL_WEIGHTS.get("nuclear", 29)
        )
    if np.isnan(state_ci_val):
        state_ci_val = base_ci  # fall back to base_ci for non-US/CAN

    if math.isnan(base_ci):
        base_ci = world_avg

    # Country-level energy mix fractions (from global_energy_mix.json 2023)
    country_fossil_frac = 0.5  # safe default
    country_clean_frac = 0.5
    country_coal_frac = 0.0
    country_gas_frac = 0.0
    country_nuclear_frac = 0.0
    country_renew_frac = 0.0
    if country_iso3 in CODECARBON_MIX:
        emix = CODECARBON_MIX[country_iso3]
        total_twh = emix.get("total_TWh", 0) or 1e-9
        fossil_twh = emix.get("fossil_TWh", 0) or 0
        coal_twh = emix.get("coal_TWh", 0) or 0
        gas_twh = emix.get("gas_TWh", 0) or 0
        nuclear_twh = emix.get("nuclear_TWh", 0) or 0
        renewables_twh = emix.get("renewables_TWh", 0) or 0
        country_fossil_frac = fossil_twh / total_twh
        country_clean_frac = (renewables_twh + nuclear_twh) / total_twh
        country_coal_frac = coal_twh / total_twh
        country_gas_frac = gas_twh / total_twh
        country_nuclear_frac = nuclear_twh / total_twh
        country_renew_frac = renewables_twh / total_twh

    local_fuel_mix = {}
    renewable_capacity_mw = 0.0
    fossil_capacity_mw = 0.0
    plants_in_radius = 0
    emissions_per_capacity = 0.0
    local_pct_coal = 0.0
    local_pct_fossil = 0.0
    local_pct_clean = 0.0
    mean_emissions_per_plant = 0.0
    fuel_counts = pd.Series(dtype=int)
    idw_weighted_ci = 0.0
    local_ef_weighted = 0.0
    local_generation_gwh = 0.0
    local_mean_cf = 0.0

    # ── Single BallTree query for all plant-related features ──
    if POWER_TREE is not None:
        ind = POWER_TREE.query_radius(target_rad, r=radius_rad)
        if len(ind[0]) > 0:
            local_plants = POWER_PLANTS_DF.iloc[ind[0]]
            plants_in_radius = len(local_plants)
            
            t_cap = local_plants['capacity'].fillna(0).sum()
            t_emi = local_plants['emissions_quantity'].sum()
            if t_cap > 0:
                emissions_per_capacity = t_emi / t_cap
            mean_emissions_per_plant = float(local_plants['emissions_quantity'].mean())

            fuel_cats = local_plants['source_type'].apply(classify_fuel)
            fuel_counts = fuel_cats.value_counts()
            local_pct_coal = fuel_counts.get('coal', 0) / plants_in_radius

            fossil_cats = {'coal', 'natural_gas', 'petroleum', 'fossil'}
            local_pct_fossil = sum(fuel_counts.get(c, 0) for c in fossil_cats) / plants_in_radius
            local_pct_clean = max(0.0, 1.0 - local_pct_fossil)

            # Capacity by fuel type + IDW-weighted CI (vectorised)
            caps = local_plants['capacity'].fillna(0).values
            lats_r = np.radians(local_plants['lat'].values)
            lons_r = np.radians(local_plants['lon'].values)
            d_rad = np.sqrt((lats_r - target_rad[0][0])**2 + (lons_r - target_rad[0][1])**2)
            dk_km = np.maximum(d_rad * 6371.0, 1.0)
            w_idw = 1.0 / (dk_km ** 2)

            renew_set = {'solar', 'wind', 'hydroelectricity', 'nuclear', 'geothermal'}
            fuel_ci = np.array([FUEL_WEIGHTS.get(fc, world_avg) for fc in fuel_cats])
            is_renew = np.array([fc in renew_set for fc in fuel_cats])

            renewable_capacity_mw = float(caps[is_renew].sum())
            fossil_capacity_mw = float(caps[~is_renew].sum())
            idw_weighted_ci = float(np.sum(w_idw * fuel_ci) / np.sum(w_idw))

            for fc, cap in zip(fuel_cats, caps):
                local_fuel_mix[fc] = local_fuel_mix.get(fc, 0) + cap

            # Generation-weighted emission factor & capacity factor
            valid_mask = local_plants['emissions_factor'].notna().values & local_plants['activity'].notna().values
            act = local_plants['activity'].values
            valid_mask = valid_mask & (act > 0)
            if valid_mask.any():
                ef_vals = local_plants['emissions_factor'].values[valid_mask]
                act_vals = act[valid_mask]
                total_gen = act_vals.sum()
                local_ef_weighted = float(np.sum(ef_vals * act_vals) / total_gen) * 1000.0
                local_generation_gwh = total_gen / 1000.0
            cf_vals = local_plants['other5'].values
            cf_valid = cf_vals[np.isfinite(cf_vals.astype(float)) & (cf_vals > 0)] if len(cf_vals) > 0 else np.array([])
            if len(cf_valid) > 0:
                local_mean_cf = float(np.mean(cf_valid))

    # Electricity Maps nearest zone CI
    # Prefer polygon-based zone CI (fixes KD-tree center mismatches)
    emaps_zone_ci_val = 0.0
    emaps_idw_ci_val = 0.0
    emaps_zone_clean_cap_frac = 0.0
    emaps_zone_fossil_cap_frac = 0.0
    emaps_zone_coal_cap_mw = 0.0

    # First try polygon lookup for accurate zone CI
    _poly_zone_ci = None
    if ZONE_POLY_TREE is not None and ZONE_POLY_CI:
        from shapely.geometry import Point as _PtZ
        _ptz = _PtZ(lon, lat)
        _cands_z = ZONE_POLY_TREE.query(_ptz)
        for _cidx_z in _cands_z:
            if ZONE_POLYGONS[_cidx_z].contains(_ptz):
                _zn_z = ZONE_POLY_NAMES[_cidx_z]
                _zci_z = ZONE_POLY_CI.get(_zn_z)
                if _zci_z is not None:
                    _poly_zone_ci = _zci_z
                break
        if _poly_zone_ci is None:
            _ni_z = ZONE_POLY_TREE.nearest(_ptz)
            if ZONE_POLYGONS[_ni_z].distance(_ptz) < 0.5:
                _zn_z = ZONE_POLY_NAMES[_ni_z]
                _zci_z = ZONE_POLY_CI.get(_zn_z)
                if _zci_z is not None:
                    _poly_zone_ci = _zci_z

    if EMAPS_ZONE_TREE is not None:
        dist_z, ind_z = EMAPS_ZONE_TREE.query(target_rad, k=1)
        dist_z_km = dist_z[0][0] * 6371
        nearest_idx = ind_z[0][0]
        if _poly_zone_ci is not None:
            emaps_zone_ci_val = _poly_zone_ci
        elif dist_z_km < 500:
            emaps_zone_ci_val = float(EMAPS_ZONE_CI[nearest_idx])
        # Capacity fracs from KD-tree nearest (still useful even when CI is polygon-based)
        if dist_z_km < 500 and np.isfinite(EMAPS_ZONE_CLEAN_FRAC[nearest_idx]):
            emaps_zone_clean_cap_frac = float(EMAPS_ZONE_CLEAN_FRAC[nearest_idx])
            emaps_zone_fossil_cap_frac = float(EMAPS_ZONE_FOSSIL_FRAC[nearest_idx])
            emaps_zone_coal_cap_mw = float(EMAPS_ZONE_COAL_MW[nearest_idx])
        # IDW of top-3 nearest zones
        k_zones = min(3, len(EMAPS_ZONE_KEYS))
        dist_zk, ind_zk = EMAPS_ZONE_TREE.query(target_rad, k=k_zones)
        w_total = 0.0
        w_ci = 0.0
        for di, ii in zip(dist_zk[0], ind_zk[0]):
            dk = max(di * 6371, 1.0)
            if dk > 1000:
                continue
            w = 1.0 / dk ** 2
            w_total += w
            w_ci += w * EMAPS_ZONE_CI[ii]
        if w_total > 0:
            emaps_idw_ci_val = w_ci / w_total

    # ── Local LINEAR emission trend (capacity-weighted) ──
    # Computed before feats_dict so temporal features are available for Ridge
    local_trend_b = 0.0
    if POWER_TREE is not None:
        ind_t = POWER_TREE.query_radius(target_rad, r=radius_rad)
        if len(ind_t[0]) > 0:
            lp_t = POWER_PLANTS_DF.iloc[ind_t[0]]
            caps_t = lp_t['capacity'].fillna(1.0).values
            w = caps_t / max(caps_t.sum(), 1.0)
            local_trend_b = float((lp_t['trend_b'].values * w).sum())
    # Fallback to country-level linear if no local plants
    _trend_tmp = COUNTRY_TRENDS.get(country_iso3, {})
    if local_trend_b == 0.0 and _trend_tmp:
        pct = _trend_tmp.get('pct_change_per_year', 0.0)
        local_trend_b = (pct / 100.0) if pct else 0.0

    predicted_ci = base_ci
    if REGRESSION_MODEL:
        feats_dict = {
            "country_ci": base_ci,
            "emissions_per_capacity": emissions_per_capacity,
            "local_pct_coal": local_pct_coal,
            "local_pct_clean": local_pct_clean,
            "mean_emissions_per_plant": mean_emissions_per_plant,
            "abs_lat": abs(lat),
            "idw_weighted_ci": idw_weighted_ci,
            "country_ci_sq": base_ci ** 2 / 1000.0,
            "emaps_zone_ci": emaps_zone_ci_val,
            "emaps_idw_ci": emaps_idw_ci_val,
            # Engineered features
            "sqrt_zone_ci": emaps_zone_ci_val ** 0.5 if emaps_zone_ci_val >= 0 else 0.0,
            "zone_x_country": emaps_zone_ci_val * base_ci / 1000.0,
            # Fraction-based features
            "country_fossil_frac": country_fossil_frac,
            "country_clean_frac": country_clean_frac,
            "country_coal_frac": country_coal_frac,
            "country_gas_frac": country_gas_frac,
            "country_nuclear_frac": country_nuclear_frac,
            "country_renew_frac": country_renew_frac,
            # Normalized CI: thermal EF × fossil fraction ≈ grid-average
            "ct_grid_ci_est": emissions_per_capacity * country_fossil_frac,
            # Regional plant-level features
            "local_ef_weighted": local_ef_weighted,
            "local_generation_gwh": local_generation_gwh,
            "local_mean_cf": local_mean_cf,
            # Zone-level installed capacity fractions
            "emaps_zone_clean_cap_frac": emaps_zone_clean_cap_frac,
            "emaps_zone_fossil_cap_frac": emaps_zone_fossil_cap_frac,
            "emaps_zone_coal_cap_mw": emaps_zone_coal_cap_mw,
            "state_ci": state_ci_val,
            # Provider dummy (0.0 at inference = predict actual grid CI)
            "is_gcp": 0.0,
            # Temporal features
            "country_trend_pct": COUNTRY_TRENDS.get(country_iso3, {}).get('pct_change_per_year', 0.0),
            "local_trend_x_ci": local_trend_b * base_ci,
        }
        x = [feats_dict.get(f, 0.0) for f in REGRESSION_MODEL["features"]]
        x_scaled = (np.array(x) - np.array(REGRESSION_MODEL["scaler_mean"])) / np.array(REGRESSION_MODEL["scaler_scale"])
        predicted_ci = float(np.dot(np.array(REGRESSION_MODEL["coefficients"]), x_scaled) + REGRESSION_MODEL["intercept"])
    
    # Hybrid: for clean grids, use zone CI directly (bypasses Ridge noise)
    if base_ci < 100 and ZONE_POLY_TREE is not None:
        predicted_ci = base_ci

    final_ci = max(0.0, predicted_ci)

    live_override_applied = False
    live_details = None
    if country_iso3 == "GBR" and not disable_live_api:
        uk_data = query_uk_carbon_intensity()
        if uk_data and uk_data.get("forecast") is not None:
            final_ci = float(uk_data["forecast"])
            live_override_applied = True
            live_details = uk_data
            
    green_score = max(0.0, min(100.0, 100.0 - (final_ci / 9.0)))
    grade = "A" if green_score >= 85 else "B" if green_score >= 70 else "C" if green_score >= 55 else "D" if green_score >= 40 else "E" if green_score >= 25 else "F"

    fossil_ops_in_radius = 0
    if FOSSIL_TREE is not None:
        ind_fossil = FOSSIL_TREE.query_radius(target_rad, r=radius_rad)
        fossil_ops_in_radius = len(ind_fossil[0])

    nearest_dc_km = None
    nearest_dc_id = None
    if DC_TREE is not None:
        dist_dc, ind_dc = DC_TREE.query(target_rad, k=1)
        if len(ind_dc[0]) > 0:
            nearest_dc_km = round(dist_dc[0][0] * 6371.0, 1)
            nearest_dc_id = DATA_CENTERS[ind_dc[0][0]]['id']

    trend = COUNTRY_TRENDS.get(country_iso3, {})
    base_mix_ratio = renewable_capacity_mw / max(1, renewable_capacity_mw + fossil_capacity_mw)

    # local_trend_b already computed above (before feats_dict)
    trend['emission_pct_change_per_year'] = round(local_trend_b * 100, 4)
    trend['local_trend_b'] = round(local_trend_b, 6)
    trend['trend_type'] = 'linear'

    return {
        "green_score": round(green_score, 1),
        "grade": grade,
        "country": country_name,
        "country_iso3": country_iso3,
        "state_context": state_name.title() if state_name else None,
        "breakdown": {
            "ml_predicted_ci": round(predicted_ci, 2),
            "base_location_ci": round(base_ci, 2),
            "country_carbon_intensity_gCO2_kWh": round(final_ci, 3),
            "live_override": live_details if live_override_applied else None,
            "trace_features": {
                "emissions_per_capacity": round(emissions_per_capacity, 1),
                "local_pct_coal": round(local_pct_coal * 100, 1)
            }
        },
        "projection": trend.to_dict() if hasattr(trend, 'to_dict') else trend,
        "local_context": {
            "power_plants_in_radius": plants_in_radius,
            "fossil_operations_in_radius": fossil_ops_in_radius,
            "renewable_capacity_mw": round(renewable_capacity_mw, 1),
            "fossil_capacity_mw": round(fossil_capacity_mw, 1),
            "renewable_ratio": round(base_mix_ratio, 2),
            "nearest_dc_km": nearest_dc_km,
            "nearest_dc_id": nearest_dc_id,
            "local_fuel_mix_mw": {k: round(v, 2) for k, v in local_fuel_mix.items()}
        },
        "search_radius_km": radius_km,
    }



# =====================================================================
#  CARBON FOOTPRINT PREDICTION
# =====================================================================
# Published PUE values by provider (source: sustainability reports)
PROVIDER_PUE = {
    "gcp": 1.10,
    "azure": 1.18,
    "aws": 1.20,
    "meta": 1.10,
    "ovh": 1.30,
    "hlrs": 1.40,
    "itenos": 1.40,
}

# Equivalence factors
EQUIV_CAR_TONNES_PER_YEAR = 4.6        # avg car emits 4.6 tonnes CO2/yr (EPA)
EQUIV_FLIGHT_KG_PER_PARIS_NYC = 900    # ~900 kg CO2 per passenger one-way
EQUIV_TREE_KG_PER_YEAR = 22            # one tree absorbs ~22 kg CO2/yr
EQUIV_HOME_TONNES_PER_YEAR = 7.5       # avg EU home ~7.5 tonnes CO2/yr


def estimate_pue(lat: float, provider: str = None) -> float:
    """
    Estimate PUE (Power Usage Effectiveness) for a data center.
    Uses known provider PUE if available, otherwise estimates from latitude.
    """
    if provider and provider.lower() in PROVIDER_PUE:
        return PROVIDER_PUE[provider.lower()]

    # Estimate from latitude (colder regions = more free-air cooling = lower PUE)
    base_pue = 1.58  # global average (Uptime Institute 2023)
    # Latitude bonus: every 10° from equator saves ~0.03 PUE
    latitude_bonus = min(0.20, abs(lat) * 0.003)
    estimated_pue = base_pue - latitude_bonus
    return round(max(1.05, min(1.80, estimated_pue)), 2)


def predict_footprint(
    lat: float,
    lon: float,
    it_load_mw: float,
    provider: str = None,
    radius_km: float = 300.0,
    disable_live_api: bool = False,
    disable_reverse_geocoder: bool = False,
) -> dict:
    """
    Predict annual carbon footprint for a data center at a given location.

    Annual CO2 (tonnes) = IT_Load_MW × PUE × CI_gCO2/kWh × 8760 hrs × 0.001 (g→kg) × 0.001 (kg→t)
    Simplified: Annual CO2 (tonnes) = IT_Load_MW × PUE × CI × 8.76
    """
    # Get the Green Score analysis (includes CI, country, trends, etc.)
    site = compute_green_score(
        lat,
        lon,
        radius_km,
        disable_live_api,
        disable_reverse_geocoder=disable_reverse_geocoder,
    )

    # Carbon intensity from our multi-layer engine
    ci = site["breakdown"]["country_carbon_intensity_gCO2_kWh"]

    # PUE estimation
    pue = estimate_pue(lat, provider)

    # Core formula: MW × PUE × gCO2/kWh × 8760h × (1t/1,000,000g)
    # = MW × 1000 kW × PUE × gCO2/kWh × 8760h × 1t/1,000,000g
    # = MW × PUE × CI × 8.76
    annual_tonnes = it_load_mw * pue * ci * 8.76

    # Equivalences
    equiv = {
        "cars_equivalent": round(annual_tonnes / EQUIV_CAR_TONNES_PER_YEAR),
        "flights_paris_nyc": round(annual_tonnes * 1000 / EQUIV_FLIGHT_KG_PER_PARIS_NYC),
        "trees_to_offset": round(annual_tonnes * 1000 / EQUIV_TREE_KG_PER_YEAR),
        "eu_homes_equivalent": round(annual_tonnes / EQUIV_HOME_TONNES_PER_YEAR),
    }

    # Project forward using emission trends (linear)
    proj = site.get("projection", {})
    projected = {}
    trend_b = proj.get("local_trend_b", 0.0) or 0.0
    if trend_b != 0.0:
        for target_year in [2027, 2030]:
            t = target_year - 2024  # trends fitted with t=0 at 2024 (last complete year)
            scale = 1.0 + trend_b * t
            future_ci = ci * max(0, scale)
            future_tonnes = it_load_mw * pue * future_ci * 8.76
            projected[f"tonnes_{target_year}"] = round(future_tonnes)
            projected[f"ci_{target_year}"] = round(future_ci, 1)
        projected["trend"] = proj.get("trend", "")
        projected["pct_change_per_year"] = proj.get("emission_pct_change_per_year", 0.0)
        projected["trend_type"] = "linear"
        projected["local_trend_b"] = trend_b

    # Green Score from footprint per MW (normalized)
    fp_per_mw = annual_tonnes / max(0.001, it_load_mw)
    # Best possible: ~270 t/MW/yr (Iceland: CI=28, PUE=1.1)
    # Worst realistic: ~12,600 t/MW/yr (South Africa: CI=900, PUE=1.6)
    best = 270
    worst = 12600
    green_score = max(0, min(100, round(100 * (1 - (fp_per_mw - best) / (worst - best)), 1)))
    grade = ("A" if green_score >= 85 else "B" if green_score >= 70 else
             "C" if green_score >= 55 else "D" if green_score >= 40 else
             "E" if green_score >= 25 else "F")

    return {
        "location": {"lat": lat, "lon": lon},
        "country": site.get("country", "Unknown"),
        "country_iso3": site.get("country_iso3"),
        "it_load_mw": it_load_mw,
        "estimated_pue": pue,
        "provider": provider,
        "carbon_intensity_gCO2_kWh": ci,
        "annual_footprint": {
            "tonnes_co2_per_year": round(annual_tonnes),
            "kg_co2_per_year": round(annual_tonnes * 1000),
            "per_mw_tonnes": round(fp_per_mw),
        },
        "equivalences": equiv,
        "projection": projected,
        "green_score": green_score,
        "grade": grade,
        "site_analysis": site,
    }


# =====================================================================
#  VECTORIZED BATCH PREDICTION  (for grid heatmaps)
# =====================================================================
# Pre-compute fuel-type classification lookup table
_FUEL_CACHE: dict[str, str] = {}

def _classify_fuel_cached(source_type: str) -> str:
    """Classify fuel type with memoisation."""
    v = _FUEL_CACHE.get(source_type)
    if v is not None:
        return v
    v = classify_fuel(source_type)
    _FUEL_CACHE[source_type] = v
    return v


def predict_grid_batch(
    lats: np.ndarray,
    lons: np.ndarray,
    it_load_mw: float = 50.0,
    radius_km: float = 300.0,
    target_year: int | None = None,
) -> dict:
    """
    Vectorised prediction for an entire grid of (lat, lon) points.

    If target_year is given, per-plant emissions are projected to that year
    BEFORE computing features. This means declining plants lose spatial
    influence and boundaries between high/low CI regions shift over time.

    Returns dict with arrays:
      ci    – predicted carbon intensity  (gCO₂/kWh)
      fp    – annual footprint            (tCO₂/yr)
      tb    – linear trend coefficient b  (fractional change per year)

    All arrays are shape (N,) for N input points.
    """
    import time as _time
    t0 = _time.perf_counter()
    N = len(lats)
    world_avg = FUEL_WEIGHTS.get("world_average", 475)
    radius_rad = radius_km / 6371.0

    # ── Pre-compute BallTree queries for ALL points at once ──
    coords_rad = np.column_stack([np.radians(lats), np.radians(lons)])

    # Power plants within radius  (one batch call)
    pp_indices = POWER_TREE.query_radius(coords_rad, r=radius_rad) if POWER_TREE is not None else [np.array([], dtype=int)] * N

    # Nearest power plant for country lookup
    if POWER_TREE is not None:
        pp_dist1, pp_ind1 = POWER_TREE.query(coords_rad, k=1)
    else:
        pp_dist1 = np.full((N, 1), np.inf)
        pp_ind1 = np.zeros((N, 1), dtype=int)

    # Electricity Maps queries (nearest + k=3 IDW)
    if EMAPS_ZONE_TREE is not None:
        ez_dist1, ez_ind1 = EMAPS_ZONE_TREE.query(coords_rad, k=1)
        k_zones = min(3, len(EMAPS_ZONE_KEYS))
        ez_distk, ez_indk = EMAPS_ZONE_TREE.query(coords_rad, k=k_zones)
    else:
        ez_dist1 = np.full((N, 1), np.inf)
        ez_ind1 = np.zeros((N, 1), dtype=int)
        ez_distk = ez_dist1
        ez_indk = ez_ind1

    # Fossil operations within radius
    if FOSSIL_TREE is not None:
        fo_indices = FOSSIL_TREE.query_radius(coords_rad, r=radius_rad)
    else:
        fo_indices = [np.array([], dtype=int)] * N

    # Renewable plants within radius (WRI GPPD)
    if RENEW_TREE is not None:
        rn_indices = RENEW_TREE.query_radius(coords_rad, r=radius_rad)
        rn_caps = RENEW_PLANTS_DF['capacity_mw'].values
        rn_lat_r = np.radians(RENEW_PLANTS_DF['latitude'].values)
        rn_lon_r = np.radians(RENEW_PLANTS_DF['longitude'].values)
        rn_fuel_ci = np.array([FUEL_WEIGHTS.get(fc, 0) for fc in RENEW_PLANTS_DF['fuel_cat'].values])
    else:
        rn_indices = [np.array([], dtype=int)] * N

    # Nearest data center
    if DC_TREE is not None:
        dc_dist1, dc_ind1 = DC_TREE.query(coords_rad, k=1)
    else:
        dc_dist1 = np.full((N, 1), np.inf)
        dc_ind1 = np.zeros((N, 1), dtype=int)

    # Zone polygon CI lookup (vectorised point-in-polygon)
    zone_ci_arr = batch_zone_ci(lats, lons)

    t_bt = _time.perf_counter()

    # ── Pre-classify all plant fuel types once ──
    if POWER_PLANTS_DF is not None:
        all_fuel_cats = POWER_PLANTS_DF['source_type'].map(_classify_fuel_cached).values
        all_caps = POWER_PLANTS_DF['capacity'].fillna(0).values
        all_emi = POWER_PLANTS_DF['emissions_quantity'].values
        all_ef = POWER_PLANTS_DF['emissions_factor'].values
        all_act = POWER_PLANTS_DF['activity'].values
        all_cf = POWER_PLANTS_DF['other5'].values
        all_lat_r = np.radians(POWER_PLANTS_DF['lat'].values)
        all_lon_r = np.radians(POWER_PLANTS_DF['lon'].values)
        all_trend_b = POWER_PLANTS_DF['trend_b'].values
        all_iso3 = POWER_PLANTS_DF['iso3_country'].values

        renew_set = {'solar', 'wind', 'hydroelectricity', 'nuclear', 'geothermal'}
        all_fuel_ci = np.array([FUEL_WEIGHTS.get(fc, world_avg) for fc in all_fuel_cats])
        all_is_renew = np.array([fc in renew_set for fc in all_fuel_cats])
        fossil_set = {'coal', 'natural_gas', 'petroleum', 'fossil'}
        all_is_fossil = np.array([fc in fossil_set for fc in all_fuel_cats])
        all_is_coal = np.array([fc == 'coal' for fc in all_fuel_cats])

        # ── Time projection: scale per-plant emissions to target year ──
        if target_year is not None:
            t_proj = target_year - 2024  # baseline year
            proj_scale = np.maximum(0.0, 1.0 + all_trend_b * t_proj)
            all_emi = all_emi * proj_scale        # projected emissions
            all_act = all_act * proj_scale        # projected generation
            # Plants whose emissions hit 0 are effectively retired
            all_is_retired = proj_scale <= 0.0
    else:
        all_fuel_cats = np.array([])

    # ── Regression model params ──
    feat_names = REGRESSION_MODEL.get("features", [])
    scaler_mean = np.array(REGRESSION_MODEL.get("scaler_mean", []))
    scaler_scale = np.array(REGRESSION_MODEL.get("scaler_scale", []))
    coefs = np.array(REGRESSION_MODEL.get("coefficients", []))
    intercept = REGRESSION_MODEL.get("intercept", 0.0)
    n_feats = len(feat_names)

    # ── Allocate output arrays ──
    ci_out = np.full(N, np.nan)
    fp_out = np.full(N, np.nan)
    tb_out = np.zeros(N)

    # ── Build feature matrix for all points (main loop) ──
    X = np.zeros((N, n_feats))

    for idx in range(N):
        lat_i = lats[idx]
        lon_i = lons[idx]
        lat_r = coords_rad[idx, 0]
        lon_r = coords_rad[idx, 1]

        # ── Country lookup (from nearest plant) ──
        country_iso3 = "Unknown"
        if POWER_TREE is not None:
            nearest_iso = all_iso3[pp_ind1[idx, 0]]
            if nearest_iso in CODECARBON_MIX:
                country_iso3 = nearest_iso

        # ── Base CI ──
        # Prefer zone-level CI from polygon lookup (grid connectivity)
        # over coarse country-level average. This correctly assigns e.g.
        # Montreal → CA-QC (38 gCO₂/kWh) instead of Canada avg (~110).
        base_ci = zone_ci_arr[idx]              # NaN if no polygon match
        if np.isnan(base_ci):
            # Fall back to country-level CI
            if country_iso3 in CODECARBON_MIX:
                base_ci = CODECARBON_MIX[country_iso3].get("carbon_intensity", np.nan)
            if np.isnan(base_ci):
                base_ci = world_avg

        # State CI: batch path has no reverse geocoder, use base_ci as proxy
        state_ci_val = base_ci

        # ── Country fractions ──
        country_fossil_frac = 0.5
        country_clean_frac = 0.5
        country_coal_frac = 0.0
        country_gas_frac = 0.0
        country_nuclear_frac = 0.0
        country_renew_frac = 0.0
        if country_iso3 in CODECARBON_MIX:
            emix = CODECARBON_MIX[country_iso3]
            total_twh = emix.get("total_TWh", 0) or 1e-9
            country_fossil_frac = (emix.get("fossil_TWh", 0) or 0) / total_twh
            country_clean_frac = ((emix.get("renewables_TWh", 0) or 0) + (emix.get("nuclear_TWh", 0) or 0)) / total_twh
            country_coal_frac = (emix.get("coal_TWh", 0) or 0) / total_twh
            country_gas_frac = (emix.get("gas_TWh", 0) or 0) / total_twh
            country_nuclear_frac = (emix.get("nuclear_TWh", 0) or 0) / total_twh
            country_renew_frac = (emix.get("renewables_TWh", 0) or 0) / total_twh

        # ── Local plant features (from pre-computed indices) ──
        pp_idx = pp_indices[idx]
        emissions_per_capacity = 0.0
        local_pct_coal = 0.0
        local_pct_clean = 0.0
        mean_emissions_per_plant = 0.0
        idw_weighted_ci = 0.0
        local_ef_weighted = 0.0
        local_generation_gwh = 0.0
        local_mean_cf = 0.0
        local_trend_b_val = 0.0

        if len(pp_idx) > 0:
            n_plants = len(pp_idx)
            caps_loc = all_caps[pp_idx]
            emi_loc = all_emi[pp_idx]
            cap_sum = caps_loc.sum()
            if cap_sum > 0:
                emissions_per_capacity = emi_loc.sum() / cap_sum
            mean_emissions_per_plant = float(emi_loc.mean())

            is_coal_loc = all_is_coal[pp_idx]
            is_fossil_loc = all_is_fossil[pp_idx]

            # Count nearby renewable plants (WRI) for accurate mix fractions
            rn_idx = rn_indices[idx]
            n_renew_nearby = len(rn_idx)
            renew_cap_nearby = float(rn_caps[rn_idx].sum()) if n_renew_nearby > 0 and RENEW_TREE is not None else 0.0

            # When projecting to a future year, exclude retired plants
            # (projected emissions <= 0) from mix fractions
            if target_year is not None:
                active = ~all_is_retired[pp_idx]
                n_active_fossil = int(active.sum())
                n_total = n_active_fossil + n_renew_nearby
                if n_total > 0:
                    local_pct_coal = float(is_coal_loc[active].sum()) / n_total
                    local_pct_fossil = float(is_fossil_loc[active].sum()) / n_total
                else:
                    local_pct_coal = 0.0
                    local_pct_fossil = 0.0
            else:
                n_total = n_plants + n_renew_nearby
                local_pct_coal = is_coal_loc.sum() / n_total if n_total > 0 else 0.0
                local_pct_fossil = is_fossil_loc.sum() / n_total if n_total > 0 else 0.0
            local_pct_clean = max(0.0, 1.0 - local_pct_fossil)

            # Also factor renewables into emissions_per_capacity
            total_cap = cap_sum + renew_cap_nearby
            if total_cap > 0:
                emissions_per_capacity = emi_loc.sum() / total_cap

            # IDW-weighted CI — include both fossil (Climate TRACE) and
            # renewable (WRI) plants, so clean plants dilute the CI signal
            d_rad = np.sqrt((all_lat_r[pp_idx] - lat_r)**2 + (all_lon_r[pp_idx] - lon_r)**2)
            dk_km = np.maximum(d_rad * 6371.0, 1.0)
            w_idw = 1.0 / (dk_km ** 2)
            fuel_ci_loc = all_fuel_ci[pp_idx]

            # Renewable IDW contribution (CI ≈ 0 for clean plants)
            if n_renew_nearby > 0 and RENEW_TREE is not None:
                d_rn = np.sqrt((rn_lat_r[rn_idx] - lat_r)**2 + (rn_lon_r[rn_idx] - lon_r)**2)
                dk_rn = np.maximum(d_rn * 6371.0, 1.0)
                w_rn = 1.0 / (dk_rn ** 2)
                # Weight by capacity for renewables (they have no emissions/activity data)
                w_rn_cap = w_rn * rn_caps[rn_idx]
                rn_ci = rn_fuel_ci[rn_idx]  # ~0 for hydro/solar/wind/nuclear
            else:
                w_rn_cap = np.array([])
                rn_ci = np.array([])

            if target_year is not None:
                # Weight IDW by projected generation (capacity * trend scale)
                gen_weight = caps_loc * np.maximum(0, 1.0 + all_trend_b[pp_idx] * (target_year - 2024))
                w_fossil = w_idw * gen_weight
                # Combine fossil + renewable IDW
                all_w = np.concatenate([w_fossil, w_rn_cap]) if len(w_rn_cap) > 0 else w_fossil
                all_ci = np.concatenate([fuel_ci_loc, rn_ci]) if len(rn_ci) > 0 else fuel_ci_loc
                w_sum = all_w.sum()
                if w_sum > 0:
                    idw_weighted_ci = float(np.sum(all_w * all_ci) / w_sum)
            else:
                # Weight fossil by capacity too for consistency
                w_fossil_cap = w_idw * caps_loc
                all_w = np.concatenate([w_fossil_cap, w_rn_cap]) if len(w_rn_cap) > 0 else w_fossil_cap
                all_ci = np.concatenate([fuel_ci_loc, rn_ci]) if len(rn_ci) > 0 else fuel_ci_loc
                w_sum = all_w.sum()
                if w_sum > 0:
                    idw_weighted_ci = float(np.sum(all_w * all_ci) / w_sum)

            # Generation-weighted emission factor
            ef_loc = all_ef[pp_idx]
            act_loc = all_act[pp_idx]
            valid_mask = np.isfinite(ef_loc) & np.isfinite(act_loc) & (act_loc > 0)
            if valid_mask.any():
                total_gen = act_loc[valid_mask].sum()
                local_ef_weighted = float(np.sum(ef_loc[valid_mask] * act_loc[valid_mask]) / total_gen) * 1000.0
                local_generation_gwh = total_gen / 1000.0

            cf_loc = all_cf[pp_idx]
            cf_valid = cf_loc[np.isfinite(cf_loc) & (cf_loc > 0)]
            if len(cf_valid) > 0:
                local_mean_cf = float(cf_valid.mean())

            # Capacity-weighted linear trends
            caps_t = np.where(np.isfinite(caps_loc) & (caps_loc > 0), caps_loc, 1.0)
            wt = caps_t / max(caps_t.sum(), 1.0)
            local_trend_b_val = float(np.sum(all_trend_b[pp_idx] * wt))

        elif RENEW_TREE is not None:
            # No fossil plants nearby but check for renewable plants
            rn_idx = rn_indices[idx]
            n_renew_nearby = len(rn_idx)
            if n_renew_nearby > 0:
                local_pct_clean = 1.0
                local_pct_coal = 0.0
                # IDW from renewables only → very low CI
                d_rn = np.sqrt((rn_lat_r[rn_idx] - lat_r)**2 + (rn_lon_r[rn_idx] - lon_r)**2)
                dk_rn = np.maximum(d_rn * 6371.0, 1.0)
                w_rn = (1.0 / dk_rn**2) * rn_caps[rn_idx]
                w_sum = w_rn.sum()
                if w_sum > 0:
                    idw_weighted_ci = float(np.sum(w_rn * rn_fuel_ci[rn_idx]) / w_sum)

        # Fallback to country trend
        if local_trend_b_val == 0.0 and country_iso3 in COUNTRY_TRENDS:
            pct = COUNTRY_TRENDS[country_iso3].get('pct_change_per_year', 0.0)
            local_trend_b_val = (pct / 100.0) if pct else 0.0

        tb_out[idx] = local_trend_b_val

        # ── eMaps zone features ──
        # Prefer polygon-based zone CI (fixes KD-tree center mismatches)
        emaps_zone_ci_val = 0.0
        emaps_idw_ci_val = 0.0
        emaps_zone_clean_cap_frac = 0.0
        emaps_zone_fossil_cap_frac = 0.0
        emaps_zone_coal_cap_mw = 0.0
        # Use polygon zone CI when available (more accurate than KD-tree nearest center)
        _poly_zci = zone_ci_arr[idx] if not np.isnan(zone_ci_arr[idx]) else None
        if EMAPS_ZONE_TREE is not None:
            dist_z_km = ez_dist1[idx, 0] * 6371
            nz = ez_ind1[idx, 0]
            if _poly_zci is not None:
                emaps_zone_ci_val = _poly_zci
            elif dist_z_km < 500:
                emaps_zone_ci_val = float(EMAPS_ZONE_CI[nz])
            # Capacity fracs from KD-tree nearest (still useful even when CI is polygon-based)
            if dist_z_km < 500 and np.isfinite(EMAPS_ZONE_CLEAN_FRAC[nz]):
                emaps_zone_clean_cap_frac = float(EMAPS_ZONE_CLEAN_FRAC[nz])
                emaps_zone_fossil_cap_frac = float(EMAPS_ZONE_FOSSIL_FRAC[nz])
                emaps_zone_coal_cap_mw = float(EMAPS_ZONE_COAL_MW[nz])
            # IDW of top-k zones
            w_total = 0.0
            w_ci = 0.0
            for ki in range(ez_distk.shape[1]):
                dk = max(ez_distk[idx, ki] * 6371, 1.0)
                if dk > 1000:
                    continue
                w = 1.0 / dk ** 2
                w_total += w
                w_ci += w * EMAPS_ZONE_CI[ez_indk[idx, ki]]
            if w_total > 0:
                emaps_idw_ci_val = w_ci / w_total

        # ── Build feature vector ──
        feats_dict = {
            "country_ci": base_ci,
            "emissions_per_capacity": emissions_per_capacity,
            "local_pct_coal": local_pct_coal,
            "local_pct_clean": local_pct_clean,
            "mean_emissions_per_plant": mean_emissions_per_plant,
            "abs_lat": abs(lat_i),
            "idw_weighted_ci": idw_weighted_ci,
            "country_ci_sq": base_ci ** 2 / 1000.0,
            "emaps_zone_ci": emaps_zone_ci_val,
            "emaps_idw_ci": emaps_idw_ci_val,
            # Engineered features
            "sqrt_zone_ci": emaps_zone_ci_val ** 0.5 if emaps_zone_ci_val >= 0 else 0.0,
            "zone_x_country": emaps_zone_ci_val * base_ci / 1000.0,
            "country_fossil_frac": country_fossil_frac,
            "country_clean_frac": country_clean_frac,
            "country_coal_frac": country_coal_frac,
            "country_gas_frac": country_gas_frac,
            "country_nuclear_frac": country_nuclear_frac,
            "country_renew_frac": country_renew_frac,
            "ct_grid_ci_est": emissions_per_capacity * country_fossil_frac,
            "local_ef_weighted": local_ef_weighted,
            "local_generation_gwh": local_generation_gwh,
            "local_mean_cf": local_mean_cf,
            "emaps_zone_clean_cap_frac": emaps_zone_clean_cap_frac,
            "emaps_zone_fossil_cap_frac": emaps_zone_fossil_cap_frac,
            "emaps_zone_coal_cap_mw": emaps_zone_coal_cap_mw,
            "state_ci": state_ci_val,
            # Provider dummy (0.0 at inference = predict actual grid CI)
            "is_gcp": 0.0,
            # Temporal features
            "country_trend_pct": COUNTRY_TRENDS.get(country_iso3, {}).get('pct_change_per_year', 0.0),
            "local_trend_x_ci": local_trend_b_val * base_ci,
        }
        X[idx] = [feats_dict.get(f, 0.0) for f in feat_names]

    t_feat = _time.perf_counter()

    # ── Batch Ridge prediction (one matrix multiply) ──
    if n_feats > 0:
        X_scaled = (X - scaler_mean) / scaler_scale
        ci_pred = X_scaled @ coefs + intercept
        ci_out = np.maximum(ci_pred, 0.0)
    else:
        ci_out[:] = world_avg

    # ── Hybrid: use zone CI directly for clean grids ──
    # For zones with CI < 100 gCO₂/kWh (hydro/nuclear/wind dominated),
    # the zone power-mix IS the grid truth.  The Ridge model's local
    # plant features add noise for these zones because the plants that
    # *actually* supply electricity may be hundreds of km away on the
    # same transmission grid — not the nearby fossil plants the model sees.
    clean_zone_mask = np.isfinite(zone_ci_arr) & (zone_ci_arr < 100)
    ci_out[clean_zone_mask] = zone_ci_arr[clean_zone_mask]

    # ── Footprint ──
    base_pue = 1.58
    lat_bonus = np.minimum(0.20, np.abs(lats) * 0.003)
    pues = np.clip(base_pue - lat_bonus, 1.05, 1.80)
    fp_out = it_load_mw * pues * ci_out * 8.76

    t_end = _time.perf_counter()
    print(f"  ⚡ Batch predict {N} points: "
          f"BallTree={t_bt - t0:.2f}s  Features={t_feat - t_bt:.2f}s  "
          f"Predict={t_end - t_feat:.2f}s  TOTAL={t_end - t0:.2f}s")

    return {"ci": ci_out, "fp": fp_out, "tb": tb_out}


def predict_ci(lat: float, lon: float, year: int = 2024) -> float:
    """
    Simple inference: (lat, lon, year) → carbon intensity in gCO₂/kWh.

    This is the primary public interface. Under the hood it:
      1. Finds nearby power plants via BallTree spatial query
      2. Projects per-plant emissions to the target year
      3. Computes local energy-mix features from the projected infrastructure
      4. Runs a Ridge regression to predict carbon intensity

    Examples:
        >>> predict_ci(48.8566, 2.3522, 2024)   # Paris, today
        78.3
        >>> predict_ci(51.5, 14.5, 2030)         # Poland-Germany border, 2030
        392.4
    """
    result = predict_grid_batch(
        np.array([lat]), np.array([lon]),
        it_load_mw=1.0,   # irrelevant for CI, only affects footprint
        target_year=year,
    )
    return float(result["ci"][0])


# =====================================================================
#  STARTUP (guarded for import)
# =====================================================================
print("=" * 60)
print("GridSync Hybrid Carbon Engine v2.0 — Starting")
print("=" * 60)
load_codecarbon()
load_power_plants()
load_fossil_ops()
load_renewables()
load_data_centers()
load_emaps_zones()
load_zone_polygons()      # must run AFTER load_emaps_zones (needs CI values)

# Test Layer 3
print("[Layer 3] Testing UK Carbon Intensity API...")
uk_data = query_uk_carbon_intensity()
if uk_data:
    print(f"  ✅ UK live: {uk_data['forecast']} gCO2/kWh (index: {uk_data['index']})")
else:
    print("  ⚠️ UK API unreachable")
print("=" * 60)
print("Engine ready! Visit http://localhost:8000/docs")
print("=" * 60)


# =====================================================================
#  API MODELS
# =====================================================================
class SiteRequest(BaseModel):
    lat: float
    lon: float
    radius_km: float = 300.0


class FootprintRequest(BaseModel):
    lat: float
    lon: float
    it_load_mw: float = 10.0
    provider: Optional[str] = None
    radius_km: float = 300.0


# =====================================================================
#  ENDPOINTS
# =====================================================================
@app.get("/")
async def root():
    return {
        "engine": "GridSync Hybrid Carbon Engine v2.0",
        "docs": "/docs",
        "endpoints": {
            "predict_footprint": "POST /api/predict-footprint",
            "predict_site": "POST /api/predict-site",
            "compare_sites": "POST /api/compare-sites",
            "validate_dcs": "GET /api/validate-dcs",
        },
        "layers": {
            "layer_1": f"CodeCarbon: {len(CODECARBON_MIX)} countries",
            "layer_2": f"Climate TRACE: {len(POWER_PLANTS_DF)} power plants",
            "layer_2b": f"Fossil ops: {len(FOSSIL_OPS_DF) if FOSSIL_OPS_DF is not None else 0}",
            "data_centers": len(DATA_CENTERS),
        }
    }


@app.post("/api/predict-footprint")
async def api_predict_footprint(req: FootprintRequest):
    """
    Predict annual carbon footprint (tonnes CO₂/year) for a data center.

    Takes IT load in MW, estimates PUE from latitude/provider, uses our
    multi-layer carbon intensity engine, and returns footprint with
    equivalences and 2027/2030 projections.
    """
    return predict_footprint(req.lat, req.lon, req.it_load_mw, req.provider, req.radius_km)


@app.post("/api/predict-site")
async def predict_site(req: SiteRequest):
    """Predict Green Score for a proposed site (without DC sizing)."""
    result = compute_green_score(req.lat, req.lon, req.radius_km)
    result["coordinates"] = {"lat": req.lat, "lon": req.lon}
    return result


@app.post("/api/compare-sites")
async def compare_sites(sites: list[FootprintRequest]):
    """Compare footprint across multiple sites for the same DC size."""
    results = []
    for site in sites:
        fp = predict_footprint(site.lat, site.lon, site.it_load_mw, site.provider, site.radius_km)
        results.append(fp)
    results.sort(key=lambda x: x["annual_footprint"]["tonnes_co2_per_year"])
    return {
        "sites": results,
        "best": results[0] if results else None,
        "savings_vs_worst": (
            results[-1]["annual_footprint"]["tonnes_co2_per_year"] -
            results[0]["annual_footprint"]["tonnes_co2_per_year"]
        ) if len(results) >= 2 else 0,
    }


@app.get("/api/validate-dcs")
async def validate_dcs():
    """
    Validate the prediction model against all 147 known data centers.
    Assumes 50 MW per hyperscale DC and uses known provider PUEs.
    Returns predicted footprint for each DC for comparison with published data.
    """
    assumed_mw = 50  # typical hyperscale DC
    total_by_provider = {}
    dc_results = []

    for dc in DATA_CENTERS:
        fp = predict_footprint(
            dc["lat"], dc["lon"], assumed_mw,
            provider=dc.get("provider"),
        )
        entry = {
            "dc_id": dc["id"],
            "provider": dc.get("provider"),
            "lat": dc["lat"],
            "lon": dc["lon"],
            "country": fp["country"],
            "pue": fp["estimated_pue"],
            "carbon_intensity": fp["carbon_intensity_gCO2_kWh"],
            "annual_tonnes": fp["annual_footprint"]["tonnes_co2_per_year"],
            "green_score": fp["green_score"],
            "grade": fp["grade"],
        }
        dc_results.append(entry)

        provider = dc.get("provider", "unknown")
        if provider not in total_by_provider:
            total_by_provider[provider] = {"count": 0, "total_tonnes": 0}
        total_by_provider[provider]["count"] += 1
        total_by_provider[provider]["total_tonnes"] += entry["annual_tonnes"]

    # Published reference data (annual scope 2 emissions, approximate)
    published = {
        "gcp": {"published_total_tCO2": 14_300_000, "note": "Google 2023 Environmental Report"},
        "azure": {"published_total_tCO2": 16_000_000, "note": "Microsoft 2023 Sustainability Report"},
        "aws": {"published_total_tCO2": None, "note": "AWS does not disclose per-DC emissions"},
    }
    for provider in total_by_provider:
        pub = published.get(provider, {})
        total_by_provider[provider]["published_reference"] = pub.get("published_total_tCO2")
        total_by_provider[provider]["note"] = pub.get("note", "No published data available")

    return {
        "assumed_it_load_mw": assumed_mw,
        "total_dcs_evaluated": len(dc_results),
        "summary_by_provider": total_by_provider,
        "dcs": sorted(dc_results, key=lambda x: x["annual_tonnes"]),
    }


@app.get("/api/uk-live")
async def uk_live():
    ci = query_uk_carbon_intensity()
    if not ci:
        raise HTTPException(status_code=502, detail="UK API unreachable")
    return ci


@app.get("/api/countries")
async def list_countries():
    result = []
    for iso, data in CODECARBON_MIX.items():
        ci = data.get("carbon_intensity")
        score = max(0, min(100, 100 - (ci / 9.0))) if ci else 0
        grade = "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 55 else "D" if score >= 40 else "E" if score >= 25 else "F"
        result.append({
            "iso3": iso, "country": data.get("country_name", iso),
            "carbon_intensity": ci, "green_score": round(score, 1), "grade": grade,
        })
    return sorted(result, key=lambda x: x["green_score"], reverse=True)


@app.get("/predict")
async def api_predict_ci(
    lat: float,
    lon: float,
    year: int = 2024,
):
    """
    Simple prediction: (lat, lon, year) → carbon intensity.

    Example: /predict?lat=48.86&lon=2.35&year=2028
    """
    ci = predict_ci(lat, lon, year)
    pue = estimate_pue(lat)
    fp_tonnes = 1.0 * pue * ci * 8.76  # per 1 MW
    return {
        "lat": lat,
        "lon": lon,
        "year": year,
        "carbon_intensity_gCO2_kWh": round(ci, 1),
        "footprint_tCO2_per_MW_per_year": round(fp_tonnes, 0),
    }


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": "2.0",
        "layers": {
            "codecarbon_countries": len(CODECARBON_MIX),
            "power_plants": len(POWER_PLANTS_DF) if POWER_PLANTS_DF is not None else 0,
            "fossil_operations": len(FOSSIL_OPS_DF) if FOSSIL_OPS_DF is not None else 0,
            "data_centers": len(DATA_CENTERS),
            "fuel_weights": len(FUEL_WEIGHTS),
            "country_trends": len(COUNTRY_TRENDS),
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

