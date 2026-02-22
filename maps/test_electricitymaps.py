"""
Test Electricity Maps integration + Plot CO2-equivalent per region.

This script works in TWO modes:
  Mode 1 (Standalone): Uses Climate TRACE data to compute CO2eq/kWh per
          country, proving the Bottom-Up Synthesizer concept.
  Mode 2 (With parsers): If electricitymaps is installed, also queries
          live parsers for comparison.

Run:
  python3 test_electricitymaps.py

Output: plot_co2eq_regions.png
"""

import json
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import numpy as np
import pandas as pd

# --- Paths ---
DATA_CENTERS_PATH = "../electricitymaps-contrib/config/data_centers/data_centers.json"
CLIMATE_TRACE_PATH = "../datasets_tracer/power/DATA/electricity-generation_emissions_sources_v5_3_0.csv"
ZONES_CONFIG_DIR = "../electricitymaps-contrib/config/zones"

# IPCC AR5 lifecycle emission factors (gCO2eq / kWh)
EMISSION_FACTORS = {
    "coal":         820,
    "gas":          490,
    "oil":          650,
    "nuclear":      12,
    "hydro":        24,
    "solar":        45,
    "wind":         11,
    "biomass":      230,
    "geothermal":   38,
}
DEFAULT_FACTOR = 500  # conservative for unknown types


def load_climate_trace():
    """Load and deduplicate Climate TRACE power plants."""
    print("Loading Climate TRACE power plants...")
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
    return plants


def load_zone_keys():
    """Load available Electricity Maps zone keys."""
    zones = []
    if os.path.isdir(ZONES_CONFIG_DIR):
        for f in os.listdir(ZONES_CONFIG_DIR):
            if f.endswith('.yaml'):
                zones.append(f.replace('.yaml', ''))
    return sorted(zones)


def compute_co2eq_by_country(plants):
    """
    Bottom-Up method: For each country, compute CO2eq/kWh from Climate TRACE.
    
    Formula: total_emissions / (capacity * 8760 hours * capacity_factor)
    Simplified: emissions_tons * 1e6 / (capacity_MW * 8760 * 0.5 * 1000)
    = gCO2eq/kWh
    """
    results = []
    by_country = plants.groupby('iso3_country')

    for country, group in by_country:
        total_emissions_tons = group['emissions_quantity'].sum()
        total_capacity_mw = group['capacity'].sum()
        num_plants = len(group)

        if total_capacity_mw <= 0 or num_plants < 3:
            continue

        # Estimate generation: capacity * hours_per_year * avg_capacity_factor
        # Using 0.45 as average capacity factor across all fuel types
        estimated_generation_mwh = total_capacity_mw * 8760 * 0.45
        # Convert: emissions (tons) → grams, generation (MWh) → kWh
        co2eq_gkwh = (total_emissions_tons * 1e6) / (estimated_generation_mwh * 1000)

        # Fuel mix breakdown
        fuel_mix = group.groupby('source_type')['capacity'].sum()
        fuel_pct = (fuel_mix / total_capacity_mw * 100).round(1).to_dict()

        results.append({
            'country': country,
            'co2eq_gkwh': round(co2eq_gkwh, 1),
            'total_capacity_mw': round(total_capacity_mw, 0),
            'total_emissions_mt': round(total_emissions_tons / 1e6, 2),
            'num_plants': num_plants,
            'fuel_mix_pct': fuel_pct,
        })

    return sorted(results, key=lambda x: x['co2eq_gkwh'])


def test_zone_coverage(zone_keys, co2_results):
    """Cross-reference: which countries have BOTH parser coverage AND Climate TRACE data."""
    country_codes = {r['country'] for r in co2_results}
    # Zone keys often map to country ISO2 codes
    zone_countries = {z[:2] for z in zone_keys if len(z) >= 2}

    covered = country_codes & zone_countries
    trace_only = country_codes - zone_countries
    emaps_only = zone_countries - country_codes

    print(f"\n{'='*60}")
    print("COVERAGE ANALYSIS: Electricity Maps vs Climate TRACE")
    print(f"{'='*60}")
    print(f"  ✅ Both sources:        {len(covered)} regions")
    print(f"  🟡 Climate TRACE only:  {len(trace_only)} regions (Dark Regions!)")
    print(f"  🔵 Electricity Maps only: {len(emaps_only)} regions")
    print(f"\n  Dark Regions (our value-add): {sorted(trace_only)[:20]}...")
    return covered, trace_only


def plot_co2eq_regions(results, top_n=30):
    """Bar chart: CO2eq/kWh per country from Climate TRACE bottom-up analysis."""
    # Take top + bottom for contrast
    cleanest = results[:top_n // 2]
    dirtiest = results[-(top_n // 2):]
    selected = cleanest + dirtiest

    countries = [r['country'] for r in selected]
    values = [r['co2eq_gkwh'] for r in selected]

    # Color gradient
    norm = plt.Normalize(min(values), max(values))
    cmap = mcolors.LinearSegmentedColormap.from_list(
        'co2', ['#2ecc71', '#f1c40f', '#e67e22', '#e74c3c', '#8b0000'])
    colors = [cmap(norm(v)) for v in values]

    fig, ax = plt.subplots(figsize=(16, 10), facecolor='#1a1a2e')
    ax.set_facecolor('#1a1a2e')

    bars = ax.barh(countries, values, color=colors, edgecolor='none', height=0.7)

    for bar, val in zip(bars, values):
        ax.text(bar.get_width() + 5, bar.get_y() + bar.get_height()/2,
                f'{val:.0f}', va='center', color='#ddd', fontsize=9,
                fontweight='bold')

    # Global average line
    avg = np.mean([r['co2eq_gkwh'] for r in results])
    ax.axvline(x=avg, color='#3498db', linestyle='--', linewidth=1.5, alpha=0.7)
    ax.text(avg + 5, len(selected) - 1, f'Dataset Avg\n{avg:.0f}',
            color='#3498db', fontsize=9, va='top')

    ax.set_xlabel("gCO₂eq / kWh (Bottom-Up from Climate TRACE plant data)",
                  color='white', fontsize=12)
    ax.set_title("Carbon Intensity by Country — Bottom-Up Synthesis\n"
                 f"(Cleanest {top_n//2} vs Dirtiest {top_n//2} from {len(results)} countries)",
                 color='white', fontsize=14, fontweight='bold', pad=15)
    ax.tick_params(colors='white', labelsize=10)
    ax.xaxis.grid(True, alpha=0.15, color='#555')
    ax.set_xlim(0, max(values) * 1.12)

    plt.tight_layout()
    plt.savefig("plot_co2eq_regions.png", dpi=150, facecolor='#1a1a2e')
    print(f"\n✅ Saved plot_co2eq_regions.png")
    plt.close()


def plot_fuel_mix_top10(results):
    """Stacked bar chart showing fuel mix for the top 10 emitting countries."""
    top10 = sorted(results, key=lambda x: x['total_emissions_mt'], reverse=True)[:10]
    all_fuels = set()
    for r in top10:
        all_fuels.update(r['fuel_mix_pct'].keys())
    all_fuels = sorted(all_fuels)

    fuel_colors = {
        'coal': '#e74c3c', 'gas': '#e67e22', 'oil': '#8b4513',
        'nuclear': '#9b59b6', 'hydro': '#3498db', 'solar': '#f1c40f',
        'wind': '#2ecc71', 'biomass': '#27ae60', 'geothermal': '#c0392b',
    }

    fig, ax = plt.subplots(figsize=(14, 7), facecolor='#1a1a2e')
    ax.set_facecolor('#1a1a2e')

    countries = [r['country'] for r in top10]
    bottom = np.zeros(len(top10))

    for fuel in all_fuels:
        vals = [r['fuel_mix_pct'].get(fuel, 0) for r in top10]
        color = fuel_colors.get(fuel, '#95a5a6')
        ax.bar(countries, vals, bottom=bottom, label=fuel, color=color, width=0.7)
        bottom += np.array(vals)

    ax.set_ylabel("% of Installed Capacity", color='white', fontsize=12)
    ax.set_title("Fuel Mix — Top 10 Emitting Countries (by capacity %)",
                 color='white', fontsize=14, fontweight='bold', pad=15)
    ax.tick_params(colors='white', labelsize=11)
    ax.legend(loc='upper right', fontsize=9, framealpha=0.8,
              facecolor='#16213e', labelcolor='white', ncol=2)
    ax.set_ylim(0, 105)
    ax.yaxis.grid(True, alpha=0.15, color='#555')

    plt.tight_layout()
    plt.savefig("plot_fuel_mix_top10.png", dpi=150, facecolor='#1a1a2e')
    print("✅ Saved plot_fuel_mix_top10.png")
    plt.close()


def print_summary(results):
    """Print ranked table."""
    print(f"\n{'='*70}")
    print(f"{'Country':8s}  {'gCO2eq/kWh':>11s}  {'Capacity MW':>12s}  {'Emissions Mt':>13s}  {'Plants':>6s}")
    print(f"{'='*70}")
    for r in results[:15]:
        icon = "🟢" if r['co2eq_gkwh'] < 100 else "🟡" if r['co2eq_gkwh'] < 300 else "🔴"
        print(f"  {icon} {r['country']:6s}  {r['co2eq_gkwh']:10.1f}  {r['total_capacity_mw']:11.0f}  "
              f"{r['total_emissions_mt']:12.2f}  {r['num_plants']:5d}")
    print("  ...")
    for r in results[-5:]:
        icon = "🔴"
        print(f"  {icon} {r['country']:6s}  {r['co2eq_gkwh']:10.1f}  {r['total_capacity_mw']:11.0f}  "
              f"{r['total_emissions_mt']:12.2f}  {r['num_plants']:5d}")


if __name__ == "__main__":
    print("=" * 60)
    print("GridSync — CO2eq per Region (Bottom-Up from Climate TRACE)")
    print("=" * 60)

    plants = load_climate_trace()
    zone_keys = load_zone_keys()
    print(f"  {len(zone_keys)} Electricity Maps zone configs found")

    co2_results = compute_co2eq_by_country(plants)
    print(f"  {len(co2_results)} countries with sufficient data")

    print_summary(co2_results)
    test_zone_coverage(zone_keys, co2_results)

    plot_co2eq_regions(co2_results)
    plot_fuel_mix_top10(co2_results)

    print("\nDone!")
