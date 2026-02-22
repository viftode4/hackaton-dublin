#!/usr/bin/env python3
"""
Export all data center and power plant locations used by GridSync
to GeoJSON format for visualization and sharing.

Outputs:
  - data_centers.geojson   (hyperscaler data centers from Electricity Maps)
  - power_plants.geojson   (emitting power plants from Climate TRACE v5.3)

GeoJSON is rendered natively by GitHub, QGIS, Mapbox, kepler.gl, etc.
"""

import json, os, sys

# ── Paths (same as geo_estimator.py) ─────────────────────────────────
BASE = os.path.dirname(os.path.abspath(__file__))
DATA_CENTERS_PATH = os.path.join(BASE, "../electricitymaps-contrib/config/data_centers/data_centers.json")
CLIMATE_TRACE_POWER = os.path.join(BASE, "../datasets_tracer/power/DATA/electricity-generation_emissions_sources_v5_3_0.csv")


def export_data_centers(out_path="data_centers.geojson"):
    """Export data center locations to GeoJSON."""
    with open(DATA_CENTERS_PATH) as f:
        dc_raw = json.load(f)

    features = []
    for key, data in dc_raw.items():
        if "lonlat" not in data:
            continue
        lon, lat = data["lonlat"]
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "id": key,
                "provider": data.get("provider", "unknown"),
                "zoneKey": data.get("zoneKey", "unknown"),
                "name": data.get("name", key),
            }
        })

    geojson = {
        "type": "FeatureCollection",
        "name": "GridSync – Data Centers (Electricity Maps)",
        "features": features,
    }
    out = os.path.join(BASE, out_path)
    with open(out, "w") as f:
        json.dump(geojson, f, indent=2)
    print(f"✅ Exported {len(features)} data centers → {out}")
    return len(features)


def export_power_plants(out_path="power_plants.geojson"):
    """Export power plant locations to GeoJSON (latest year only)."""
    import pandas as pd

    df = pd.read_csv(CLIMATE_TRACE_POWER)
    df["year"] = pd.to_datetime(df["start_time"]).dt.year

    # Use latest full year (exclude 2025 — incomplete)
    years = sorted(df["year"].dropna().unique())
    latest = [y for y in years if y <= 2024][-1]
    latest_df = df[df["year"] == latest]

    # Group by plant (same logic as geo_estimator.py)
    plants = latest_df.groupby("source_name", as_index=False).agg({
        "source_type": "first",
        "iso3_country": "first",
        "lat": "first",
        "lon": "first",
        "emissions_quantity": "sum",    # tonnes CO₂e
        "capacity": "first",           # MW
        "emissions_factor": "mean",     # t CO₂e/MWh
        "activity": "sum",             # MWh generated
    })

    features = []
    for _, row in plants.iterrows():
        # Skip rows with missing coordinates
        if pd.isna(row["lat"]) or pd.isna(row["lon"]):
            continue
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [round(float(row["lon"]), 5),
                                round(float(row["lat"]), 5)],
            },
            "properties": {
                "name": row["source_name"],
                "fuel_type": row["source_type"],
                "country": row["iso3_country"],
                "emissions_tCO2e": round(float(row["emissions_quantity"]), 1),
                "capacity_MW": round(float(row["capacity"]), 1) if pd.notna(row["capacity"]) else None,
                "emissions_factor_tCO2e_per_MWh": round(float(row["emissions_factor"]), 4) if pd.notna(row["emissions_factor"]) else None,
                "generation_MWh": round(float(row["activity"]), 1) if pd.notna(row["activity"]) else None,
                "year": int(latest),
            }
        })

    geojson = {
        "type": "FeatureCollection",
        "name": f"GridSync – Power Plants (Climate TRACE v5.3, {int(latest)})",
        "features": features,
    }
    out = os.path.join(BASE, out_path)
    with open(out, "w") as f:
        json.dump(geojson, f, indent=2)
    print(f"✅ Exported {len(features)} power plants → {out}")
    return len(features)


if __name__ == "__main__":
    print("=" * 60)
    print("GridSync Location Export")
    print("=" * 60)
    n_dc = export_data_centers()
    n_pp = export_power_plants()
    print(f"\nTotal: {n_dc} data centers + {n_pp} power plants")
