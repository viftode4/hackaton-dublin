"""
GridSync — True Green Score Heatmap

Discretizes the world into a grid and computes a Green Score
for every point, then renders it as a real heat overlay on the map.

Imports the scoring engine directly (no API needed).

Run: python3 visualize_heatmap.py    (geo_estimator.py does NOT need to be running)
Output: gridsync_mvp.html
"""

import json
import sys
import time
import urllib.request

import numpy as np
import folium
from folium.plugins import HeatMap

# ── Load the engine directly ──
import geo_estimator as engine

COUNTRIES_GEOJSON_URL = "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
CODECARBON_MIX_PATH = "../codecarbon/codecarbon/data/private_infra/global_energy_mix.json"

# Key cities to label on the map
LABEL_CITIES = [
    {"name": "Dublin", "lat": 53.35, "lon": -6.26},
    {"name": "London", "lat": 51.50, "lon": -0.12},
    {"name": "Paris", "lat": 48.86, "lon": 2.35},
    {"name": "Berlin", "lat": 52.52, "lon": 13.40},
    {"name": "Stockholm", "lat": 59.33, "lon": 18.07},
    {"name": "Oslo", "lat": 59.91, "lon": 10.75},
    {"name": "Madrid", "lat": 40.42, "lon": -3.70},
    {"name": "Warsaw", "lat": 52.23, "lon": 21.01},
    {"name": "Reykjavik", "lat": 64.13, "lon": -21.90},
    {"name": "New York", "lat": 40.71, "lon": -74.01},
    {"name": "San Francisco", "lat": 37.77, "lon": -122.42},
    {"name": "Montreal", "lat": 45.50, "lon": -73.57},
    {"name": "São Paulo", "lat": -23.55, "lon": -46.64},
    {"name": "Tokyo", "lat": 35.68, "lon": 139.69},
    {"name": "Singapore", "lat": 1.35, "lon": 103.82},
    {"name": "Mumbai", "lat": 19.08, "lon": 72.88},
    {"name": "Beijing", "lat": 39.90, "lon": 116.40},
    {"name": "Cape Town", "lat": -33.93, "lon": 18.42},
    {"name": "Nairobi", "lat": -1.29, "lon": 36.82},
    {"name": "Sydney", "lat": -33.87, "lon": 151.21},
    {"name": "Santiago", "lat": -33.45, "lon": -70.67},
    {"name": "Dubai", "lat": 25.20, "lon": 55.27},
    {"name": "Auckland", "lat": -36.85, "lon": 174.76},
    {"name": "Cairo", "lat": 30.04, "lon": 31.24},
]


def score_to_color(score):
    if score >= 80: return "#00c853"
    if score >= 65: return "#64dd17"
    if score >= 50: return "#ffd600"
    if score >= 35: return "#ff9100"
    if score >= 20: return "#ff3d00"
    return "#d50000"


def main():
    print("GridSync — True Green Score Heatmap")
    print("=" * 55)

    # ── Step 1: Build the grid ──
    # 4° spacing ≈ ~445km — gives 2,430 land points
    step = 4
    lats = np.arange(-56, 72, step)
    lons = np.arange(-180, 180, step)
    grid_points = [(lat, lon) for lat in lats for lon in lons]
    print(f"Grid: {len(lats)} lat × {len(lons)} lon = {len(grid_points)} points (every {step}°)")

    # ── Step 2: Compute Green Score for every grid point ──
    print("Computing Green Scores (this takes ~1-2 min)...")
    heatmap_data = []   # [lat, lon, intensity] for Folium HeatMap
    all_results = []
    t0 = time.time()

    for i, (lat, lon) in enumerate(grid_points):
        if (i + 1) % 200 == 0:
            elapsed = time.time() - t0
            pct = (i + 1) / len(grid_points) * 100
            print(f"  {pct:.0f}% ({i+1}/{len(grid_points)}) — {elapsed:.1f}s")

        result = engine.compute_green_score(lat, lon, radius_km=250)
        score = result["green_score"]

        # For HeatMap: invert score so RED = bad (high heat), GREEN = good (low heat)
        # HeatMap shows "intensity" where higher = hotter color
        # So we use (100 - score) as intensity: bad areas glow hot
        intensity = 100 - score
        heatmap_data.append([lat, lon, intensity])
        all_results.append(result)

    elapsed = time.time() - t0
    print(f"  ✅ Done in {elapsed:.1f}s ({len(grid_points) / elapsed:.0f} points/sec)")

    # Stats
    scores = [r["green_score"] for r in all_results]
    print(f"  Score range: {min(scores):.1f} to {max(scores):.1f}")
    print(f"  Mean: {np.mean(scores):.1f},  Median: {np.median(scores):.1f}")

    # ── Step 3: Evaluate labeled cities ──
    print(f"\nEvaluating {len(LABEL_CITIES)} key cities...")
    city_results = []
    for city in LABEL_CITIES:
        r = engine.compute_green_score(city["lat"], city["lon"])
        r["city_name"] = city["name"]
        r["lat"] = city["lat"]
        r["lon"] = city["lon"]
        city_results.append(r)
        proj = r.get("projection", {})
        trend = "📉" if proj.get("emission_trend") == "improving" else "📈" if proj.get("emission_trend") == "worsening" else "➡️"
        print(f"  {city['name']:18s}  {r['green_score']:5.1f} ({r['grade']})  "
              f"{r.get('country','?'):20s}  {trend} 2030: {proj.get('score_2030', '?')}")

    city_results.sort(key=lambda x: x["green_score"], reverse=True)
    print(f"\n🏆 Best: {city_results[0]['city_name']} ({city_results[0]['green_score']}, {city_results[0]['grade']})")
    print(f"⚠️  Worst: {city_results[-1]['city_name']} ({city_results[-1]['green_score']}, {city_results[-1]['grade']})")

    # ── Step 4: Build the map ──
    print("\nBuilding interactive map...")

    m = folium.Map(location=[20, 0], zoom_start=3, tiles="CartoDB dark_matter")

    # Country choropleth (subtle background)
    try:
        req = urllib.request.Request(COUNTRIES_GEOJSON_URL)
        with urllib.request.urlopen(req, timeout=30) as resp:
            countries_geojson = json.loads(resp.read())

        import pandas as pd
        with open(CODECARBON_MIX_PATH) as f:
            cc = json.load(f)
        ci_data = pd.DataFrame([
            {"iso3": iso, "ci": d.get("carbon_intensity", 0)}
            for iso, d in cc.items() if d.get("carbon_intensity")
        ])
        ci_data["ci"] = ci_data["ci"].clip(upper=1499)

        folium.Choropleth(
            geo_data=countries_geojson,
            data=ci_data,
            columns=["iso3", "ci"],
            key_on="feature.properties.ISO3166-1-Alpha-3",
            fill_color="RdYlGn_r",
            fill_opacity=0.15,
            line_opacity=0.1,
            line_weight=0.2,
            nan_fill_color="#1a1a2e",
            legend_name="Country Carbon Intensity (gCO₂eq/kWh)",
            name="Country Borders",
            threshold_scale=[0, 50, 100, 200, 300, 400, 550, 700, 900, 1200, 1500],
        ).add_to(m)
    except Exception as e:
        print(f"  ⚠️ Choropleth skipped: {e}")

    # ── TRUE HEATMAP LAYER ──
    HeatMap(
        data=heatmap_data,
        name="Green Score Heatmap",
        min_opacity=0.4,
        max_zoom=6,
        radius=25,
        blur=20,
        gradient={
            0.0: '#00c853',    # green = good (low "heat" = low inverted score)
            0.3: '#64dd17',
            0.45: '#ffd600',
            0.6: '#ff9100',
            0.75: '#ff3d00',
            1.0: '#d50000',    # red = bad (high "heat" = high inverted score)
        },
    ).add_to(m)

    # ── City Labels ──
    city_group = folium.FeatureGroup(name="City Scores")
    for r in city_results:
        score = r["green_score"]
        grade = r["grade"]
        color = score_to_color(score)
        bd = r["breakdown"]
        ctx = r["local_context"]
        proj = r.get("projection", {})

        popup_html = f"""
        <div style="font-family:system-ui; min-width:260px;">
            <h3 style="margin:0; color:{color};">{r['city_name']}</h3>
            <h2 style="margin:4px 0; color:{color};">{score} / 100 — Grade {grade}</h2>
            <hr style="margin:6px 0;">
            <b>Country:</b> {r.get('country','?')} ({r.get('country_iso3','')})<br>
            <b>Country CI:</b> {bd['country_carbon_intensity_gCO2_kWh']} gCO₂/kWh<br>
            <hr style="margin:6px 0;">
            <b>Score Breakdown:</b><br>
            &nbsp; Baseline: {bd['country_baseline_score']}<br>
            &nbsp; IDW modifier: {bd['idw_local_modifier']:+.1f}<br>
            &nbsp; Fossil penalty: {bd['fossil_ops_penalty']:+.1f}<br>
            &nbsp; DC congestion: {bd['dc_congestion_factor']:+.1f}<br>
            <hr style="margin:6px 0;">
            <b>📈 Projection (2021–2025 trend):</b><br>
            &nbsp; Trend: {proj.get('emission_trend', 'N/A')} ({proj.get('emission_pct_change_per_year', '?')}%/yr)<br>
            &nbsp; 2027: {proj.get('score_2027', '?')} ({proj.get('grade_2027', '?')})<br>
            &nbsp; 2030: {proj.get('score_2030', '?')} ({proj.get('grade_2030', '?')})<br>
            &nbsp; R²: {proj.get('r_squared', '?')}<br>
            <hr style="margin:6px 0;">
            <b>Local ({r['search_radius_km']}km radius):</b><br>
            &nbsp; {ctx['power_plants_in_radius']} power plants |
            {ctx['fossil_operations_in_radius']} fossil ops<br>
            &nbsp; Renewable: {ctx['renewable_capacity_mw']:.0f} MW |
            Fossil: {ctx['fossil_capacity_mw']:.0f} MW<br>
            &nbsp; Nearest DC: {ctx['nearest_dc_km']}km
        </div>
        """

        folium.CircleMarker(
            location=[r["lat"], r["lon"]],
            radius=max(6, score / 6),
            color="white",
            fill=True,
            fill_color=color,
            fill_opacity=0.9,
            weight=1.5,
            popup=folium.Popup(popup_html, max_width=300),
            tooltip=f"{r['city_name']}: {score} ({grade})",
        ).add_to(city_group)

        # Floating grade label
        folium.Marker(
            location=[r["lat"], r["lon"]],
            icon=folium.DivIcon(html=f"""
                <div style="
                    background:{color}; color:white; padding:1px 5px;
                    border-radius:6px; font-weight:bold; font-size:10px;
                    text-align:center; white-space:nowrap;
                    border:1px solid rgba(255,255,255,0.6);
                    box-shadow:0 1px 4px rgba(0,0,0,0.5);
                    transform:translate(-50%,-140%);
                ">{grade} {score:.0f}</div>
            """),
        ).add_to(city_group)

    city_group.add_to(m)

    # Layer toggle
    folium.LayerControl(collapsed=False).add_to(m)

    # Legend
    legend_html = """
    <div style="position:fixed; bottom:30px; left:30px; z-index:9999;
                background:rgba(0,0,0,0.9); padding:14px 18px; border-radius:10px;
                font-family:system-ui; color:white; font-size:11px; line-height:2;
                box-shadow:0 4px 16px rgba(0,0,0,0.5);">
        <b style="font-size:13px;">GridSync Green Score</b><br>
        <span style="color:#00c853;">■</span> A (80–100) Excellent &nbsp;
        <span style="color:#64dd17;">■</span> B (65–79) Good<br>
        <span style="color:#ffd600;">■</span> C (50–64) Fair &nbsp;
        <span style="color:#ff9100;">■</span> D (35–49) Poor<br>
        <span style="color:#ff3d00;">■</span> E (20–34) Bad &nbsp;
        <span style="color:#d50000;">■</span> F (0–19) Critical<br>
        <span style="font-size:9px; opacity:0.7;">Grid: {step}° | Radius: 250km | Data: 2021–2025</span>
    </div>
    """.replace("{step}", str(step))
    m.get_root().html.add_child(folium.Element(legend_html))

    m.save("gridsync_mvp.html")
    print(f"\n✅ Saved gridsync_mvp.html")
    print("   Open in browser — you'll see the true heatmap glowing across the world!")


if __name__ == "__main__":
    main()
