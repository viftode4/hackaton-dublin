"""
GridSync — Time-Series Carbon Intensity Map (2026 → 2030)

Uses the trained Ridge model + temporal trend features to project carbon
intensity forward, then renders:
  • A choropleth showing predicted CI differential (2030 − 2026)
  • Slider / frames for 2026, 2027, 2028, 2029, 2030 absolute CI
  • Annotations for fastest improving and deteriorating zones

Outputs: gridsync_timeseries.html (interactive Plotly map)
Run:  python3 visualize_timeseries_map.py
"""

import json, os, math, sys
import numpy as np
import pandas as pd

try:
    import plotly.graph_objects as go
except ImportError:
    print("❌  pip install plotly")
    sys.exit(1)

# ── Import our engine (triggers data loading at import time) ──
import geo_estimator as ge

# ── Constants ──
WORLD_GEOJSON = os.path.join(
    os.path.dirname(__file__), "..", "..",
    "electricitymaps-contrib", "geo", "world.geojson"
)
YEARS = [2026, 2027, 2028, 2029, 2030]
BASE_YEAR = 2025  # model "now"


# =====================================================================
#  1.  Compute zone-level CI + local_trend_b for every polygon
# =====================================================================
def compute_zone_predictions():
    """
    For each zone polygon with known CI, call the model once at the
    zone centroid to get predicted_ci and local_trend_b, then project
    forward.
    """
    from shapely.geometry import shape

    with open(WORLD_GEOJSON) as f:
        geo = json.load(f)

    records = []
    total = len(geo["features"])
    print(f"Computing predictions for {total} zones …")

    for i, feat in enumerate(geo["features"]):
        zn = feat["properties"]["zoneName"]
        poly = shape(feat["geometry"])
        centroid = poly.centroid
        lat, lon = centroid.y, centroid.x

        try:
            r = ge.compute_green_score(lat, lon, radius_km=300,
                                        disable_live_api=True,
                                        disable_reverse_geocoder=True)
        except Exception as e:
            continue

        bd = r["breakdown"]
        proj = r.get("projection", {})
        ci_now = max(0.0, bd["ml_predicted_ci"])  # clamp negative
        trend_b = proj.get("local_trend_b", 0.0)

        # Cap extreme trends to ±15%/yr to avoid unrealistic projections
        trend_b = max(-0.15, min(0.15, trend_b))

        # Skip zones where the model clearly failed (centroid in ocean etc.)
        if ci_now < 5:
            continue

        # Project CI for each future year
        row = {
            "zone": zn,
            "lat": round(lat, 4),
            "lon": round(lon, 4),
            "ci_now": round(ci_now, 1),
            "trend_b": round(trend_b, 6),
            "country": r.get("country", ""),
            "grade": r["grade"],
        }
        for yr in YEARS:
            dt = yr - BASE_YEAR
            scale = max(0.05, 1.0 + trend_b * dt)  # floor at 5% of current
            row[f"ci_{yr}"] = round(ci_now * scale, 1)

        row["diff_2030_2026"] = round(row["ci_2030"] - row["ci_2026"], 1)
        row["pct_change"] = round(
            100.0 * (row["ci_2030"] - row["ci_2026"]) / max(row["ci_2026"], 1), 1
        )
        records.append(row)

        if (i + 1) % 50 == 0:
            print(f"  {i+1}/{total} zones done")

    df = pd.DataFrame(records)
    print(f"✅ {len(df)} zones with predictions")
    return df, geo


# =====================================================================
#  2.  Build the Plotly figure
# =====================================================================
def build_figure(df: pd.DataFrame, geojson: dict):
    """
    Two-panel figure:
      Left  – CI differential (2030 − 2026), diverging colorscale
      Right – Absolute CI with year slider (animation frames)
    """
    from plotly.subplots import make_subplots

    # ── Filter GeoJSON to only zones we have predictions for ──
    zone_set = set(df["zone"])
    filtered_features = [
        f for f in geojson["features"]
        if f["properties"]["zoneName"] in zone_set
    ]
    filtered_geo = {"type": "FeatureCollection", "features": filtered_features}

    # Make sure feature id matches our dataframe zone name
    for feat in filtered_geo["features"]:
        feat["id"] = feat["properties"]["zoneName"]

    # ── Clip diff for symmetric color range ──
    max_abs_diff = min(200, df["diff_2030_2026"].abs().quantile(0.95))

    # ── Hover text ──
    df["hover_diff"] = df.apply(
        lambda r: (
            f"<b>{r['zone']}</b> ({r['country']})<br>"
            f"CI 2026: {r['ci_2026']:.0f} gCO₂/kWh<br>"
            f"CI 2030: {r['ci_2030']:.0f} gCO₂/kWh<br>"
            f"Δ: <b>{r['diff_2030_2026']:+.0f}</b> ({r['pct_change']:+.1f}%)<br>"
            f"Trend: {r['trend_b']*100:.2f}%/yr"
        ),
        axis=1,
    )

    # ================================================================
    #  Panel 1 — Differential map (2030 − 2026)
    # ================================================================
    fig = go.Figure()

    fig.add_trace(go.Choroplethmap(
        geojson=filtered_geo,
        locations=df["zone"],
        z=df["diff_2030_2026"],
        text=df["hover_diff"],
        hoverinfo="text",
        colorscale=[
            [0.0,  "#1a9641"],   # big improvement (negative diff)
            [0.35, "#a6d96a"],
            [0.5,  "#ffffbf"],   # neutral
            [0.65, "#fdae61"],
            [1.0,  "#d7191c"],   # big worsening (positive diff)
        ],
        zmin=-max_abs_diff,
        zmax=max_abs_diff,
        colorbar=dict(
            title=dict(
                text="ΔCI (gCO₂/kWh)<br>2030 − 2026",
                font=dict(color="white", size=13),
            ),
            tickfont=dict(color="white"),
            x=0.99,
            len=0.75,
            ticksuffix=" g",
        ),
        marker=dict(opacity=0.85, line=dict(width=0.3, color="#333")),
        below="",
    ))

    # ── Annotations for top improvers / deteriorators ──
    top_improve = df.nsmallest(5, "diff_2030_2026")
    top_worsen  = df.nlargest(5, "diff_2030_2026")

    anno_texts = []
    for _, row in top_improve.iterrows():
        anno_texts.append(dict(
            x=row["lon"], y=row["lat"],
            text=f"▼ {row['zone']}<br>{row['diff_2030_2026']:+.0f}g",
            showarrow=False,
            font=dict(size=9, color="#1a9641"),
            bgcolor="rgba(0,0,0,0.6)",
        ))
    for _, row in top_worsen.iterrows():
        anno_texts.append(dict(
            x=row["lon"], y=row["lat"],
            text=f"▲ {row['zone']}<br>{row['diff_2030_2026']:+.0f}g",
            showarrow=False,
            font=dict(size=9, color="#d7191c"),
            bgcolor="rgba(0,0,0,0.6)",
        ))

    # ================================================================
    #  Animation frames — absolute CI per year (2026-2030)
    # ================================================================
    frames = []
    for yr in YEARS:
        col = f"ci_{yr}"
        hover_yr = df.apply(
            lambda r, y=yr: (
                f"<b>{r['zone']}</b> ({r['country']})<br>"
                f"CI {y}: {r[col]:.0f} gCO₂/kWh<br>"
                f"Grade: {r['grade']}"
            ),
            axis=1,
        )
        frames.append(go.Frame(
            data=[go.Choroplethmap(
                geojson=filtered_geo,
                locations=df["zone"],
                z=df[col],
                text=hover_yr,
                hoverinfo="text",
                colorscale=[
                    [0.0,  "#1a472a"],
                    [0.15, "#2ecc71"],
                    [0.3,  "#f1c40f"],
                    [0.5,  "#e67e22"],
                    [0.7,  "#e74c3c"],
                    [1.0,  "#8b0000"],
                ],
                zmin=0, zmax=900,
                colorbar=dict(
                    title=dict(text=f"CI {yr}<br>gCO₂/kWh", font=dict(color="white", size=13)),
                    tickfont=dict(color="white"),
                    x=0.99, len=0.75,
                ),
                marker=dict(opacity=0.85, line=dict(width=0.3, color="#333")),
                below="",
            )],
            name=str(yr),
        ))

    fig.frames = frames

    # ── Slider ──
    sliders = [dict(
        active=0,
        currentvalue=dict(
            prefix="Year: ",
            font=dict(color="white", size=16),
        ),
        pad=dict(t=30),
        steps=[
            dict(
                args=[[str(yr)], dict(frame=dict(duration=500, redraw=True), mode="immediate")],
                label=str(yr),
                method="animate",
            )
            for yr in YEARS
        ],
        font=dict(color="white"),
        bgcolor="#222",
        bordercolor="#555",
    )]

    # ── Play / pause buttons ──
    updatemenus = [dict(
        type="buttons",
        showactive=False,
        x=0.05, y=-0.04,
        buttons=[
            dict(
                label="▶ Play",
                method="animate",
                args=[None, dict(frame=dict(duration=800, redraw=True),
                                  fromcurrent=True, mode="immediate")],
            ),
            dict(
                label="⏸",
                method="animate",
                args=[[None], dict(frame=dict(duration=0, redraw=True), mode="immediate")],
            ),
        ],
        font=dict(color="white"),
        bgcolor="#333",
    )]

    # ── Buttons to switch between diff and abs views ──
    view_buttons = [dict(
        type="buttons",
        direction="right",
        showactive=True,
        x=0.5, y=1.08,
        xanchor="center",
        buttons=[
            dict(
                label="  Δ Differential (2030−2026)  ",
                method="update",
                args=[
                    {
                        "z": [df["diff_2030_2026"]],
                        "text": [df["hover_diff"]],
                        "colorscale": [[
                            [0.0, "#1a9641"], [0.35, "#a6d96a"],
                            [0.5, "#ffffbf"], [0.65, "#fdae61"],
                            [1.0, "#d7191c"],
                        ]],
                        "zmin": [-max_abs_diff],
                        "zmax": [max_abs_diff],
                    },
                    {
                        "coloraxis.colorbar.title.text": "ΔCI (gCO₂/kWh)<br>2030 − 2026",
                    },
                ],
            ),
            dict(
                label="  CI 2026  ",
                method="update",
                args=[
                    {
                        "z": [df["ci_2026"]],
                        "colorscale": [[
                            [0.0, "#1a472a"], [0.15, "#2ecc71"],
                            [0.3, "#f1c40f"], [0.5, "#e67e22"],
                            [0.7, "#e74c3c"], [1.0, "#8b0000"],
                        ]],
                        "zmin": [0], "zmax": [900],
                    },
                ],
            ),
            dict(
                label="  CI 2030  ",
                method="update",
                args=[
                    {
                        "z": [df["ci_2030"]],
                        "colorscale": [[
                            [0.0, "#1a472a"], [0.15, "#2ecc71"],
                            [0.3, "#f1c40f"], [0.5, "#e67e22"],
                            [0.7, "#e74c3c"], [1.0, "#8b0000"],
                        ]],
                        "zmin": [0], "zmax": [900],
                    },
                ],
            ),
        ],
        font=dict(color="white", size=12),
        bgcolor="#222",
        bordercolor="#555",
    )]

    # ── Layout ──
    fig.update_layout(
        title=dict(
            text=(
                "GridSync — Carbon Intensity Trajectory 2026 → 2030<br>"
                "<sup>Projected using Ridge model + Climate TRACE temporal trends</sup>"
            ),
            font=dict(size=20, color="white"),
            x=0.5,
        ),
        map=dict(
            style="carto-darkmatter",
            center=dict(lat=25, lon=10),
            zoom=1.2,
        ),
        paper_bgcolor="#0d1117",
        plot_bgcolor="#0d1117",
        margin=dict(l=0, r=0, t=80, b=40),
        height=750,
        width=1400,
        sliders=sliders,
        updatemenus=updatemenus + view_buttons,
    )

    return fig


# =====================================================================
#  3.  Summary statistics
# =====================================================================
def print_summary(df: pd.DataFrame):
    print("\n" + "=" * 70)
    print("  TIME-SERIES PROJECTION SUMMARY (2026 → 2030)")
    print("=" * 70)

    improving = df[df["diff_2030_2026"] < -5]
    worsening = df[df["diff_2030_2026"] > 5]
    stable = df[(df["diff_2030_2026"] >= -5) & (df["diff_2030_2026"] <= 5)]

    print(f"\n  Total zones: {len(df)}")
    print(f"  Improving (Δ < −5):   {len(improving)} zones ({100*len(improving)/len(df):.0f}%)")
    print(f"  Stable (|Δ| ≤ 5):     {len(stable)} zones ({100*len(stable)/len(df):.0f}%)")
    print(f"  Worsening (Δ > +5):   {len(worsening)} zones ({100*len(worsening)/len(df):.0f}%)")

    print(f"\n  Mean CI 2026: {df['ci_2026'].mean():.0f} gCO₂/kWh")
    print(f"  Mean CI 2030: {df['ci_2030'].mean():.0f} gCO₂/kWh")
    print(f"  Mean Δ:       {df['diff_2030_2026'].mean():+.1f} gCO₂/kWh")

    print("\n  ── Top 10 Improving Zones ──")
    for _, r in df.nsmallest(10, "diff_2030_2026").iterrows():
        print(f"    {r['zone']:25s}  {r['ci_2026']:5.0f} → {r['ci_2030']:5.0f}  Δ={r['diff_2030_2026']:+6.0f}g  ({r['pct_change']:+.1f}%)")

    print("\n  ── Top 10 Worsening Zones ──")
    for _, r in df.nlargest(10, "diff_2030_2026").iterrows():
        print(f"    {r['zone']:25s}  {r['ci_2026']:5.0f} → {r['ci_2030']:5.0f}  Δ={r['diff_2030_2026']:+6.0f}g  ({r['pct_change']:+.1f}%)")

    print()


# =====================================================================
#  Main
# =====================================================================
def main():
    df, geojson = compute_zone_predictions()

    print_summary(df)

    print("Building interactive map …")
    fig = build_figure(df, geojson)

    out_html = os.path.join(os.path.dirname(__file__), "gridsync_timeseries.html")
    fig.write_html(out_html, config={"scrollZoom": True, "displayModeBar": True})
    print(f"✅ Saved {out_html}")

    # Also save the prediction data
    csv_path = os.path.join(os.path.dirname(__file__), "zone_timeseries.csv")
    df.to_csv(csv_path, index=False)
    print(f"✅ Saved {csv_path}")

    print("\nDone! Open gridsync_timeseries.html in your browser.")


if __name__ == "__main__":
    main()
