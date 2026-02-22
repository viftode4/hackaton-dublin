"""
GridSync Static Visualizations (PNG output)

Generates three PNG plots:
  1. Global emissions scatter map (power plants color-coded by fuel type)
  2. Data Centers + Power Plants overlay
  3. Top 20 dirtiest regions bar chart

Run: python3 visualize_png.py
Output: plot_emissions_map.png, plot_overlay_map.png, plot_top_emitters.png

Requirements: pip install matplotlib pandas numpy
"""

import json
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')  # non-interactive backend for PNG
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

# --- Paths ---
DATA_CENTERS_PATH = "../electricitymaps-contrib/config/data_centers/data_centers.json"
CLIMATE_TRACE_PATH = "../datasets_tracer/power/DATA/electricity-generation_emissions_sources_v5_3_0.csv"

# --- Fuel color map ---
FUEL_COLORS = {
    "coal": "#e74c3c",
    "gas": "#e67e22",
    "oil": "#8b4513",
    "nuclear": "#9b59b6",
    "hydro": "#3498db",
    "solar": "#f1c40f",
    "wind": "#2ecc71",
    "biomass": "#27ae60",
    "geothermal": "#e74c3c",
}

def fuel_color(source_type):
    s = str(source_type).lower()
    for key, color in FUEL_COLORS.items():
        if key in s:
            return color
    return "#95a5a6"


def load_data():
    print("Loading data...")
    # Power plants
    cols = ['source_name', 'source_type', 'start_time', 'iso3_country',
            'lat', 'lon', 'emissions_quantity', 'capacity']
    raw = pd.read_csv(CLIMATE_TRACE_PATH, usecols=cols)
    raw = raw.dropna(subset=['lat', 'lon', 'emissions_quantity'])
    raw['year'] = pd.to_datetime(raw['start_time']).dt.year
    latest = raw['year'].max()
    raw = raw[raw['year'] == latest]

    plants = raw.groupby('source_name', as_index=False).agg({
        'source_type': 'first',
        'iso3_country': 'first',
        'lat': 'first',
        'lon': 'first',
        'emissions_quantity': 'sum',
        'capacity': 'first',
    })
    print(f"  {len(plants)} unique plants (year {latest})")

    # Data centers
    with open(DATA_CENTERS_PATH) as f:
        dc_raw = json.load(f)
    dcs = []
    for key, d in dc_raw.items():
        if "lonlat" in d:
            lon, lat = d["lonlat"]
            dcs.append({"id": key, "provider": d.get("provider","?"),
                        "lat": lat, "lon": lon})
    dc_df = pd.DataFrame(dcs)
    print(f"  {len(dc_df)} data centers")
    return plants, dc_df


def plot_emissions_map(plants):
    """Plot 1: Global scatter of power plants, color = fuel, size = emissions."""
    fig, ax = plt.subplots(figsize=(20, 10), facecolor='#1a1a2e')
    ax.set_facecolor('#1a1a2e')

    colors = plants['source_type'].apply(fuel_color)
    sizes = np.clip(plants['emissions_quantity'] / 5000, 1, 80)

    ax.scatter(plants['lon'], plants['lat'],
               c=colors, s=sizes, alpha=0.6, edgecolors='none')

    # Legend
    for fuel, color in FUEL_COLORS.items():
        ax.scatter([], [], c=color, s=40, label=fuel.capitalize())
    ax.legend(loc='lower left', fontsize=9, framealpha=0.8,
              facecolor='#16213e', labelcolor='white', ncol=3)

    ax.set_xlim(-180, 180)
    ax.set_ylim(-70, 85)
    ax.set_title("Global Power Plant Emissions by Fuel Type (Climate TRACE 2025)",
                 color='white', fontsize=16, fontweight='bold', pad=15)
    ax.set_xlabel("Longitude", color='#aaa')
    ax.set_ylabel("Latitude", color='#aaa')
    ax.tick_params(colors='#666')
    ax.grid(True, alpha=0.15, color='#444')

    plt.tight_layout()
    plt.savefig("plot_emissions_map.png", dpi=150, facecolor='#1a1a2e')
    print("✅ Saved plot_emissions_map.png")
    plt.close()


def plot_overlay_map(plants, dc_df):
    """Plot 2: Power plants (background) + Data Centers (foreground)."""
    fig, ax = plt.subplots(figsize=(20, 10), facecolor='#0f0f23')
    ax.set_facecolor('#0f0f23')

    # Heatmap-style: plot emissions as semi-transparent dots
    intensity = np.log1p(plants['emissions_quantity'])
    norm = plt.Normalize(intensity.min(), intensity.max())
    cmap = mcolors.LinearSegmentedColormap.from_list(
        'emissions', ['#1a472a', '#f39c12', '#e74c3c', '#ff0000'])

    scatter = ax.scatter(plants['lon'], plants['lat'],
                         c=intensity, cmap=cmap, norm=norm,
                         s=8, alpha=0.5, edgecolors='none')

    # Data centers on top
    ax.scatter(dc_df['lon'], dc_df['lat'],
               c='#00d4ff', s=60, marker='D', edgecolors='white',
               linewidths=0.5, zorder=10, label='Hyperscaler Data Centers')

    cbar = plt.colorbar(scatter, ax=ax, shrink=0.6, pad=0.02)
    cbar.set_label('Log Emissions (t CO₂e)', color='white', fontsize=10)
    cbar.ax.tick_params(colors='#aaa')

    ax.legend(loc='lower left', fontsize=11, framealpha=0.8,
              facecolor='#16213e', labelcolor='white',
              markerscale=1.2)

    ax.set_xlim(-180, 180)
    ax.set_ylim(-70, 85)
    ax.set_title("GridSync: Data Centers vs Power Plant Emissions",
                 color='white', fontsize=16, fontweight='bold', pad=15)
    ax.set_xlabel("Longitude", color='#aaa')
    ax.set_ylabel("Latitude", color='#aaa')
    ax.tick_params(colors='#666')
    ax.grid(True, alpha=0.1, color='#333')

    plt.tight_layout()
    plt.savefig("plot_overlay_map.png", dpi=150, facecolor='#0f0f23')
    print("✅ Saved plot_overlay_map.png")
    plt.close()


def plot_top_emitters(plants):
    """Plot 3: Top 20 countries by total annual emissions."""
    by_country = plants.groupby('iso3_country')['emissions_quantity'].sum()
    top20 = by_country.nlargest(20).sort_values()

    fig, ax = plt.subplots(figsize=(12, 8), facecolor='#1a1a2e')
    ax.set_facecolor('#1a1a2e')

    colors = plt.cm.RdYlGn_r(np.linspace(0.2, 0.9, len(top20)))
    bars = ax.barh(top20.index, top20.values / 1e6, color=colors, edgecolor='none')

    ax.set_xlabel("Annual Emissions (Million tonnes CO₂e)", color='white', fontsize=12)
    ax.set_title("Top 20 Countries by Power Sector Emissions (2025)",
                 color='white', fontsize=14, fontweight='bold', pad=15)
    ax.tick_params(colors='white')
    ax.xaxis.grid(True, alpha=0.2, color='#555')

    for bar, val in zip(bars, top20.values / 1e6):
        ax.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height()/2,
                f'{val:.1f}M', va='center', color='#ccc', fontsize=9)

    plt.tight_layout()
    plt.savefig("plot_top_emitters.png", dpi=150, facecolor='#1a1a2e')
    print("✅ Saved plot_top_emitters.png")
    plt.close()


if __name__ == "__main__":
    plants, dc_df = load_data()
    plot_emissions_map(plants)
    plot_overlay_map(plants, dc_df)
    plot_top_emitters(plants)
    print("\nDone! Open the PNG files to view.")
