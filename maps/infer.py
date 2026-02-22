#!/usr/bin/env python3
"""
GridSync Inference CLI — predict carbon intensity from (lat, lon, year).

Usage:
    python3 infer.py --lat 48.86 --lon 2.35 --year 2028
    python3 infer.py --lat 51.5 --lon 14.5                   # defaults to 2024
    python3 infer.py --lat 37.0 --lon -79.0 --year 2030 --mw 100
"""

import argparse
import numpy as np


def main():
    parser = argparse.ArgumentParser(
        description="Predict carbon intensity (gCO₂/kWh) for a location and year"
    )
    parser.add_argument("--lat", type=float, required=True, help="Latitude")
    parser.add_argument("--lon", type=float, required=True, help="Longitude")
    parser.add_argument("--year", type=int, default=2024, help="Target year (default: 2024)")
    parser.add_argument("--mw", type=float, default=None,
                        help="IT load in MW (optional — also compute annual footprint)")
    args = parser.parse_args()

    from geo_estimator import predict_ci, estimate_pue

    ci = predict_ci(args.lat, args.lon, args.year)

    print(f"\n{'─' * 50}")
    print(f"  Location:  ({args.lat}, {args.lon})")
    print(f"  Year:      {args.year}")
    print(f"  CI:        {ci:.1f} gCO₂/kWh")

    if args.mw is not None:
        pue = estimate_pue(args.lat)
        fp = args.mw * pue * ci * 8.76
        print(f"  IT Load:   {args.mw} MW  (PUE={pue:.2f})")
        print(f"  Footprint: {fp:,.0f} tCO₂/year")
    print(f"{'─' * 50}\n")


if __name__ == "__main__":
    main()
