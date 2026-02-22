"""
GridSync — Feature Correlation Analysis

Ground truth: CodeCarbon cloud/impact.csv (40 cloud regions with known gCO2/kWh)
Features: Everything we extract from our data layers for each location.

Goal: Find which features correlate with actual carbon intensity,
then use the best features in a regression model.

Run: python3 analyze_features.py
"""

import json
import math
import sys
import warnings
warnings.filterwarnings('ignore', category=RuntimeWarning)

import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree

# ── Load all data layers (same as geo_estimator) ──
CODECARBON_MIX_PATH = "../codecarbon/codecarbon/data/private_infra/global_energy_mix.json"
CODECARBON_FUEL_PATH = "../codecarbon/codecarbon/data/private_infra/carbon_intensity_per_source.json"
CODECARBON_USA_PATH = "../codecarbon/codecarbon/data/private_infra/2016/usa_emissions.json"
CODECARBON_CAN_PATH = "../codecarbon/codecarbon/data/private_infra/2023/canada_energy_mix.json"
CLOUD_IMPACT_PATH = "../codecarbon/codecarbon/data/cloud/impact.csv"
CLIMATE_TRACE_POWER = "../datasets_tracer/power/DATA/electricity-generation_emissions_sources_v5_3_0.csv"
CLIMATE_TRACE_COAL = "../datasets_tracer/fossil_fuel_operations/DATA/coal-mining_emissions_sources_v5_3_0.csv"
CLIMATE_TRACE_REFINING = "../datasets_tracer/fossil_fuel_operations/DATA/oil-and-gas-refining_emissions_sources_v5_3_0.csv"
CLIMATE_TRACE_OILGAS = "../datasets_tracer/fossil_fuel_operations/DATA/oil-and-gas-production_emissions_sources_v5_3_0.csv"
WRI_GPPD_PATH = "../datasets_tracer/globalpowerplantdatabasev130/global_power_plant_database.csv"
DC_PATH = "../electricitymaps-contrib/config/data_centers/data_centers.json"
EMAPS_ZONES_DIR = "../electricitymaps-contrib/config/zones"
WORLD_GEOJSON_PATH = "../electricitymaps-contrib/geo/world.geojson"


def classify_fuel(source_type):
    s = str(source_type).lower()
    if 'coal' in s: return 'coal'
    if any(k in s for k in ['gas', 'ccgt', 'ocgt']): return 'natural_gas'
    if any(k in s for k in ['oil', 'petrol', 'diesel']): return 'petroleum'
    if any(k in s for k in ['solar', 'pv']): return 'solar'
    if 'wind' in s: return 'wind'
    if any(k in s for k in ['hydro', 'water']): return 'hydroelectricity'
    if 'nuclear' in s: return 'nuclear'
    if 'geotherm' in s: return 'geothermal'
    return 'fossil'


def main():
    print("=" * 65)
    print("GridSync Feature Correlation Analysis")
    print("=" * 65)

    # ── 1. Load ground truth ──
    print("\n[1] Loading ground truth (cloud/impact.csv)...")
    cloud_df = pd.read_csv(CLOUD_IMPACT_PATH, encoding='utf-8-sig')
    print(f"    {len(cloud_df)} cloud regions with known carbon intensity")
    print(f"    Columns: {list(cloud_df.columns)}")
    print(f"    impact range: {cloud_df['impact'].min()} – {cloud_df['impact'].max()} gCO2/kWh")

    # ── 2. Load CodeCarbon country data ──
    print("\n[2] Loading CodeCarbon country baselines...")
    with open(CODECARBON_MIX_PATH) as f:
        cc_mix = json.load(f)
    with open(CODECARBON_FUEL_PATH) as f:
        fuel_weights = json.load(f)
    with open(CODECARBON_USA_PATH) as f:
        usa_emissions = json.load(f)
    with open(CODECARBON_CAN_PATH) as f:
        can_emissions = json.load(f)
    print(f"    {len(cc_mix)} countries, {len(usa_emissions)-1} US states, {len(can_emissions)} CA provinces")

    # ── 3. Load Climate TRACE power plants ──
    print("\n[3] Loading Climate TRACE power plants...")
    cols = ['source_name', 'source_type', 'start_time', 'iso3_country',
            'lat', 'lon', 'emissions_quantity', 'capacity',
            'emissions_factor', 'activity', 'other5']
    raw_pp = pd.read_csv(CLIMATE_TRACE_POWER, usecols=cols)
    raw_pp = raw_pp.dropna(subset=['lat', 'lon', 'emissions_quantity'])
    raw_pp['year'] = pd.to_datetime(raw_pp['start_time']).dt.year
    latest = raw_pp['year'].max()
    pp = raw_pp[raw_pp['year'] == latest].groupby('source_name', as_index=False).agg({
        'source_type': 'first', 'iso3_country': 'first',
        'lat': 'first', 'lon': 'first',
        'emissions_quantity': 'sum', 'capacity': 'first',
        'emissions_factor': 'mean',   # plant-level t CO2e/MWh
        'activity': 'sum',            # annual MWh generated
        'other5': 'mean',             # capacity factor (0-1)
    })
    pp_coords = np.radians(pp[['lat', 'lon']].values)
    pp_tree = BallTree(pp_coords, metric='haversine')
    print(f"    {len(pp)} plants (year {latest})")

    # ── 4. Load fossil ops ──
    print("\n[4] Loading fossil fuel operations...")
    fossil_dfs = []
    for path, label in [(CLIMATE_TRACE_COAL, "coal"), (CLIMATE_TRACE_REFINING, "refining"),
                         (CLIMATE_TRACE_OILGAS, "oil-gas")]:
        try:
            df = pd.read_csv(path, usecols=cols)
            df = df.dropna(subset=['lat', 'lon', 'emissions_quantity'])
            df['year'] = pd.to_datetime(df['start_time']).dt.year
            df = df[df['year'] == df['year'].max()]
            dedup = df.groupby('source_name', as_index=False).agg({
                'source_type': 'first', 'iso3_country': 'first',
                'lat': 'first', 'lon': 'first',
                'emissions_quantity': 'sum', 'capacity': 'first',
            })
            dedup['sector'] = label
            fossil_dfs.append(dedup)
        except: pass
    fossil_df = pd.concat(fossil_dfs, ignore_index=True) if fossil_dfs else pd.DataFrame()
    fossil_tree = None
    if len(fossil_df) > 0:
        fossil_coords = np.radians(fossil_df[['lat', 'lon']].values)
        fossil_tree = BallTree(fossil_coords, metric='haversine')
    print(f"    {len(fossil_df)} fossil operations")

    # ── 4b. Load WRI renewable plants ──
    print("\n[4b] Loading WRI Global Power Plant Database (renewables)...")
    clean_fuels = {'Solar', 'Wind', 'Hydro', 'Nuclear', 'Geothermal', 'Wave and Tidal'}
    wri_df = pd.read_csv(WRI_GPPD_PATH, low_memory=False)
    wri_clean = wri_df[wri_df['primary_fuel'].isin(clean_fuels)].copy()
    wri_clean = wri_clean.dropna(subset=['latitude', 'longitude', 'capacity_mw'])
    wri_clean = wri_clean[wri_clean['capacity_mw'] > 0]
    fuel_map = {
        'Hydro': 'hydroelectricity', 'Nuclear': 'nuclear',
        'Solar': 'solar', 'Wind': 'wind',
        'Geothermal': 'geothermal', 'Wave and Tidal': 'hydroelectricity',
    }
    wri_clean['fuel_cat'] = wri_clean['primary_fuel'].map(fuel_map)
    wri_coords = np.radians(wri_clean[['latitude', 'longitude']].values)
    wri_tree = BallTree(wri_coords, metric='haversine')
    wri_caps = wri_clean['capacity_mw'].values
    wri_fuel_ci = np.array([fuel_weights.get(fc, 0) for fc in wri_clean['fuel_cat'].values])
    print(f"    {len(wri_clean)} clean power plants")

    # ── 5. Load data centers ──
    print("\n[5] Loading data centers...")
    with open(DC_PATH) as f:
        dc_raw = json.load(f)
    dc_list = []
    for key, data in dc_raw.items():
        if "lonlat" in data:
            lon, lat = data["lonlat"]
            dc_list.append({"id": key, "lat": lat, "lon": lon})
    dc_coords = np.radians([[d["lat"], d["lon"]] for d in dc_list])
    dc_tree = BallTree(dc_coords, metric='haversine') if len(dc_list) > 0 else None
    print(f"    {len(dc_list)} data centers")

    # ── 5b. Load Electricity Maps zone CI data ──
    print("\n[5b] Loading Electricity Maps zone CI data...")
    import yaml, os, glob
    emaps_zone_ci = {}   # {zone_key: {'center': (lat,lon), 'ci': float}}
    zone_files = glob.glob(os.path.join(EMAPS_ZONES_DIR, "*.yaml"))
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
            # Extract the fallbackZoneMixes to estimate zone CI
            fbm = zdata.get('fallbackZoneMixes', {})
            power_mix = fbm.get('powerOriginRatios', [])
            ef = zdata.get('emissionFactors', {})
            direct_ef = ef.get('direct', {})
            lifecycle_ef = ef.get('lifecycle', {})
            # Try to compute an average CI from fallback zone mixes
            if power_mix:
                # Use the most recent entry
                latest_mix = power_mix[-1] if isinstance(power_mix, list) else power_mix
                if isinstance(latest_mix, dict):
                    # The ratios may be nested under a 'value' key
                    mix_ratios = latest_mix.get('value', latest_mix)
                    if isinstance(mix_ratios, dict):
                        zone_ci = 0.0
                        # Map fuel types to their direct emission factor
                        fuel_ef_defaults = {
                            'coal': 995, 'gas': 490, 'oil': 816, 'biomass': 230,
                            'nuclear': 29, 'hydro': 26, 'wind': 26, 'solar': 48,
                            'geothermal': 38, 'unknown': 475,
                            'hydro discharge': 26, 'battery discharge': 200,
                        }
                        for fuel, ratio in mix_ratios.items():
                            if fuel in ('_source', 'datetime', '_comment'):
                                continue
                            if isinstance(ratio, (int, float)) and ratio > 0:
                                # Try to get specific EF from zone data
                                ef_val = fuel_ef_defaults.get(fuel, 475)
                                if fuel in direct_ef:
                                    ef_entry = direct_ef[fuel]
                                    if isinstance(ef_entry, list):
                                        ef_val = ef_entry[-1].get('value', ef_val)
                                    elif isinstance(ef_entry, dict):
                                        ef_val = ef_entry.get('value', ef_val)
                                zone_ci += ratio * ef_val
                        if zone_ci > 0:
                            emaps_zone_ci[zone_key] = {
                                'center': (cp.get('lat', 0), cp.get('lon', 0)),
                                'ci': zone_ci,
                            }
        except Exception:
            pass
    # Build a BallTree for zone lookups
    if emaps_zone_ci:
        zone_keys = list(emaps_zone_ci.keys())
        zone_coords_arr = np.array([[v['center'][0], v['center'][1]] for v in emaps_zone_ci.values()])
        zone_coords_rad = np.radians(zone_coords_arr)
        zone_tree = BallTree(zone_coords_rad, metric='haversine')
        zone_ci_values = np.array([emaps_zone_ci[k]['ci'] for k in zone_keys])
        print(f"    {len(emaps_zone_ci)} zones with CI estimates (range: {zone_ci_values.min():.0f}-{zone_ci_values.max():.0f})")
    else:
        zone_tree = None
        zone_keys = []
        zone_ci_values = np.array([])
        print("    ⚠️ No zone CI data loaded")

    # ── 5c. Load Electricity Maps zone CAPACITY data ──
    print("\n[5c] Loading Electricity Maps zone capacity data...")
    zone_cap_data = {}  # {zone_key: {"clean_frac": float, "fossil_frac": float, "coal_mw": float}}
    CLEAN_FUELS = {'solar', 'wind', 'hydro', 'nuclear', 'geothermal', 'hydro storage'}
    FOSSIL_FUELS = {'coal', 'gas', 'oil'}
    for zpath in zone_files:
        try:
            with open(zpath) as zf:
                zdata = yaml.safe_load(zf)
            if not zdata:
                continue
            zone_key = os.path.basename(zpath).replace('.yaml', '')
            cap = zdata.get('capacity', {})
            if not cap:
                continue
            # Get latest capacity value for each fuel
            fuel_mw = {}
            for fuel, entries in cap.items():
                if isinstance(entries, list) and len(entries) > 0:
                    # Time series: take the latest entry
                    last = entries[-1]
                    if isinstance(last, dict):
                        fuel_mw[fuel] = last.get('value', 0) or 0
                    else:
                        fuel_mw[fuel] = float(last) if last else 0
                elif isinstance(entries, (int, float)):
                    fuel_mw[fuel] = entries
            total_mw = sum(fuel_mw.values())
            if total_mw <= 0:
                continue
            clean_mw = sum(fuel_mw.get(f, 0) for f in CLEAN_FUELS)
            fossil_mw = sum(fuel_mw.get(f, 0) for f in FOSSIL_FUELS)
            coal_mw = fuel_mw.get('coal', 0)
            zone_cap_data[zone_key] = {
                'clean_frac': clean_mw / total_mw,
                'fossil_frac': fossil_mw / total_mw,
                'coal_mw': coal_mw,
            }
        except Exception:
            pass
    # Map zone_cap_data to the same BallTree as zone CI
    # Build arrays aligned with zone_keys
    zone_clean_frac_arr = np.full(len(zone_keys), np.nan)
    zone_fossil_frac_arr = np.full(len(zone_keys), np.nan)
    zone_coal_mw_arr = np.full(len(zone_keys), 0.0)
    for i, zk in enumerate(zone_keys):
        if zk in zone_cap_data:
            zone_clean_frac_arr[i] = zone_cap_data[zk]['clean_frac']
            zone_fossil_frac_arr[i] = zone_cap_data[zk]['fossil_frac']
            zone_coal_mw_arr[i] = zone_cap_data[zk]['coal_mw']
    n_with_cap = np.isfinite(zone_clean_frac_arr).sum()
    print(f"    {n_with_cap}/{len(zone_keys)} zones with capacity data")

    # ── 5d. Load zone boundary polygons for point-in-polygon zone CI lookup ──
    print("\n[5d] Loading zone boundary polygons...")
    from shapely.geometry import shape as _shape, Point as _Point
    from shapely.strtree import STRtree as _STRtree
    from shapely import prepare as _prepare
    zone_poly_names = []
    zone_polygons = []
    zone_poly_ci = {}  # zone_name -> CI value
    if os.path.exists(WORLD_GEOJSON_PATH):
        with open(WORLD_GEOJSON_PATH) as f:
            geo = json.load(f)
        for feat in geo['features']:
            zn = feat['properties']['zoneName']
            poly = _shape(feat['geometry'])
            _prepare(poly)
            zone_poly_names.append(zn)
            zone_polygons.append(poly)
        zone_poly_tree = _STRtree(zone_polygons) if zone_polygons else None
        # Build zone_name -> CI from emaps data
        for zk, zv in emaps_zone_ci.items():
            zone_poly_ci[zk] = zv['ci']
        n_ci = sum(1 for zn in zone_poly_names if zn in zone_poly_ci)
        print(f"    {len(zone_polygons)} zone polygons, {n_ci} with CI values")
    else:
        zone_poly_tree = None
        print("    ⚠️  world.geojson not found — zone polygons disabled")

    # ── 6. Map cloud regions to coordinates ──
    # Cloud regions don't have lat/lon directly, but have city names.
    # We'll match them to our DC dataset by region ID.
    print("\n[6] Matching cloud regions to DC coordinates...")
    region_to_dc = {}
    for key, data in dc_raw.items():
        if "region" in data and "lonlat" in data:
            region_to_dc[data["region"]] = data["lonlat"]
        # Also match by prefix (e.g., gcp-us-central1 → us-central1)
        parts = key.split("-", 1)
        if len(parts) == 2 and "lonlat" in data:
            region_to_dc[parts[1]] = data["lonlat"]

    # ── City-based coordinate fallback ──
    # For regions not in the DC JSON (e.g. Azure naming conventions differ)
    CITY_COORDS = {
        # (city.lower(), iso): [lon, lat]
        ("johannesburg", "ZAF"): [28.0473, -26.2041],
        ("cape town", "ZAF"): [18.4231, -33.9221],
        ("changhua county", "TWN"): [120.5161, 24.0518],
        ("hong kong", "CHN"): [114.1694, 22.3193],
        ("tokyo", "JPN"): [139.65, 35.6764],
        ("osaka", "JPN"): [135.5023, 34.6937],
        ("seoul", "KOR"): [126.9971, 37.5503],
        ("mumbai", "IND"): [72.8777, 19.076],
        ("delhi", "IND"): [77.1025, 28.7041],
        ("hyderabad", "IND"): [78.476, 17.366],
        ("pune", "IND"): [73.8567, 18.5204],
        ("chennai", "IND"): [80.2707, 13.0827],
        ("singapore", "SGP"): [103.8198, 1.3521],
        ("jurong west", "SGP"): [103.7067, 1.3404],
        ("jakarta", "IDN"): [106.8229, -6.1944],
        ("sydney", "AUS"): [151.2093, -33.8688],
        ("melbourne", "AUS"): [144.9631, -37.8136],
        ("warsaw", "POL"): [21.0122, 52.2297],
        ("hamina", "FIN"): [27.195, 60.5693],
        ("stockholm", "SWE"): [18.0656, 59.3327],
        ("gavle", "SWE"): [17.1413, 60.6749],
        ("madrid", "ESP"): [-3.7038, 40.4168],
        ("zaragoza", "ESP"): [-0.8247, 41.7737],
        ("st. ghislain", "BEL"): [3.8186, 50.449],
        ("london", "GBR"): [-0.1276, 51.5072],
        ("cardiff", "GBR"): [-3.1791, 51.4816],
        ("frankfurt", "DEU"): [8.6821, 50.1109],
        ("berlin", "DEU"): [13.405, 52.52],
        ("eemshaven", "NLD"): [6.8317, 53.4386],
        ("amsterdam", "NLD"): [4.9041, 52.3676],
        ("zurich", "CHE"): [8.5417, 47.3769],
        ("milan", "ITA"): [9.1824, 45.4685],
        ("turin", "ITA"): [7.6869, 45.0703],
        ("paris", "FRA"): [2.3514, 48.8575],
        ("marseille", "FRA"): [5.3698, 43.2965],
        ("doha", "QAT"): [51.5310, 25.2854],
        ("dammam", "SAU"): [50.1033, 26.3927],
        ("tel aviv", "ISR"): [34.7818, 32.0853],
        ("montreal", "CAN"): [-73.5674, 45.5019],
        ("toronto", "CAN"): [-79.3832, 43.6532],
        ("quebec city", "CAN"): [-71.2075, 46.8139],
        ("calgary", "CAN"): [-114.0719, 51.0447],
        ("queretaro", "MEX"): [-100.3899, 20.5888],
        ("sao paulo", "BRA"): [-46.6396, -23.5558],
        ("santiago", "CHL"): [-70.6693, -33.4489],
        ("council bluffs", "USA"): [-95.8608, 41.2619],
        ("moncks corner", "USA"): [-80.0131, 33.1960],
        ("columbus", "USA"): [-82.9988, 39.9612],
        ("ashburn", "USA"): [-77.4291, 39.0067],
        ("dallas", "USA"): [-96.7970, 32.7767],
        ("san antonio", "USA"): [-98.4936, 29.4241],
        ("the dalles", "USA"): [-121.1787, 45.5946],
        ("los angeles", "USA"): [-118.2437, 34.0522],
        ("salt lake city", "USA"): [-111.8910, 40.7608],
        ("las vegas", "USA"): [-115.1398, 36.1699],
        ("san francisco", "USA"): [-122.4194, 37.7749],
        ("portland", "USA"): [-122.6765, 45.5152],
        ("phoenix", "USA"): [-112.0740, 33.4484],
        ("des moines", "USA"): [-93.6091, 41.5868],
        ("chicago", "USA"): [-87.6298, 41.8781],
        ("seattle", "USA"): [-122.3321, 47.6062],
        ("kuala lumpur", "MYS"): [101.6841, 3.1319],
        ("auckland", "NZL"): [174.7633, -36.8485],
        ("bangkok", "THA"): [100.5018, 13.7563],
        ("bahrain", "BHR"): [50.5577, 26.0667],
        ("dubai", "ARE"): [55.2708, 25.2048],
        ("oslo", "NOR"): [10.7522, 59.9139],
        ("dublin", "IRL"): [-6.2603, 53.3498],
    }

    matched = 0
    cloud_features = []

    for _, row in cloud_df.iterrows():
        region = row['region']
        ground_truth_ci = row['impact']
        country_iso = row['countryIsoCode']
        provider = row['provider'] if 'provider' in row else row.get('﻿provider', '')

        # Try to find coordinates
        coords = region_to_dc.get(region)
        if coords is None:
            # Try matching with provider prefix
            full_key = f"{provider}-{region}"
            for k, v in dc_raw.items():
                if k == full_key and "lonlat" in v:
                    coords = v["lonlat"]
                    break

        # Fallback: match by city name + country ISO
        if coords is None:
            city_name = str(row.get('city', '')).lower().strip()
            if city_name:
                coords = CITY_COORDS.get((city_name, country_iso))

        if coords is None:
            continue  # can't match this region

        lon, lat = coords
        matched += 1
        target_rad = [[math.radians(lat), math.radians(lon)]]
        radius_km = 300
        radius_rad = radius_km / 6371.0
        
        state = row.get("state", "")
        if pd.isna(state):
            state = ""
        city = row.get("city", "")
        if pd.isna(city):
            city = ""

        # ── Fix: resolve state from city when missing ──
        # Map well-known cities to provinces/states
        CITY_TO_PROVINCE = {
            "toronto": "ontario", "montreal": "quebec", "vancouver": "british columbia",
            "calgary": "alberta", "ottawa": "ontario", "edmonton": "alberta",
            "winnipeg": "manitoba", "quebec city": "quebec",
        }
        US_STATE_ALIASES = {
            "northern virginia": "virginia",
        }
        if not state and city:
            state = CITY_TO_PROVINCE.get(city.lower(), "")
        if state.lower() in US_STATE_ALIASES:
            state = US_STATE_ALIASES[state.lower()]

        # ── Extract ALL features ──
        features = {
            "region": region,
            "provider": provider,
            "country_iso": country_iso,
            "lat": lat,
            "lon": lon,
            "abs_lat": abs(lat),
            "ground_truth_ci": ground_truth_ci,
        }

        # Feature: Country baseline CI
        # Prefer zone-level CI from polygon lookup (grid connectivity)
        ci_val = np.nan
        if zone_poly_tree is not None:
            _pt = _Point(lon, lat)
            _candidates = zone_poly_tree.query(_pt)
            for _cidx in _candidates:
                if zone_polygons[_cidx].contains(_pt):
                    _zn = zone_poly_names[_cidx]
                    _zci = zone_poly_ci.get(_zn)
                    if _zci is not None:
                        ci_val = _zci
                    break
            # Fallback: nearest polygon within ~50 km for coastline edge-cases
            if np.isnan(ci_val):
                _ni = zone_poly_tree.nearest(_pt)
                if zone_polygons[_ni].distance(_pt) < 0.5:
                    _zn = zone_poly_names[_ni]
                    _zci = zone_poly_ci.get(_zn)
                    if _zci is not None:
                        ci_val = _zci
        if np.isnan(ci_val):
            # Fall back to country/state-level CI
            if country_iso == "USA" and state.lower() in usa_emissions:
                ci_val = usa_emissions[state.lower()]["emissions"] * 0.453592
            elif country_iso == "CAN" and state.lower() in can_emissions:
                mix = can_emissions[state.lower()]
                ci_val = (
                    (mix.get("coal", 0) / 100.0) * fuel_weights.get("coal", 995) +
                    (mix.get("naturalGas", 0) / 100.0) * fuel_weights.get("natural_gas", 743) +
                    (mix.get("petroleum", 0) / 100.0) * fuel_weights.get("petroleum", 816) +
                    (mix.get("biomass", 0) / 100.0) * fuel_weights.get("biomass", 230) +
                    (mix.get("solar", 0) / 100.0) * fuel_weights.get("solar", 48) +
                    (mix.get("wind", 0) / 100.0) * fuel_weights.get("wind", 26) +
                    (mix.get("hydro", 0) / 100.0) * fuel_weights.get("hydroelectricity", 26) +
                    (mix.get("nuclear", 0) / 100.0) * fuel_weights.get("nuclear", 29)
                )
            elif country_iso in cc_mix:
                ci_val = cc_mix[country_iso].get("carbon_intensity", np.nan)
            
        features["country_ci"] = ci_val

        if country_iso in cc_mix:
            emix = cc_mix[country_iso]
            total_twh = emix.get("total_TWh", 0) or 1e-9  # avoid div-by-zero
            fossil_twh = emix.get("fossil_TWh", 0) or 0
            coal_twh = emix.get("coal_TWh", 0) or 0
            gas_twh = emix.get("gas_TWh", 0) or 0
            oil_twh = emix.get("oil_TWh", 0) or 0
            nuclear_twh = emix.get("nuclear_TWh", 0) or 0
            renewables_twh = emix.get("renewables_TWh", 0) or 0
            hydro_twh = emix.get("hydroelectricity_TWh", 0) or 0
            solar_twh = emix.get("solar_TWh", 0) or 0
            wind_twh = emix.get("wind_TWh", 0) or 0

            # Fraction-based features (all 0-1 range)
            features["country_fossil_frac"] = fossil_twh / total_twh
            features["country_clean_frac"] = (renewables_twh + nuclear_twh) / total_twh
            features["country_coal_frac"] = coal_twh / total_twh
            features["country_gas_frac"] = gas_twh / total_twh
            features["country_nuclear_frac"] = nuclear_twh / total_twh
            features["country_renew_frac"] = renewables_twh / total_twh
            features["country_hydro_frac"] = hydro_twh / total_twh
            features["country_solar_frac"] = solar_twh / total_twh
            features["country_wind_frac"] = wind_twh / total_twh
        else:
            features["country_ci"] = np.nan
            features["country_fossil_frac"] = np.nan
            features["country_clean_frac"] = np.nan
            features["country_coal_frac"] = np.nan
            features["country_gas_frac"] = np.nan
            features["country_nuclear_frac"] = np.nan
            features["country_renew_frac"] = np.nan
            features["country_hydro_frac"] = np.nan
            features["country_solar_frac"] = np.nan
            features["country_wind_frac"] = np.nan

        # Feature: Local power plants (300km)
        ind = pp_tree.query_radius(target_rad, r=radius_rad)
        local_pp = pp.iloc[ind[0]] if len(ind[0]) > 0 else pd.DataFrame()
        features["n_plants_300km"] = len(local_pp)

        if len(local_pp) > 0:
            features["total_emissions_300km"] = local_pp['emissions_quantity'].sum()
            features["mean_emissions_per_plant"] = local_pp['emissions_quantity'].mean()
            features["total_capacity_300km"] = local_pp['capacity'].fillna(0).sum()
            features["emissions_per_capacity"] = (
                features["total_emissions_300km"] / max(1, features["total_capacity_300km"])
            )

            # Fuel mix within 300km
            fuel_counts = local_pp['source_type'].apply(classify_fuel).value_counts()
            total_plants = len(local_pp)

            # Count nearby WRI renewable plants
            wri_ind = wri_tree.query_radius(target_rad, r=radius_rad)
            n_renew_nearby = len(wri_ind[0])
            renew_cap_nearby = float(wri_caps[wri_ind[0]].sum()) if n_renew_nearby > 0 else 0.0
            n_total = total_plants + n_renew_nearby

            features["local_pct_coal"] = fuel_counts.get('coal', 0) / n_total
            features["local_pct_gas"] = fuel_counts.get('natural_gas', 0) / n_total
            features["local_pct_solar"] = fuel_counts.get('solar', 0) / n_total
            features["local_pct_wind"] = fuel_counts.get('wind', 0) / n_total
            features["local_pct_hydro"] = fuel_counts.get('hydroelectricity', 0) / n_total
            features["local_pct_nuclear"] = fuel_counts.get('nuclear', 0) / n_total
            features["local_pct_fossil"] = (
                features["local_pct_coal"] + features["local_pct_gas"] +
                fuel_counts.get('petroleum', 0) / n_total
            )
            features["local_pct_clean"] = max(0.0, 1.0 - features["local_pct_fossil"])
            features["n_renew_nearby"] = n_renew_nearby
            features["renew_cap_nearby_mw"] = renew_cap_nearby

            # ── NEW: Generation-weighted emission factor (best local CI proxy) ──
            # local_ef_weighted = Σ(EF_i × MWh_i) / Σ(MWh_i) within 300km
            valid_ef = local_pp[local_pp['emissions_factor'].notna() & local_pp['activity'].notna()]
            valid_ef = valid_ef[valid_ef['activity'] > 0]
            if len(valid_ef) > 0:
                total_gen = valid_ef['activity'].sum()
                features["local_ef_weighted"] = (
                    (valid_ef['emissions_factor'] * valid_ef['activity']).sum() / total_gen
                ) * 1000.0  # convert t/MWh → gCO₂/kWh (≈ kg/MWh → g/kWh)
                features["local_generation_gwh"] = total_gen / 1000.0  # MWh → GWh
            else:
                features["local_ef_weighted"] = np.nan
                features["local_generation_gwh"] = np.nan

            # ── NEW: Average capacity factor of nearby plants ──
            valid_cf = local_pp['other5'].dropna()
            valid_cf = valid_cf[valid_cf > 0]
            if len(valid_cf) > 0:
                features["local_mean_cf"] = float(valid_cf.mean())
            else:
                features["local_mean_cf"] = np.nan

            # IDW-weighted carbon intensity — include both fossil (CT) and renewable (WRI)
            world_avg = fuel_weights.get("world_average", 475)
            total_weight = 0
            weighted_ci = 0
            for _, plant in local_pp.iterrows():
                d = math.sqrt((math.radians(plant['lat']) - target_rad[0][0])**2 +
                              (math.radians(plant['lon']) - target_rad[0][1])**2)
                dist_km = max(d * 6371, 1)
                cap_mw = plant['capacity'] if pd.notna(plant['capacity']) and plant['capacity'] > 0 else 1.0
                w = cap_mw / (dist_km ** 2)
                total_weight += w
                fuel_cat = classify_fuel(plant['source_type'])
                weighted_ci += w * fuel_weights.get(fuel_cat, world_avg)
            # Add renewable plants to IDW
            if n_renew_nearby > 0:
                rn_lats = np.radians(wri_clean.iloc[wri_ind[0]]['latitude'].values)
                rn_lons = np.radians(wri_clean.iloc[wri_ind[0]]['longitude'].values)
                rn_caps_loc = wri_caps[wri_ind[0]]
                rn_ci_loc = wri_fuel_ci[wri_ind[0]]
                for k in range(n_renew_nearby):
                    d_rn = math.sqrt((rn_lats[k] - target_rad[0][0])**2 + (rn_lons[k] - target_rad[0][1])**2)
                    dk_rn = max(d_rn * 6371, 1)
                    w_rn = rn_caps_loc[k] / (dk_rn ** 2)
                    total_weight += w_rn
                    weighted_ci += w_rn * rn_ci_loc[k]
            features["idw_weighted_ci"] = weighted_ci / total_weight if total_weight > 0 else np.nan

            # Also factor renewable capacity into emissions_per_capacity
            total_cap = features.get("total_capacity_300km", 0) + renew_cap_nearby
            if total_cap > 0:
                features["emissions_per_capacity"] = features["total_emissions_300km"] / total_cap
        else:
            for col in ['total_emissions_300km', 'mean_emissions_per_plant', 'total_capacity_300km',
                        'emissions_per_capacity', 'local_pct_coal', 'local_pct_gas',
                        'local_pct_solar', 'local_pct_wind', 'local_pct_hydro',
                        'local_pct_nuclear', 'local_pct_fossil', 'local_pct_clean',
                        'local_ef_weighted', 'local_generation_gwh', 'local_mean_cf',
                        'idw_weighted_ci']:
                features[col] = np.nan

        # Feature: Fossil operations nearby
        if fossil_tree is not None:
            ind_f = fossil_tree.query_radius(target_rad, r=radius_rad)
            local_fossil = fossil_df.iloc[ind_f[0]] if len(ind_f[0]) > 0 else pd.DataFrame()
            features["n_fossil_ops_300km"] = len(local_fossil)
            features["fossil_emissions_300km"] = local_fossil['emissions_quantity'].sum() if len(local_fossil) > 0 else 0
            if len(local_fossil) > 0:
                features["n_coal_mines"] = len(local_fossil[local_fossil['sector'] == 'coal'])
                features["n_refineries"] = len(local_fossil[local_fossil['sector'] == 'refining'])
                features["n_oilgas"] = len(local_fossil[local_fossil['sector'] == 'oil-gas'])
            else:
                features["n_coal_mines"] = 0
                features["n_refineries"] = 0
                features["n_oilgas"] = 0

        # Feature: DC density (competition/connectivity)
        if dc_tree is not None:
            dist_dc, _ = dc_tree.query(target_rad, k=1)
            features["nearest_dc_km"] = dist_dc[0][0] * 6371
            n_dc_nearby = len(dc_tree.query_radius(target_rad, r=radius_rad)[0])
            features["n_dcs_300km"] = n_dc_nearby

        # Feature: Non-linear country_ci² (captures extreme-end behaviour)
        if not np.isnan(ci_val):
            features["country_ci_sq"] = ci_val ** 2 / 1000.0  # scale down to avoid huge numbers
        else:
            features["country_ci_sq"] = np.nan

        # Feature: Normalized grid CI estimate from Climate TRACE
        # CT thermal EF × fossil_fraction ≈ grid-average CI
        fossil_frac = features.get("country_fossil_frac", np.nan)
        if len(local_pp) > 0 and not np.isnan(fossil_frac) and fossil_frac > 0:
            # Weighted-average thermal EF for nearby plants
            thermal_ef = features["total_emissions_300km"] / max(1, features.get("total_capacity_300km", 1))
            features["ct_grid_ci_est"] = thermal_ef * fossil_frac
        else:
            features["ct_grid_ci_est"] = np.nan

        # Feature: Nearest Electricity Maps zone CI
        if zone_tree is not None:
            dist_z, ind_z = zone_tree.query(target_rad, k=1)
            dist_z_km = dist_z[0][0] * 6371
            if dist_z_km < 500:  # only use if within 500 km
                features["emaps_zone_ci"] = float(zone_ci_values[ind_z[0][0]])
            else:
                features["emaps_zone_ci"] = np.nan
            # Also try IDW of top-3 nearest zones
            k_zones = min(3, len(zone_keys))
            dist_zk, ind_zk = zone_tree.query(target_rad, k=k_zones)
            w_total = 0.0
            w_ci = 0.0
            for di, ii in zip(dist_zk[0], ind_zk[0]):
                dk = max(di * 6371, 1.0)
                if dk > 1000:
                    continue
                w = 1.0 / dk ** 2
                w_total += w
                w_ci += w * zone_ci_values[ii]
            features["emaps_idw_ci"] = w_ci / w_total if w_total > 0 else np.nan

            # ── NEW: Zone-level installed capacity fractions ──
            nearest_idx = ind_z[0][0]
            if dist_z_km < 500 and np.isfinite(zone_clean_frac_arr[nearest_idx]):
                features["emaps_zone_clean_cap_frac"] = float(zone_clean_frac_arr[nearest_idx])
                features["emaps_zone_fossil_cap_frac"] = float(zone_fossil_frac_arr[nearest_idx])
                features["emaps_zone_coal_cap_mw"] = float(zone_coal_mw_arr[nearest_idx])
            else:
                features["emaps_zone_clean_cap_frac"] = np.nan
                features["emaps_zone_fossil_cap_frac"] = np.nan
                features["emaps_zone_coal_cap_mw"] = np.nan
        else:
            features["emaps_zone_ci"] = np.nan
            features["emaps_idw_ci"] = np.nan
            features["emaps_zone_clean_cap_frac"] = np.nan
            features["emaps_zone_fossil_cap_frac"] = np.nan
            features["emaps_zone_coal_cap_mw"] = np.nan

        cloud_features.append(features)

    print(f"    Matched {matched}/{len(cloud_df)} cloud regions to coordinates")

    if matched == 0:
        print("❌ No matches found. Check DC data format.")
        return

    # ── 7. Build feature matrix ──
    print("\n[7] Building feature matrix...")
    df = pd.DataFrame(cloud_features)
    print(f"    Shape: {df.shape}")
    print(f"    Features: {[c for c in df.columns if c not in ['region', 'provider', 'country_iso']]}")

    # ── 8. Correlation analysis ──
    print("\n" + "=" * 65)
    print("CORRELATION WITH GROUND TRUTH (carbon intensity gCO2/kWh)")
    print("=" * 65)

    numeric_cols = df.select_dtypes(include=[np.number]).columns
    numeric_cols = [c for c in numeric_cols if c != 'ground_truth_ci']

    correlations = {}
    for col in numeric_cols:
        valid = df[['ground_truth_ci', col]].dropna()
        if len(valid) >= 5:
            # Skip constant columns
            if valid[col].std() == 0 or valid['ground_truth_ci'].std() == 0:
                continue
            corr = valid['ground_truth_ci'].corr(valid[col])
            if not math.isnan(corr):
                correlations[col] = corr

    sorted_corr = sorted(correlations.items(), key=lambda x: abs(x[1]), reverse=True)

    print(f"\n  {len(correlations)} features with valid correlations (out of {len(numeric_cols)} numeric)")
    print(f"\n{'Feature':<35} {'Correlation':>12}  {'Strength':>10}")
    print("-" * 65)
    for feature, corr in sorted_corr:
        strength = "🟢 STRONG" if abs(corr) > 0.7 else "🟡 MODERATE" if abs(corr) > 0.4 else "⚪ WEAK"
        bar_len = max(0, int(abs(corr) * 20))
        bar = "█" * bar_len
        sign = "+" if corr > 0 else "-"
        print(f"  {feature:<33} {sign}{abs(corr):>10.3f}  {strength}  {bar}")

    # ── 9. Top features ──
    print("\n" + "=" * 65)
    print("RECOMMENDED FEATURES FOR REGRESSION MODEL")
    print("=" * 65)
    strong = [(f, c) for f, c in sorted_corr if abs(c) > 0.4]
    moderate = [(f, c) for f, c in sorted_corr if 0.2 < abs(c) <= 0.4]
    print(f"\n  Strong (|r| > 0.4): {len(strong)}")
    for f, c in strong:
        direction = "↑ more = dirtier" if c > 0 else "↓ more = cleaner"
        print(f"    ✅ {f}: r={c:+.3f}  ({direction})")
    print(f"\n  Moderate (0.2 < |r| ≤ 0.4): {len(moderate)}")
    for f, c in moderate:
        direction = "↑ more = dirtier" if c > 0 else "↓ more = cleaner"
        print(f"    🔶 {f}: r={c:+.3f}  ({direction})")

    # ── 10. Quick validation: predicted vs actual ──
    print("\n" + "=" * 65)
    print("PREDICTION vs GROUND TRUTH (using country_ci)")
    print("=" * 65)
    if 'country_ci' in df.columns:
        valid = df[['region', 'ground_truth_ci', 'country_ci']].dropna()
        valid['error'] = valid['country_ci'] - valid['ground_truth_ci']
        valid['abs_error'] = valid['error'].abs()
        valid['pct_error'] = (valid['abs_error'] / valid['ground_truth_ci'] * 100)

        print(f"\n  MAE  (Mean Absolute Error):  {valid['abs_error'].mean():.1f} gCO2/kWh")
        print(f"  RMSE (Root Mean Sq Error):   {math.sqrt((valid['error']**2).mean()):.1f} gCO2/kWh")
        print(f"  MAPE (Mean Abs % Error):     {valid['pct_error'].mean():.1f}%")
        print(f"  R²:                          {valid['ground_truth_ci'].corr(valid['country_ci'])**2:.3f}")

        print(f"\n  {'Region':<30} {'Actual':>8} {'Predicted':>10} {'Error':>8}")
        print("  " + "-" * 58)
        for _, r in valid.sort_values('abs_error', ascending=False).head(10).iterrows():
            print(f"  {r['region']:<30} {r['ground_truth_ci']:>8.0f} {r['country_ci']:>10.1f} {r['error']:>+8.1f}")

    # ── 11. Save features to CSV for further analysis ──
    out_path = "feature_analysis.csv"
    df.to_csv(out_path, index=False)
    print(f"\n✅ Full feature matrix saved to {out_path}")
    print("   Use this for regression model training!")


if __name__ == "__main__":
    main()
