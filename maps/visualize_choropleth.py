"""
GridSync — Choropleth World Map with All Layers

Uses Plotly to render:
  1. Country fills colored by carbon intensity (CodeCarbon Layer 1)
  2. Power plant scatter points (Climate TRACE Layer 2)
  3. Data center markers (diamonds)
  4. UK live annotation (Layer 3)

Outputs: gridsync_choropleth.html (interactive) + gridsync_choropleth.png (static)

Run: python3 visualize_choropleth.py
Requirements: pip install plotly kaleido
"""

import json
import urllib.request
import pandas as pd
import numpy as np

try:
    import plotly.graph_objects as go
    from plotly.subplots import make_subplots
except ImportError:
    print("❌ Please install plotly: pip install plotly")
    exit(1)

# --- Paths ---
DATA_CENTERS_PATH = "../electricitymaps-contrib/config/data_centers/data_centers.json"
CLIMATE_TRACE_PATH = "../datasets_tracer/power/DATA/electricity-generation_emissions_sources_v5_3_0.csv"
CODECARBON_MIX_PATH = "../codecarbon/codecarbon/data/private_infra/global_energy_mix.json"
UK_CI_API = "https://api.carbonintensity.org.uk"


def main():
    print("Loading all data layers...")

    # === LAYER 1: CodeCarbon country intensities ===
    with open(CODECARBON_MIX_PATH) as f:
        cc = json.load(f)

    countries_iso3 = []
    countries_name = []
    countries_ci = []
    countries_total_twh = []
    for iso, data in cc.items():
        ci = data.get("carbon_intensity", 0)
        if ci is not None and ci >= 0:
            countries_iso3.append(iso)
            countries_name.append(data.get("country_name", iso))
            countries_ci.append(ci)
            countries_total_twh.append(data.get("total_TWh", 0))
    print(f"  Layer 1: {len(countries_iso3)} countries")

    # === LAYER 2: Climate TRACE power plants ===
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
    # Sample top emitters for performance (plotly SVG gets slow with many points)
    if len(plants) > 1000:
        plants_plot = plants.nlargest(5000, 'emissions_quantity')
    else:
        plants_plot = plants
    print(f"  Layer 2: {len(plants)} plants ({len(plants_plot)} plotted)")

    # === DATA CENTERS ===
    with open(DATA_CENTERS_PATH) as f:
        dc_raw = json.load(f)
    dc_lats, dc_lons, dc_names, dc_providers = [], [], [], []
    for key, d in dc_raw.items():
        if "lonlat" in d:
            lon, lat = d["lonlat"]
            dc_lats.append(lat)
            dc_lons.append(lon)
            dc_names.append(key)
            dc_providers.append(d.get("provider", "?").upper())
    print(f"  DCs: {len(dc_lats)}")

    # === LAYER 3: UK live ===
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

    # === BUILD PLOTLY FIGURE ===
    print("Building choropleth map...")

    fig = go.Figure()

    # --- Trace 1: Country choropleth (Layer 1) ---
    fig.add_trace(go.Choropleth(
        locations=countries_iso3,
        z=countries_ci,
        text=[f"{n}<br>{ci:.0f} gCO₂eq/kWh<br>{twh:.0f} TWh/yr"
              for n, ci, twh in zip(countries_name, countries_ci, countries_total_twh)],
        hoverinfo="text",
        colorscale=[
            [0.0, '#1a472a'],    # very clean (0)
            [0.15, '#2ecc71'],   # clean
            [0.3, '#f1c40f'],    # moderate
            [0.5, '#e67e22'],    # high
            [0.7, '#e74c3c'],    # very high
            [1.0, '#8b0000'],    # extreme
        ],
        zmin=0,
        zmax=900,
        colorbar=dict(
            title=dict(text="gCO₂eq/kWh<br>(CodeCarbon)", font=dict(color='white', size=12)),
            tickfont=dict(color='white'),
            x=1.02,
            len=0.6,
        ),
        marker_line_color='#333',
        marker_line_width=0.3,
        name="Layer 1: Country Carbon Intensity",
    ))

    # --- Trace 2: Power plants scatter (Layer 2) ---
    plant_sizes = np.clip(np.log1p(plants_plot['emissions_quantity']) * 1.5, 2, 15)
    fuel_colors = {
        'coal': '#ff4444', 'gas': '#ff8c00', 'oil': '#8b4513',
        'nuclear': '#9b59b6', 'hydro': '#3498db', 'solar': '#ffff00',
        'wind': '#00ff88', 'biomass': '#228b22', 'geothermal': '#ff6347'
    }

    def get_color(st):
        s = str(st).lower()
        for k, c in fuel_colors.items():
            if k in s:
                return c
        return '#888888'

    fig.add_trace(go.Scattergeo(
        lat=plants_plot['lat'],
        lon=plants_plot['lon'],
        text=[f"<b>{row['source_name']}</b><br>"
              f"Type: {row['source_type']}<br>"
              f"Capacity: {row['capacity']:.0f} MW<br>"
              f"Emissions: {row['emissions_quantity']:,.0f} t CO₂e/yr"
              for _, row in plants_plot.iterrows()],
        hoverinfo="text",
        marker=dict(
            size=plant_sizes,
            color=[get_color(st) for st in plants_plot['source_type']],
            opacity=0.6,
            line=dict(width=0),
        ),
        name="Layer 2: Power Plants (Climate TRACE)",
        showlegend=True,
    ))

    # --- Trace 3: Data centers ---
    fig.add_trace(go.Scattergeo(
        lat=dc_lats,
        lon=dc_lons,
        text=[f"<b>{n}</b><br>Provider: {p}" for n, p in zip(dc_names, dc_providers)],
        hoverinfo="text",
        marker=dict(
            size=8,
            color='#00d4ff',
            symbol='diamond',
            line=dict(width=1, color='white'),
        ),
        name="Data Centers (147)",
        showlegend=True,
    ))

    # --- Trace 4: UK live marker ---
    if uk_ci:
        fig.add_trace(go.Scattergeo(
            lat=[54.5],
            lon=[-2.0],
            text=[f"<b>UK LIVE</b><br>{uk_ci} gCO₂/kWh<br>(Real-Time API)"],
            hoverinfo="text",
            marker=dict(
                size=18,
                color='#2ecc71',
                symbol='star',
                line=dict(width=2, color='white'),
            ),
            name=f"Layer 3: UK Live ({uk_ci} gCO₂/kWh)",
            showlegend=True,
        ))

    # --- Layout ---
    fig.update_layout(
        title=dict(
            text="GridSync Hybrid Carbon Engine — Global Carbon Intensity Map",
            font=dict(size=20, color='white'),
            x=0.5,
        ),
        geo=dict(
            showframe=False,
            showcoastlines=True,
            coastlinecolor='#555',
            showland=True,
            landcolor='#1a1a2e',
            showocean=True,
            oceancolor='#0d1117',
            showlakes=True,
            lakecolor='#0d1117',
            showcountries=True,
            countrycolor='#333',
            projection_type='natural earth',
            bgcolor='#0d1117',
            lataxis=dict(range=[-60, 80]),
            lonaxis=dict(range=[-170, 180]),
        ),
        paper_bgcolor='#0d1117',
        plot_bgcolor='#0d1117',
        legend=dict(
            x=0.01, y=0.01,
            bgcolor='rgba(22, 33, 62, 0.9)',
            bordercolor='#444',
            borderwidth=1,
            font=dict(color='white', size=11),
        ),
        margin=dict(l=0, r=0, t=50, b=0),
        height=700,
        width=1300,
    )

    # Save as interactive HTML with performance config
    config = {
        'scrollZoom': True,
        'displayModeBar': True,
        'modeBarButtonsToRemove': ['lasso2d', 'select2d'],
    }
    fig.write_html("gridsync_choropleth.html", config=config)
    print("✅ Saved gridsync_choropleth.html")

    # Try to save as PNG (requires kaleido)
    try:
        fig.write_image("gridsync_choropleth.png", scale=2)
        print("✅ Saved gridsync_choropleth.png")
    except Exception as e:
        print(f"ℹ️  PNG export skipped (install kaleido for PNG: pip install kaleido)")

    print("\nDone! Open gridsync_choropleth.html in your browser.")


if __name__ == "__main__":
    main()
