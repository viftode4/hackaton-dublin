"""
GridSync — All-Layers Map Overlay

Plots a single world map with all three data layers:
  - Background: Country fill colored by CodeCarbon carbon intensity
  - Scatter: Climate TRACE power plants (sized by emissions)
  - Diamonds: 147 Hyperscaler Data Centers
  - Star: UK live carbon intensity annotation

Run: python3 visualize_all_layers.py
Output: plot_all_layers_map.png
"""

import json
import math
import urllib.request
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import matplotlib.patches as mpatches

# --- Paths ---
DATA_CENTERS_PATH = "../electricitymaps-contrib/config/data_centers/data_centers.json"
CLIMATE_TRACE_PATH = "../datasets_tracer/power/DATA/electricity-generation_emissions_sources_v5_3_0.csv"
CODECARBON_MIX_PATH = "../codecarbon/codecarbon/data/private_infra/global_energy_mix.json"
UK_CI_API = "https://api.carbonintensity.org.uk"

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
    return "#95a5a6"


def main():
    print("Loading all data layers...")

    # Layer 1: CodeCarbon
    with open(CODECARBON_MIX_PATH) as f:
        cc = json.load(f)
    print(f"  Layer 1: {len(cc)} countries")

    # Layer 2: Climate TRACE
    cols = ['source_name', 'source_type', 'start_time', 'iso3_country',
            'lat', 'lon', 'emissions_quantity', 'capacity']
    raw = pd.read_csv(CLIMATE_TRACE_PATH, usecols=cols)
    raw = raw.dropna(subset=['lat', 'lon', 'emissions_quantity'])
    raw['year'] = pd.to_datetime(raw['start_time']).dt.year
    latest = raw['year'].max()
    raw = raw[raw['year'] == latest]
    plants = raw.groupby('source_name', as_index=False).agg({
        'source_type': 'first', 'iso3_country': 'first',
        'lat': 'first', 'lon': 'first',
        'emissions_quantity': 'sum', 'capacity': 'first',
    })
    print(f"  Layer 2: {len(plants)} plants")

    # Data Centers
    with open(DATA_CENTERS_PATH) as f:
        dc_raw = json.load(f)
    dcs = []
    for key, d in dc_raw.items():
        if "lonlat" in d:
            lon, lat = d["lonlat"]
            dcs.append({"id": key, "provider": d.get("provider","?"),
                        "lat": lat, "lon": lon})
    dc_df = pd.DataFrame(dcs)
    print(f"  DCs: {len(dc_df)}")

    # Layer 3: UK live
    uk_ci = None
    try:
        req = urllib.request.Request(f"{UK_CI_API}/intensity",
                                     headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            uk_ci = data["data"][0]["intensity"].get("actual") or data["data"][0]["intensity"].get("forecast")
        print(f"  Layer 3: UK live = {uk_ci} gCO2/kWh")
    except Exception as e:
        print(f"  Layer 3: UK API unavailable ({e})")

    # === BUILD THE MAP ===
    fig, ax = plt.subplots(figsize=(22, 11), facecolor='#0d1117')
    ax.set_facecolor('#0d1117')

    # --- Layer 2: Power plants as emission-intensity scatter ---
    intensity = np.log1p(plants['emissions_quantity'])
    norm = plt.Normalize(intensity.min(), intensity.max())
    cmap = mcolors.LinearSegmentedColormap.from_list(
        'emissions', ['#1a3a1a', '#2ecc71', '#f39c12', '#e74c3c', '#ff0000'])
    sizes = np.clip(plants['emissions_quantity'] / 3000, 1, 60)

    scatter = ax.scatter(
        plants['lon'], plants['lat'],
        c=intensity, cmap=cmap, norm=norm,
        s=sizes, alpha=0.55, edgecolors='none', zorder=2,
    )

    # --- Data Centers (cyan diamonds, prominent) ---
    ax.scatter(
        dc_df['lon'], dc_df['lat'],
        c='#00d4ff', s=70, marker='D', edgecolors='white',
        linewidths=0.5, zorder=10,
    )

    # --- Layer 3: UK annotation ---
    if uk_ci:
        ax.annotate(
            f'🇬🇧 LIVE: {uk_ci} gCO₂/kWh',
            xy=(-1, 54), xytext=(10, 62),
            fontsize=11, color='#2ecc71', fontweight='bold',
            arrowprops=dict(arrowstyle='->', color='#2ecc71', lw=1.5),
            bbox=dict(boxstyle='round,pad=0.4', facecolor='#1a1a2e',
                      edgecolor='#2ecc71', alpha=0.9),
            zorder=15,
        )

    # --- Layer 1: Country carbon intensity labels for key countries ---
    label_countries = {
        "FRA": (-2, 47), "DEU": (10, 51), "POL": (20, 52),
        "USA": (-100, 40), "CHN": (105, 35), "IND": (78, 22),
        "BRA": (-50, -10), "AUS": (135, -25), "ZAF": (25, -30),
        "JPN": (138, 36), "NOR": (10, 62), "SWE": (15, 60),
    }
    for iso, (lx, ly) in label_countries.items():
        if iso in cc:
            ci = cc[iso].get("carbon_intensity", 0)
            color = '#2ecc71' if ci < 100 else '#f1c40f' if ci < 300 else '#e67e22' if ci < 500 else '#e74c3c'
            ax.text(lx, ly + 3, f'{ci:.0f}', fontsize=8, color=color,
                    fontweight='bold', ha='center', zorder=12,
                    bbox=dict(boxstyle='round,pad=0.2', facecolor='#0d1117',
                              edgecolor=color, alpha=0.8, linewidth=0.5))

    # Colorbar
    cbar = plt.colorbar(scatter, ax=ax, shrink=0.5, pad=0.02, aspect=30)
    cbar.set_label('Log Emissions (t CO₂e) — Climate TRACE', color='white', fontsize=10)
    cbar.ax.tick_params(colors='#aaa')

    # Legend
    legend_elements = [
        mpatches.Patch(facecolor='#0d1117', edgecolor='#2ecc71', linewidth=1.5,
                       label='Layer 1: CodeCarbon (country labels)'),
        plt.Line2D([0], [0], marker='o', color='w', markerfacecolor='#e67e22',
                   markersize=8, label='Layer 2: Climate TRACE plants', linestyle='None'),
        plt.Line2D([0], [0], marker='D', color='w', markerfacecolor='#00d4ff',
                   markersize=8, label='Data Centers (147)', linestyle='None'),
    ]
    if uk_ci:
        legend_elements.append(
            mpatches.Patch(facecolor='#1a1a2e', edgecolor='#2ecc71', linewidth=1.5,
                           label=f'Layer 3: UK Live ({uk_ci} gCO₂/kWh)')
        )
    ax.legend(handles=legend_elements, loc='lower left', fontsize=10,
              framealpha=0.85, facecolor='#16213e', labelcolor='white')

    ax.set_xlim(-180, 180)
    ax.set_ylim(-65, 82)
    ax.set_title("GridSync Hybrid Carbon Engine — All Data Layers",
                 color='white', fontsize=18, fontweight='bold', pad=15)
    ax.set_xlabel("Longitude", color='#888')
    ax.set_ylabel("Latitude", color='#888')
    ax.tick_params(colors='#555')
    ax.grid(True, alpha=0.08, color='#333')

    plt.tight_layout()
    plt.savefig("plot_all_layers_map.png", dpi=150, facecolor='#0d1117')
    print("\n✅ Saved plot_all_layers_map.png")
    plt.close()


if __name__ == "__main__":
    main()
