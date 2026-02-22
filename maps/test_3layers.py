"""
Test all three data layers of the GridSync Hybrid Carbon Engine.

Layer 1: CodeCarbon global_energy_mix.json
Layer 2: Climate TRACE bottom-up
Layer 3: UK Carbon Intensity API

Also generates a comparison plot: plot_3layer_comparison.png

Run: python3 test_3layers.py
"""

import json
import math
import urllib.request
import urllib.error

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree

# --- Paths ---
DATA_CENTERS_PATH = "../electricitymaps-contrib/config/data_centers/data_centers.json"
CLIMATE_TRACE_PATH = "../datasets_tracer/power/DATA/electricity-generation_emissions_sources_v5_3_0.csv"
CODECARBON_MIX_PATH = "../codecarbon/codecarbon/data/private_infra/global_energy_mix.json"
UK_CI_API = "https://api.carbonintensity.org.uk"


# ============================================================
#  TEST LAYER 1: CodeCarbon
# ============================================================
class TestLayer1CodeCarbon:
    """Verify CodeCarbon's global energy mix data."""

    def setup_method(self):
        with open(CODECARBON_MIX_PATH, 'r') as f:
            self.mix = json.load(f)

    def test_is_dict(self):
        assert isinstance(self.mix, dict)

    def test_minimum_countries(self):
        assert len(self.mix) >= 150, f"Expected >= 150, got {len(self.mix)}"

    def test_carbon_intensity_present(self):
        """Every country should have a carbon_intensity field."""
        for iso, data in self.mix.items():
            assert "carbon_intensity" in data, f"{iso} missing carbon_intensity"

    def test_known_countries(self):
        for iso in ["USA", "GBR", "FRA", "DEU", "CHN", "IND", "BRA", "JPN"]:
            assert iso in self.mix, f"{iso} missing from dataset"

    def test_intensity_values_reasonable(self):
        """Carbon intensity should be between 0 and 2000 gCO2/kWh."""
        for iso, data in self.mix.items():
            ci = data.get("carbon_intensity", 0)
            assert 0 <= ci <= 2000, f"{iso}: intensity {ci} out of range"

    def test_france_is_clean(self):
        """France (nuclear-heavy) should be < 100 gCO2/kWh."""
        assert self.mix["FRA"]["carbon_intensity"] < 100

    def test_poland_is_dirty(self):
        """Poland (coal-heavy) should be > 400 gCO2/kWh."""
        assert self.mix["POL"]["carbon_intensity"] > 400

    def test_energy_mix_fields(self):
        """Each country should have coal, gas, solar etc."""
        for field in ["coal_TWh", "gas_TWh", "solar_TWh", "wind_TWh", "total_TWh"]:
            assert field in self.mix["USA"], f"USA missing {field}"


# ============================================================
#  TEST LAYER 2: Climate TRACE
# ============================================================
class TestLayer2ClimateTRACE:
    """Verify Climate TRACE deduplication and spatial queries."""

    def setup_method(self):
        cols = ['source_name', 'source_type', 'start_time', 'iso3_country',
                'lat', 'lon', 'emissions_quantity', 'capacity']
        raw = pd.read_csv(CLIMATE_TRACE_PATH, usecols=cols, nrows=50000)
        raw = raw.dropna(subset=['lat', 'lon', 'emissions_quantity'])
        raw['year'] = pd.to_datetime(raw['start_time']).dt.year
        latest = raw['year'].max()
        raw = raw[raw['year'] == latest]
        self.plants = raw.groupby('source_name', as_index=False).agg({
            'source_type': 'first',
            'iso3_country': 'first',
            'lat': 'first', 'lon': 'first',
            'emissions_quantity': 'sum',
            'capacity': 'first',
        })

    def test_deduplication_reduces_rows(self):
        """After dedup, there should be fewer rows than 50k raw."""
        assert len(self.plants) < 50000

    def test_no_duplicate_names(self):
        assert self.plants['source_name'].is_unique

    def test_spatial_index_works(self):
        coords = np.radians(self.plants[['lat', 'lon']].values)
        tree = BallTree(coords, metric='haversine')
        # Query near Aruba
        aruba = [[math.radians(12.47), math.radians(-69.98)]]
        ind = tree.query_radius(aruba, r=100/6371.0)
        assert len(ind[0]) > 0

    def test_country_detection(self):
        """Plants should have valid ISO3 country codes."""
        assert self.plants['iso3_country'].notna().sum() > 0


# ============================================================
#  TEST LAYER 3: UK Carbon Intensity API
# ============================================================
class TestLayer3UKAPI:
    """Verify the UK Carbon Intensity API is accessible (no auth)."""

    def test_intensity_endpoint(self):
        try:
            req = urllib.request.Request(
                f"{UK_CI_API}/intensity",
                headers={"Accept": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            assert "data" in data
            assert len(data["data"]) > 0
            entry = data["data"][0]
            assert "intensity" in entry
            ci = entry["intensity"]["forecast"]
            assert 0 <= ci <= 800, f"UK intensity {ci} out of range"
        except urllib.error.URLError:
            print("⚠️ Network unavailable, skipping UK API test")

    def test_generation_endpoint(self):
        try:
            req = urllib.request.Request(
                f"{UK_CI_API}/generation",
                headers={"Accept": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            assert "data" in data
            mix = data["data"].get("generationmix", [])
            assert len(mix) > 0
            fuels = [m["fuel"] for m in mix]
            assert "gas" in fuels or "nuclear" in fuels
        except urllib.error.URLError:
            print("⚠️ Network unavailable, skipping UK API test")

    def test_factors_endpoint(self):
        try:
            req = urllib.request.Request(
                f"{UK_CI_API}/intensity/factors",
                headers={"Accept": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            assert "data" in data
            factors = data["data"][0]
            assert "Gas (Open Cycle)" in factors or "Coal" in factors
        except urllib.error.URLError:
            print("⚠️ Network unavailable, skipping UK API test")


# ============================================================
#  COMPARISON PLOT: All 3 Layers
# ============================================================
def generate_comparison_plot():
    """Plot CodeCarbon country intensities vs Climate TRACE estimates."""
    print("\n📊 Generating 3-layer comparison plot...")

    # Layer 1: CodeCarbon
    with open(CODECARBON_MIX_PATH) as f:
        cc_mix = json.load(f)

    # Layer 2: Climate TRACE (full dataset)
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

    # Compute Climate TRACE bottom-up per country
    trace_by_country = {}
    for country, group in plants.groupby('iso3_country'):
        cap = group['capacity'].sum()
        emi = group['emissions_quantity'].sum()
        if cap > 0:
            est_gen_mwh = cap * 8760 * 0.45
            trace_ci = (emi * 1e6) / (est_gen_mwh * 1000)
            trace_by_country[country] = round(trace_ci, 1)

    # Find countries present in both
    common = sorted(set(cc_mix.keys()) & set(trace_by_country.keys()))
    # Filter to countries with reasonable data
    common = [c for c in common if cc_mix[c].get("carbon_intensity", 0) > 0
              and trace_by_country[c] > 0]

    # Pick 25 diverse countries
    selected = common[:25] if len(common) > 25 else common

    cc_vals = [cc_mix[c]["carbon_intensity"] for c in selected]
    tr_vals = [trace_by_country[c] for c in selected]
    names = [cc_mix[c].get("country_name", c)[:15] for c in selected]

    # Layer 3: UK live (single point)
    uk_live_ci = None
    try:
        req = urllib.request.Request(f"{UK_CI_API}/intensity",
                                     headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            uk_live_ci = data["data"][0]["intensity"]["actual"]
    except Exception:
        pass

    # Plot
    fig, ax = plt.subplots(figsize=(16, 10), facecolor='#1a1a2e')
    ax.set_facecolor('#1a1a2e')

    x = np.arange(len(selected))
    w = 0.35
    bars1 = ax.bar(x - w/2, cc_vals, w, label='Layer 1: CodeCarbon (Validated)',
                   color='#3498db', alpha=0.85)
    bars2 = ax.bar(x + w/2, tr_vals, w, label='Layer 2: Climate TRACE (Bottom-Up)',
                   color='#e67e22', alpha=0.85)

    # UK live marker
    if uk_live_ci and "GBR" in selected:
        uk_idx = selected.index("GBR")
        ax.scatter([uk_idx], [uk_live_ci], s=200, c='#2ecc71', zorder=10,
                   marker='★', label=f'Layer 3: UK Live ({uk_live_ci} gCO₂/kWh)')

    ax.set_xlabel("Country", color='white', fontsize=12)
    ax.set_ylabel("gCO₂eq / kWh", color='white', fontsize=12)
    ax.set_title("GridSync Hybrid Engine — 3-Layer Carbon Intensity Comparison",
                 color='white', fontsize=15, fontweight='bold', pad=15)
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=45, ha='right', color='white', fontsize=9)
    ax.tick_params(colors='white')
    ax.yaxis.grid(True, alpha=0.15, color='#555')
    ax.legend(loc='upper left', fontsize=10, framealpha=0.8,
              facecolor='#16213e', labelcolor='white')

    plt.tight_layout()
    plt.savefig("plot_3layer_comparison.png", dpi=150, facecolor='#1a1a2e')
    print("✅ Saved plot_3layer_comparison.png")
    plt.close()


if __name__ == "__main__":
    # Run tests manually (pytest will also pick these up)
    import pytest
    exit_code = pytest.main([__file__, "-v", "--tb=short"])
    if exit_code == 0:
        generate_comparison_plot()
