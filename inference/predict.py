"""
Carbon Intensity Inference — GridSync Regression Model

Loads `trained_model.json` and predicts carbon intensity (gCO₂/kWh)
for a data-center location given four input features.

Usage:
    python predict.py                          # run built-in examples
    python predict.py --country_ci 500 --epc 2200 --pct_coal 0.4 --pct_clean 0.1

Features (what to pass):
    country_ci           – National grid carbon intensity (gCO₂/kWh)
                           Source: CodeCarbon global_energy_mix.json
    emissions_per_capacity – Total plant emissions / total capacity
                           within 300 km (from Climate TRACE power plants)
    local_pct_coal       – Fraction of power plants within 300 km that
                           are coal-fired  (0–1)
    local_pct_clean      – Fraction of power plants within 300 km that
                           are clean/renewable  (0–1)

Output:
    Predicted carbon intensity in gCO₂/kWh and annual footprint
    estimate for a 50 MW data center.
"""

import json
import argparse
import os
import sys
import numpy as np


MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "trained_model.json")


def load_model(path: str = MODEL_PATH) -> dict:
    """Load the trained regression model from JSON."""
    with open(path) as f:
        return json.load(f)


def predict_ci(
    model: dict,
    country_ci: float,
    emissions_per_capacity: float,
    local_pct_coal: float,
    local_pct_clean: float,
) -> float:
    """
    Predict carbon intensity (gCO₂/kWh) using the trained Ridge model.

    Formula:  CI = dot(coefficients, scale(X)) + intercept
    where scale(X) = (X - mean) / std
    """
    x = np.array([country_ci, emissions_per_capacity, local_pct_coal, local_pct_clean])
    mean = np.array(model["scaler_mean"])
    scale = np.array(model["scaler_scale"])
    coefs = np.array(model["coefficients"])
    intercept = model["intercept"]

    x_scaled = (x - mean) / scale
    ci = float(np.dot(coefs, x_scaled) + intercept)
    return max(0.0, ci)


def annual_footprint_tonnes(ci_gco2_kwh: float, it_load_mw: float = 50.0, pue: float = 1.58) -> float:
    """
    Estimate annual CO₂ emissions (tonnes/yr).

    Formula: IT_Load_MW × PUE × CI × 8.76
    (8.76 = 8760 hours × 1e-6 to convert g→tonnes and kW→MW)
    """
    return it_load_mw * pue * ci_gco2_kwh * 8.76


# ---------------------------------------------------------------------------
#  Example locations for quick testing
# ---------------------------------------------------------------------------
EXAMPLES = [
    {
        "name": "Paris, France",
        "country_ci": 85.0,
        "emissions_per_capacity": 800.0,
        "local_pct_coal": 0.05,
        "local_pct_clean": 0.65,
    },
    {
        "name": "Virginia, USA",
        "country_ci": 379.0,
        "emissions_per_capacity": 2100.0,
        "local_pct_coal": 0.25,
        "local_pct_clean": 0.18,
    },
    {
        "name": "Sydney, Australia",
        "country_ci": 510.0,
        "emissions_per_capacity": 2400.0,
        "local_pct_coal": 0.40,
        "local_pct_clean": 0.10,
    },
    {
        "name": "Stockholm, Sweden",
        "country_ci": 45.0,
        "emissions_per_capacity": 300.0,
        "local_pct_coal": 0.0,
        "local_pct_clean": 0.80,
    },
    {
        "name": "Mumbai, India",
        "country_ci": 632.0,
        "emissions_per_capacity": 3100.0,
        "local_pct_coal": 0.55,
        "local_pct_clean": 0.05,
    },
]


def main():
    parser = argparse.ArgumentParser(
        description="Predict carbon intensity using the GridSync trained model"
    )
    parser.add_argument("--model", default=MODEL_PATH, help="Path to trained_model.json")
    parser.add_argument("--country_ci", type=float, help="National grid CI (gCO₂/kWh)")
    parser.add_argument("--epc", type=float, help="Emissions per capacity (300 km radius)")
    parser.add_argument("--pct_coal", type=float, help="Local coal plant fraction (0–1)")
    parser.add_argument("--pct_clean", type=float, help="Local clean plant fraction (0–1)")
    parser.add_argument("--load_mw", type=float, default=50.0, help="IT load in MW (default: 50)")
    parser.add_argument("--pue", type=float, default=1.58, help="PUE (default: 1.58)")
    args = parser.parse_args()

    model = load_model(args.model)
    print(f"Model: {model['model_type']}  |  Features: {model['features']}")
    print(f"Training: {model['training_samples']} samples  |  LOO MAE: {model['loo_mae']:.1f} gCO₂/kWh  |  R²: {model['loo_r2']:.3f}")
    print()

    # If user provided all 4 features, predict that single point
    if all(v is not None for v in [args.country_ci, args.epc, args.pct_coal, args.pct_clean]):
        ci = predict_ci(model, args.country_ci, args.epc, args.pct_coal, args.pct_clean)
        fp = annual_footprint_tonnes(ci, args.load_mw, args.pue)
        print(f"  Predicted CI:  {ci:.1f} gCO₂/kWh")
        print(f"  Annual CO₂:   {fp:,.0f} tonnes/yr  ({args.load_mw} MW, PUE {args.pue})")
        return

    # Otherwise run built-in examples
    print(f"{'Location':<22} {'CI (gCO₂/kWh)':>14} {'Annual tCO₂':>12}  Grade")
    print("-" * 68)
    for ex in EXAMPLES:
        ci = predict_ci(model, ex["country_ci"], ex["emissions_per_capacity"],
                        ex["local_pct_coal"], ex["local_pct_clean"])
        fp = annual_footprint_tonnes(ci, args.load_mw, args.pue)
        grade = ("A" if ci < 100 else "B" if ci < 250 else "C" if ci < 400
                 else "D" if ci < 550 else "E" if ci < 700 else "F")
        print(f"  {ex['name']:<20} {ci:>12.1f}   {fp:>10,.0f}    {grade}")


if __name__ == "__main__":
    main()
