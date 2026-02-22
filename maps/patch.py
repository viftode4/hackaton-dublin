import re
with open("geo_estimator.py", "r") as f:
    code = f.read()

# Replace compute_green_score
new_func = r'''def compute_green_score(lat: float, lon: float, radius_km: float = 300.0) -> dict:
    """
    Data-driven regression engine (Phase 5).
    Replaces IDW and arbitrary fossil penalties with a trained Ridge model.
    """
    import reverse_geocoder as rg
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

    try:
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

    base_ci = np.nan
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

    if math.isnan(base_ci):
        base_ci = world_avg

    local_fuel_mix = {}
    renewable_capacity_mw = 0.0
    fossil_capacity_mw = 0.0
    plants_in_radius = 0
    emissions_per_capacity = 0.0
    local_pct_coal = 0.0

    if POWER_TREE is not None:
        ind = POWER_TREE.query_radius(target_rad, r=radius_rad)
        if len(ind[0]) > 0:
            local_plants = POWER_PLANTS_DF.iloc[ind[0]]
            plants_in_radius = len(local_plants)
            
            t_cap = local_plants['capacity'].fillna(0).sum()
            t_emi = local_plants['emissions_quantity'].sum()
            if t_cap > 0:
                emissions_per_capacity = t_emi / t_cap
                
            fuel_counts = local_plants['source_type'].apply(classify_fuel).value_counts()
            local_pct_coal = fuel_counts.get('coal', 0) / plants_in_radius
            
            for _, plant in local_plants.iterrows():
                fuel_cat = classify_fuel(plant['source_type'])
                cap = plant.get('capacity', 0) or 0
                if fuel_cat in ['solar', 'wind', 'hydroelectricity', 'nuclear', 'geothermal']:
                    renewable_capacity_mw += cap
                else:
                    fossil_capacity_mw += cap
                local_fuel_mix[fuel_cat] = local_fuel_mix.get(fuel_cat, 0) + cap

    predicted_ci = base_ci
    if REGRESSION_MODEL:
        feats_dict = {
            "country_ci": base_ci,
            "emissions_per_capacity": emissions_per_capacity,
            "local_pct_coal": local_pct_coal,
        }
        x = [feats_dict.get(f, 0.0) for f in REGRESSION_MODEL["features"]]
        x_scaled = (np.array(x) - np.array(REGRESSION_MODEL["scaler_mean"])) / np.array(REGRESSION_MODEL["scaler_scale"])
        predicted_ci = float(np.dot(np.array(REGRESSION_MODEL["coefficients"]), x_scaled) + REGRESSION_MODEL["intercept"])
    
    final_ci = max(0.0, predicted_ci)

    live_override_applied = False
    live_details = None
    if country_iso3 == "GBR":
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
'''

pattern = r'def compute_green_score.*?return \{.*?\n    \}'
code = re.sub(pattern, new_func, code, flags=re.DOTALL)

with open("geo_estimator.py", "w") as f:
    f.write(code)
print("Updated geo_estimator.py!")
