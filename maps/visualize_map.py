"""
GridSync Visualization: Global Emissions Heatmap + Data Center Overlay

Generates an interactive HTML map with:
  1. Heatmap layer of power plant emissions (Climate TRACE)
  2. Blue markers for the 165 hyperscaler data centers
  3. Color-coded plant markers by fuel type (click for details)

Run: python3 visualize_map.py
Output: gridsync_map.html (open in browser)

Requirements: pip install folium pandas numpy
"""

import json
import pandas as pd
import numpy as np
import folium
from folium.plugins import HeatMap, MarkerCluster

# --- Paths ---
DATA_CENTERS_PATH = "../electricitymaps-contrib/config/data_centers/data_centers.json"
CLIMATE_TRACE_PATH = "../datasets_tracer/power/DATA/electricity-generation_emissions_sources_v5_3_0.csv"
OUTPUT_HTML = "gridsync_map.html"

# --- Color scheme for fuel types ---
FUEL_COLORS = {
    "coal": "#1a1a1a",        # black
    "gas": "#e67e22",         # orange
    "oil": "#8b4513",         # brown
    "nuclear": "#9b59b6",     # purple
    "hydro": "#3498db",       # blue
    "solar": "#f1c40f",       # yellow
    "wind": "#2ecc71",        # green
    "biomass": "#27ae60",     # dark green
    "geothermal": "#e74c3c",  # red
}

def get_fuel_color(source_type: str) -> str:
    source_lower = str(source_type).lower()
    for key, color in FUEL_COLORS.items():
        if key in source_lower:
            return color
    return "#95a5a6"  # grey for unknown


def main():
    print("Loading data...")

    # --- 1. Load and deduplicate power plants (latest year only) ---
    cols = ['source_name', 'source_type', 'start_time', 'lat', 'lon',
            'emissions_quantity', 'capacity']
    raw = pd.read_csv(CLIMATE_TRACE_PATH, usecols=cols)
    raw = raw.dropna(subset=['lat', 'lon', 'emissions_quantity'])
    raw['year'] = pd.to_datetime(raw['start_time']).dt.year
    latest = raw['year'].max()
    raw = raw[raw['year'] == latest]

    plants = raw.groupby('source_name', as_index=False).agg({
        'source_type': 'first',
        'lat': 'first',
        'lon': 'first',
        'emissions_quantity': 'sum',
        'capacity': 'first',
    })
    print(f"  {len(plants)} unique plants (year {latest})")

    # --- 2. Load data centers ---
    with open(DATA_CENTERS_PATH) as f:
        dc_raw = json.load(f)
    dcs = []
    for key, d in dc_raw.items():
        if "lonlat" in d:
            lon, lat = d["lonlat"]
            dcs.append({
                "id": key,
                "provider": d.get("provider", "?"),
                "zoneKey": d.get("zoneKey", "?"),
                "lat": lat, "lon": lon,
            })
    print(f"  {len(dcs)} data centers")

    # --- 3. Build the map ---
    print("Building map...")
    m = folium.Map(location=[20, 0], zoom_start=3,
                   tiles="CartoDB dark_matter")

    # Layer 1: Heatmap of emissions intensity
    heat_data = []
    for _, row in plants.iterrows():
        weight = min(row['emissions_quantity'] / 1000.0, 500)  # cap for visual
        heat_data.append([row['lat'], row['lon'], weight])

    HeatMap(
        heat_data,
        name="Emissions Heatmap",
        radius=12, blur=15, max_zoom=8,
        gradient={0.2: '#2ecc71', 0.5: '#f39c12', 0.8: '#e74c3c', 1.0: '#c0392b'},
    ).add_to(m)

    # Layer 2: Individual power plant markers (clustered)
    plant_cluster = MarkerCluster(name="Power Plants (click to expand)")
    for _, row in plants.iterrows():
        color = get_fuel_color(row['source_type'])
        popup_html = (
            f"<b>{row['source_name']}</b><br>"
            f"Type: {row['source_type']}<br>"
            f"Capacity: {row['capacity']:.0f} MW<br>"
            f"Annual Emissions: {row['emissions_quantity']:,.0f} t CO₂e"
        )
        folium.CircleMarker(
            location=[row['lat'], row['lon']],
            radius=3,
            color=color,
            fill=True,
            fill_opacity=0.7,
            popup=folium.Popup(popup_html, max_width=250),
        ).add_to(plant_cluster)
    plant_cluster.add_to(m)

    # Layer 3: Data center markers (always visible, distinctive)
    dc_group = folium.FeatureGroup(name="☁️ Hyperscaler Data Centers")
    for dc in dcs:
        popup_html = (
            f"<b>{dc['id']}</b><br>"
            f"Provider: {dc['provider'].upper()}<br>"
            f"Zone: {dc['zoneKey']}"
        )
        folium.Marker(
            location=[dc['lat'], dc['lon']],
            popup=folium.Popup(popup_html, max_width=200),
            icon=folium.Icon(color='blue', icon='cloud', prefix='fa'),
        ).add_to(dc_group)
    dc_group.add_to(m)

    # Layer control toggle
    folium.LayerControl(collapsed=False).add_to(m)

    # Legend (injected as HTML)
    legend_html = """
    <div style="position:fixed; bottom:30px; left:30px; z-index:9999;
                background:rgba(0,0,0,0.85); padding:14px 18px; border-radius:8px;
                font-family:monospace; color:white; font-size:12px; line-height:1.8;">
        <b style="font-size:14px;">GridSync — Fuel Types</b><br>
        <span style="color:#1a1a1a;background:#1a1a1a;">██</span> Coal &nbsp;
        <span style="color:#e67e22;">██</span> Gas &nbsp;
        <span style="color:#8b4513;">██</span> Oil<br>
        <span style="color:#9b59b6;">██</span> Nuclear &nbsp;
        <span style="color:#3498db;">██</span> Hydro &nbsp;
        <span style="color:#f1c40f;">██</span> Solar<br>
        <span style="color:#2ecc71;">██</span> Wind &nbsp;
        <span style="color:#27ae60;">██</span> Biomass &nbsp;
        <span style="color:#e74c3c;">██</span> Geothermal<br>
        <hr style="border-color:#555;">
        <span style="color:#3498db;">📍</span> = Hyperscaler Data Center
    </div>
    """
    m.get_root().html.add_child(folium.Element(legend_html))

    # Save
    m.save(OUTPUT_HTML)
    print(f"\n✅ Map saved to {OUTPUT_HTML}")
    print(f"   Open in browser: file://{OUTPUT_HTML}")


if __name__ == "__main__":
    main()
