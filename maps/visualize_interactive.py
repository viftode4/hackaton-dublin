"""
GridSync — Interactive Choropleth + Clustered Power Plants

Uses Folium (Leaflet.js) for:
  - Country choropleth fill (CodeCarbon carbon intensity)
  - MarkerCluster for ALL 11,589 power plants (auto-clusters at zoom-out)
  - Data center markers (always visible)
  - UK live carbon intensity badge

The MarkerCluster gives the "Google Maps" effect: dots cluster into
numbered circles when zoomed out and expand into individual plants
when you zoom in.

Run: python3 visualize_interactive.py
Output: gridsync_interactive.html (open in browser)
"""

import json
import urllib.request
import pandas as pd
import numpy as np
import folium
from folium.plugins import HeatMap, MarkerCluster, FastMarkerCluster

# --- Paths ---
DATA_CENTERS_PATH = "../electricitymaps-contrib/config/data_centers/data_centers.json"
CLIMATE_TRACE_PATH = "../datasets_tracer/power/DATA/electricity-generation_emissions_sources_v5_3_0.csv"
CODECARBON_MIX_PATH = "../codecarbon/codecarbon/data/private_infra/global_energy_mix.json"
UK_CI_API = "https://api.carbonintensity.org.uk"

# GeoJSON for country boundaries (Natural Earth via GitHub CDN)
COUNTRIES_GEOJSON_URL = "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"

FUEL_COLORS = {
    "coal": "#e74c3c", "gas": "#e67e22", "oil": "#8b4513",
    "nuclear": "#9b59b6", "hydro": "#3498db", "solar": "#f1c40f",
    "wind": "#2ecc71", "biomass": "#27ae60", "geothermal": "#c0392b",
}

def fuel_color(st):
    s = str(st).lower()
    for k, c in FUEL_COLORS.items():
        if k in s:
            return c
    return "#999"


def main():
    print("Loading all data layers...")

    # Layer 1: CodeCarbon
    with open(CODECARBON_MIX_PATH) as f:
        cc = json.load(f)
    # Build ISO3 -> carbon_intensity lookup
    ci_lookup = {}
    for iso, data in cc.items():
        ci = data.get("carbon_intensity")
        if ci is not None:
            ci_lookup[iso] = ci
    print(f"  Layer 1: {len(ci_lookup)} countries")

    # Layer 2: Climate TRACE
    cols = ['source_name', 'source_type', 'start_time',
            'lat', 'lon', 'emissions_quantity', 'capacity']
    raw = pd.read_csv(CLIMATE_TRACE_PATH, usecols=cols)
    raw = raw.dropna(subset=['lat', 'lon', 'emissions_quantity'])
    raw['year'] = pd.to_datetime(raw['start_time']).dt.year
    latest = raw['year'].max()
    raw = raw[raw['year'] == latest]
    plants = raw.groupby('source_name', as_index=False).agg({
        'source_type': 'first',
        'lat': 'first', 'lon': 'first',
        'emissions_quantity': 'sum', 'capacity': 'first',
    })
    print(f"  Layer 2: {len(plants)} plants (ALL will be plotted)")

    # Data Centers
    with open(DATA_CENTERS_PATH) as f:
        dc_raw = json.load(f)
    dcs = []
    for key, d in dc_raw.items():
        if "lonlat" in d:
            lon, lat = d["lonlat"]
            dcs.append({"id": key, "provider": d.get("provider","?"),
                        "zone": d.get("zoneKey","?"), "lat": lat, "lon": lon})
    print(f"  DCs: {len(dcs)}")

    # Layer 3: UK live
    uk_ci = None
    try:
        req = urllib.request.Request(f"{UK_CI_API}/intensity",
                                     headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            uk_ci = data["data"][0]["intensity"].get("actual") or \
                    data["data"][0]["intensity"].get("forecast")
        print(f"  Layer 3: UK live = {uk_ci} gCO2/kWh")
    except Exception:
        print("  Layer 3: UK API unavailable")

    # Download country boundaries GeoJSON
    print("  Downloading country boundaries...")
    try:
        req = urllib.request.Request(COUNTRIES_GEOJSON_URL)
        with urllib.request.urlopen(req, timeout=30) as resp:
            countries_geojson = json.loads(resp.read())
        print(f"  {len(countries_geojson['features'])} country polygons loaded")
    except Exception as e:
        print(f"  Warning: Could not download GeoJSON ({e}), skipping choropleth fill")
        countries_geojson = None

    # === BUILD THE MAP ===
    print("Building interactive map...")
    m = folium.Map(location=[20, 0], zoom_start=3, tiles="CartoDB dark_matter")

    # --- Layer 1: Country choropleth fill ---
    if countries_geojson:
        # Map GeoJSON ISO_A3 property to our carbon intensity data
        for feature in countries_geojson['features']:
            props = feature.get('properties', {})
            iso3 = props.get('ISO3166-1-Alpha-3', '')
            ci = ci_lookup.get(iso3, None)
            props['carbon_intensity'] = ci if ci else 0

        choropleth = folium.Choropleth(
            geo_data=countries_geojson,
            data=pd.DataFrame([
                {"iso3": iso, "ci": val} for iso, val in ci_lookup.items()
            ]),
            columns=["iso3", "ci"],
            key_on="feature.properties.ISO3166-1-Alpha-3",
            fill_color="RdYlGn_r",
            fill_opacity=0.65,
            line_opacity=0.3,
            line_weight=0.5,
            nan_fill_color="#1a1a2e",
            legend_name="Carbon Intensity (gCO2eq/kWh) — CodeCarbon",
            name="Layer 1: Country Carbon Intensity",
            threshold_scale=[0, 50, 100, 200, 300, 400, 550, 700, 900, 1200],
        ).add_to(m)

        # Add tooltips to choropleth
        folium.GeoJsonTooltip(
            fields=['name', 'carbon_intensity'],
            aliases=['Country:', 'gCO2eq/kWh:'],
            style="background-color: rgba(0,0,0,0.8); color: white; padding: 6px;"
        ).add_to(choropleth.geojson)

    # --- Layer 2: Power plants with FastMarkerCluster ---
    # FastMarkerCluster uses canvas rendering — handles 11k+ points smoothly
    callback = """
    function (row) {
        var color = row[3];
        var marker = L.circleMarker(
            new L.LatLng(row[0], row[1]), {
                radius: 3,
                color: color,
                fillColor: color,
                fillOpacity: 0.7,
                weight: 0.5
            }
        );
        marker.bindPopup(row[2]);
        return marker;
    }
    """

    plant_data = []
    for _, row in plants.iterrows():
        popup = (f"<b>{row['source_name']}</b><br>"
                 f"Type: {row['source_type']}<br>"
                 f"Capacity: {row['capacity']:.0f} MW<br>"
                 f"Emissions: {row['emissions_quantity']:,.0f} t CO2e/yr")
        color = fuel_color(row['source_type'])
        plant_data.append([row['lat'], row['lon'], popup, color])

    FastMarkerCluster(
        data=plant_data,
        callback=callback,
        name="Layer 2: Power Plants (Climate TRACE)",
    ).add_to(m)

    # --- Data Centers (always visible, no clustering) ---
    dc_group = folium.FeatureGroup(name="Data Centers (147)")
    for dc in dcs:
        popup = (f"<b>{dc['id']}</b><br>"
                 f"Provider: {dc['provider'].upper()}<br>"
                 f"Zone: {dc['zone']}")
        folium.Marker(
            location=[dc['lat'], dc['lon']],
            popup=folium.Popup(popup, max_width=220),
            icon=folium.Icon(color='blue', icon='cloud', prefix='fa'),
        ).add_to(dc_group)
    dc_group.add_to(m)

    # --- Layer 3: UK live badge ---
    if uk_ci:
        folium.Marker(
            location=[54.5, -2.0],
            popup=f"<b>UK LIVE</b><br>{uk_ci} gCO2/kWh<br>(Real-Time API)",
            icon=folium.DivIcon(html=f"""
                <div style="background:#2ecc71; color:white; padding:4px 8px;
                     border-radius:12px; font-weight:bold; font-size:11px;
                     white-space:nowrap; border:2px solid white;
                     box-shadow: 0 2px 8px rgba(0,0,0,0.5);">
                    UK LIVE: {uk_ci} gCO2/kWh
                </div>
            """),
        ).add_to(m)

    # --- Layer toggle ---
    folium.LayerControl(collapsed=False).add_to(m)

    # --- Legend ---
    legend = """
    <div style="position:fixed; bottom:30px; left:30px; z-index:9999;
                background:rgba(0,0,0,0.88); padding:14px 18px; border-radius:10px;
                font-family:system-ui; color:white; font-size:11px; line-height:2;
                box-shadow: 0 4px 16px rgba(0,0,0,0.5);">
        <b style="font-size:13px;">GridSync — Fuel Types</b><br>
        <span style="color:#e74c3c;">&#9679;</span> Coal &nbsp;
        <span style="color:#e67e22;">&#9679;</span> Gas &nbsp;
        <span style="color:#8b4513;">&#9679;</span> Oil<br>
        <span style="color:#9b59b6;">&#9679;</span> Nuclear &nbsp;
        <span style="color:#3498db;">&#9679;</span> Hydro &nbsp;
        <span style="color:#f1c40f;">&#9679;</span> Solar<br>
        <span style="color:#2ecc71;">&#9679;</span> Wind &nbsp;
        <span style="color:#27ae60;">&#9679;</span> Biomass &nbsp;
        <span style="color:#c0392b;">&#9679;</span> Geothermal<br>
        <hr style="border-color:#444; margin:4px 0;">
        <span style="color:#3498db;">&#9670;</span> Hyperscaler DC &nbsp;
        <span style="color:#2ecc71;">&#9733;</span> UK Live
    </div>
    """
    m.get_root().html.add_child(folium.Element(legend))

    # Save
    m.save("gridsync_interactive.html")
    print(f"\n✅ Saved gridsync_interactive.html")
    print("   Open in your browser (Firefox recommended for best performance)")


if __name__ == "__main__":
    main()
