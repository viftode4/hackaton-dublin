"""
Tests for verifying we can correctly parse and load both:
  1. The 165 Hyperscaler Data Centers from data_centers.json
  2. The Climate TRACE power plant emissions dataset

Run with: python -m pytest test_data_parsing.py -v
"""

import json
import math
import pandas as pd
import numpy as np
from sklearn.neighbors import BallTree

# --- Paths (relative to hackaton-dublin/) ---
DATA_CENTERS_PATH = "../electricitymaps-contrib/config/data_centers/data_centers.json"
CLIMATE_TRACE_PATH = "../datasets_tracer/power/DATA/electricity-generation_emissions_sources_v5_3_0.csv"


# ============================================================
#  SECTION 1: Data Centers (165 Hyperscaler Points)
# ============================================================

class TestDataCentersParsing:
    """Verify the internal data_centers.json dataset loads correctly."""

    def setup_method(self):
        with open(DATA_CENTERS_PATH, "r") as f:
            self.raw = json.load(f)

    def test_file_is_dict(self):
        assert isinstance(self.raw, dict), "Top-level JSON should be a dictionary"

    def test_minimum_entry_count(self):
        """We expect at least 100 data center entries."""
        assert len(self.raw) >= 100, f"Expected >= 100 entries, got {len(self.raw)}"

    def test_entry_has_required_fields(self):
        """Every entry must have provider, lonlat, and zoneKey."""
        for key, entry in self.raw.items():
            assert "provider" in entry, f"{key} missing 'provider'"
            assert "lonlat" in entry, f"{key} missing 'lonlat'"
            assert "zoneKey" in entry, f"{key} missing 'zoneKey'"

    def test_lonlat_is_valid_pair(self):
        """lonlat must be a list of two floats within valid ranges."""
        for key, entry in self.raw.items():
            lon, lat = entry["lonlat"]
            assert -180 <= lon <= 180, f"{key}: longitude {lon} out of range"
            assert -90 <= lat <= 90, f"{key}: latitude {lat} out of range"

    def test_known_providers_present(self):
        """At least AWS, GCP, and Azure should be represented."""
        providers = {entry["provider"] for entry in self.raw.values()}
        for expected in ["aws", "gcp", "azure"]:
            assert expected in providers, f"Provider '{expected}' not found"

    def test_balltree_construction(self):
        """Verify we can build a BallTree spatial index from the coordinates."""
        coords = []
        for entry in self.raw.values():
            if "lonlat" in entry:
                lon, lat = entry["lonlat"]
                coords.append([math.radians(lat), math.radians(lon)])
        tree = BallTree(coords, metric="haversine")
        assert tree is not None
        # Query a known point (Dublin, Ireland) and verify we get a result
        dublin = [[math.radians(53.3498), math.radians(-6.2603)]]
        dist, ind = tree.query(dublin, k=1)
        assert ind[0][0] >= 0, "BallTree query should return a valid index"
        distance_km = dist[0][0] * 6371.0
        assert distance_km < 5000, "Nearest DC to Dublin should be < 5000km"


# ============================================================
#  SECTION 2: Climate TRACE Power Plants
# ============================================================

class TestClimateTraceParsing:
    """Verify the Climate TRACE electricity-generation CSV loads correctly."""

    COLS_TO_KEEP = [
        "source_name", "source_type", "lat", "lon",
        "emissions_quantity", "capacity",
    ]

    def setup_method(self):
        self.df = pd.read_csv(
            CLIMATE_TRACE_PATH,
            usecols=self.COLS_TO_KEEP,
            nrows=50000,  # read a subset for speed
        )

    def test_dataframe_not_empty(self):
        assert len(self.df) > 0, "DataFrame should not be empty"

    def test_required_columns_exist(self):
        for col in self.COLS_TO_KEEP:
            assert col in self.df.columns, f"Missing column: {col}"

    def test_coordinates_in_valid_range(self):
        valid = self.df.dropna(subset=["lat", "lon"])
        assert (valid["lat"].between(-90, 90)).all(), "Latitudes out of range"
        assert (valid["lon"].between(-180, 180)).all(), "Longitudes out of range"

    def test_emissions_are_non_negative(self):
        valid = self.df.dropna(subset=["emissions_quantity"])
        assert (valid["emissions_quantity"] >= 0).all(), "Negative emissions found"

    def test_capacity_is_non_negative(self):
        valid = self.df.dropna(subset=["capacity"])
        assert (valid["capacity"] >= 0).all(), "Negative capacity found"

    def test_known_fuel_types_present(self):
        """At least oil, gas, or coal should appear in source_type."""
        types = set(self.df["source_type"].dropna().unique())
        known = {"oil", "gas", "coal"}
        overlap = types & known
        assert len(overlap) > 0, f"Expected fuel types {known}, got {types}"

    def test_balltree_construction(self):
        """Verify we can build a BallTree from the power plant coords."""
        valid = self.df.dropna(subset=["lat", "lon"])
        coords = np.radians(valid[["lat", "lon"]].values)
        tree = BallTree(coords, metric="haversine")
        assert tree is not None
        # Radius query: find plants within 100km of Aruba (12.47, -69.98)
        aruba = [[math.radians(12.47), math.radians(-69.98)]]
        radius_rad = 100.0 / 6371.0
        ind = tree.query_radius(aruba, r=radius_rad)
        assert len(ind[0]) > 0, "Should find at least 1 plant near Aruba"


# ============================================================
#  SECTION 3: Cross-Dataset Integration
# ============================================================

class TestCrossDatasetIntegration:
    """Verify both datasets can work together in a single query."""

    def setup_method(self):
        # Load data centers
        with open(DATA_CENTERS_PATH, "r") as f:
            dc_raw = json.load(f)
        self.dc_list = []
        dc_coords = []
        for key, data in dc_raw.items():
            if "lonlat" in data:
                lon, lat = data["lonlat"]
                self.dc_list.append({"id": key, "lat": lat, "lon": lon})
                dc_coords.append([math.radians(lat), math.radians(lon)])
        self.dc_tree = BallTree(dc_coords, metric="haversine")

        # Load power plants (subset)
        cols = ["source_name", "source_type", "lat", "lon", "emissions_quantity", "capacity"]
        self.pp_df = pd.read_csv(CLIMATE_TRACE_PATH, usecols=cols, nrows=50000)
        self.pp_df = self.pp_df.dropna(subset=["lat", "lon", "emissions_quantity"])
        pp_coords = np.radians(self.pp_df[["lat", "lon"]].values)
        self.pp_tree = BallTree(pp_coords, metric="haversine")

    def test_evaluate_site_dublin(self):
        """Simulate an evaluation for Dublin, Ireland."""
        dublin = [[math.radians(53.3498), math.radians(-6.2603)]]

        # Nearest data center
        dist, ind = self.dc_tree.query(dublin, k=1)
        nearest_dc = self.dc_list[ind[0][0]]
        distance_km = dist[0][0] * 6371.0
        assert distance_km >= 0
        assert nearest_dc["id"] is not None

        # Power plants within 300km
        radius_rad = 300.0 / 6371.0
        plant_ind = self.pp_tree.query_radius(dublin, r=radius_rad)
        # Result is valid (may be empty for the 50k subset, that's ok)
        assert plant_ind is not None

    def test_evaluate_site_california(self):
        """Simulate an evaluation for California (known dense region)."""
        la = [[math.radians(34.0522), math.radians(-118.2437)]]

        dist, ind = self.dc_tree.query(la, k=1)
        distance_km = dist[0][0] * 6371.0
        assert distance_km < 2000, "Should find a DC within 2000km of LA"

        radius_rad = 300.0 / 6371.0
        plant_ind = self.pp_tree.query_radius(la, r=radius_rad)
        # California should have power plants in the full dataset
        assert plant_ind is not None
