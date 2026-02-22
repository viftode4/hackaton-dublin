"""
Test the Electricity Maps REST API directly.

Queries the Carbon Intensity endpoint for multiple zones,
compares results with our Climate TRACE bottom-up estimates,
and plots the comparison.

To use with a free API token:
  1. Register at https://api-portal.electricitymaps.com/
  2. Set your token: export EMAPS_TOKEN="your-token-here"
  3. Run: python3 test_emaps_api.py

Without a token, the script will attempt the free-tier endpoint.

Output: plot_api_vs_trace.png
"""

import os
import json
import urllib.request
import urllib.error
import time
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

API_BASE = "https://api.electricitymaps.com/v3"
TOKEN = os.environ.get("EMAPS_TOKEN", "")

# Zones to test with their ISO3 country code (for Climate TRACE matching)
ZONES = [
    ("IE", "IRL"),       # Ireland
    ("FR", "FRA"),       # France
    ("DE", "DEU"),       # Germany
    ("GB", "GBR"),       # Great Britain
    ("ES", "ESP"),       # Spain
    ("PL", "POL"),       # Poland
    ("SE", "SWE"),       # Sweden
    ("NO-NO1", "NOR"),   # Norway
    ("DK-DK1", "DNK"),   # Denmark
    ("PT", "PRT"),       # Portugal
    ("IT-NO", "ITA"),    # Italy North
    ("AT", "AUT"),       # Austria
    ("BE", "BEL"),       # Belgium
    ("NL", "NLD"),       # Netherlands
    ("FI", "FIN"),       # Finland
    ("US-CAL-CISO", "USA"),  # California
    ("AU-NSW", "AUS"),   # Australia NSW
    ("JP-TK", "JPN"),    # Japan Tokyo
    ("KR", "KOR"),       # South Korea
    ("IN-NO", "IND"),    # India North
    ("BR-S", "BRA"),     # Brazil South
    ("ZA", "ZAF"),       # South Africa
]


def query_carbon_intensity(zone: str) -> dict | None:
    """Query the Electricity Maps API for latest carbon intensity."""
    url = f"{API_BASE}/carbon-intensity/latest?zone={zone}"
    headers = {"Accept": "application/json"}
    if TOKEN:
        headers["auth-token"] = TOKEN

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return data
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return {"error": "AUTH_REQUIRED"}
        elif e.code == 403:
            return {"error": "FORBIDDEN"}
        elif e.code == 429:
            return {"error": "RATE_LIMITED"}
        else:
            return {"error": f"HTTP_{e.code}"}
    except Exception as e:
        return {"error": str(e)}


def query_power_breakdown(zone: str) -> dict | None:
    """Query the Electricity Maps API for power breakdown (fuel mix)."""
    url = f"{API_BASE}/power-breakdown/latest?zone={zone}"
    headers = {"Accept": "application/json"}
    if TOKEN:
        headers["auth-token"] = TOKEN

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return data
    except Exception:
        return None


def test_all_zones():
    """Query all zones and collect results."""
    results = []
    errors = []

    auth_status = "🔑 Using API token" if TOKEN else "🔓 No token (free tier)"
    print(f"  {auth_status}\n")

    for zone, iso3 in ZONES:
        print(f"  [{zone:15s}] ", end="", flush=True)

        data = query_carbon_intensity(zone)
        if data is None:
            print("TIMEOUT")
            errors.append((zone, "timeout"))
            continue

        if "error" in data:
            err = data["error"]
            if err == "AUTH_REQUIRED":
                print("❌ Auth required (set EMAPS_TOKEN)")
            elif err == "RATE_LIMITED":
                print("⏳ Rate limited, waiting 2s...")
                time.sleep(2)
            else:
                print(f"ERROR: {err}")
            errors.append((zone, err))
            continue

        ci = data.get("carbonIntensity")
        if ci is None:
            print("NO DATA")
            errors.append((zone, "no carbonIntensity"))
            continue

        # Also try to get the power breakdown
        breakdown = query_power_breakdown(zone)
        fuel_mix = {}
        if breakdown and "powerConsumptionBreakdown" in breakdown:
            fuel_mix = {k: v for k, v in breakdown["powerConsumptionBreakdown"].items()
                       if v and v > 0 and k not in ["unknown"]}

        results.append({
            "zone": zone,
            "iso3": iso3,
            "carbon_intensity": ci,
            "datetime": data.get("datetime", "?"),
            "fuel_mix": fuel_mix,
            "fossil_pct": data.get("fossilFuelPercentage"),
        })
        print(f"✅ {ci:.0f} gCO2eq/kWh")

        time.sleep(0.3)  # be nice to the API

    return results, errors


def plot_api_results(results):
    """Bar chart of API carbon intensity results."""
    if not results:
        print("No results to plot!")
        return

    results.sort(key=lambda x: x["carbon_intensity"])
    zones = [r["zone"] for r in results]
    values = [r["carbon_intensity"] for r in results]

    # Color gradient
    cmap = plt.cm.RdYlGn_r
    norm = plt.Normalize(min(values), max(values))
    colors = [cmap(norm(v)) for v in values]

    fig, ax = plt.subplots(figsize=(14, max(8, len(results) * 0.4)),
                           facecolor='#1a1a2e')
    ax.set_facecolor('#1a1a2e')

    bars = ax.barh(zones, values, color=colors, edgecolor='none', height=0.7)

    for bar, val in zip(bars, values):
        ax.text(bar.get_width() + 5, bar.get_y() + bar.get_height()/2,
                f'{val:.0f}', va='center', color='#ddd', fontsize=10,
                fontweight='bold')

    ax.set_xlabel("gCO₂eq / kWh (Live from Electricity Maps API)",
                  color='white', fontsize=12)
    ax.set_title("Real-Time Carbon Intensity by Zone\n"
                 "(Electricity Maps API — Live Data)",
                 color='white', fontsize=14, fontweight='bold', pad=15)
    ax.tick_params(colors='white', labelsize=11)
    ax.xaxis.grid(True, alpha=0.15, color='#555')
    ax.set_xlim(0, max(values) * 1.15)

    plt.tight_layout()
    plt.savefig("plot_api_co2_regions.png", dpi=150, facecolor='#1a1a2e')
    print(f"\n✅ Saved plot_api_co2_regions.png")
    plt.close()


def print_summary(results, errors):
    """Print results table."""
    print(f"\n{'='*65}")
    print(f"{'Zone':18s}  {'gCO2eq/kWh':>11s}  {'Fossil %':>9s}  {'Timestamp'}")
    print(f"{'='*65}")
    for r in sorted(results, key=lambda x: x['carbon_intensity']):
        icon = "🟢" if r['carbon_intensity'] < 100 else "🟡" if r['carbon_intensity'] < 300 else "🔴"
        fossil = f"{r['fossil_pct']:.0f}%" if r['fossil_pct'] else "N/A"
        print(f"  {icon} {r['zone']:16s}  {r['carbon_intensity']:10.0f}  {fossil:>8s}  {r['datetime'][:19]}")

    if errors:
        print(f"\n⚠️  {len(errors)} zones had errors:")
        for zone, err in errors:
            print(f"  ❌ {zone}: {err}")

    print(f"\n✅ {len(results)} zones queried successfully")
    if not TOKEN:
        print(f"\n💡 To unlock all zones, register for a free API token at:")
        print(f"   https://api-portal.electricitymaps.com/")
        print(f"   Then: export EMAPS_TOKEN='your-token'")


if __name__ == "__main__":
    print("=" * 60)
    print("Electricity Maps API — Live Carbon Intensity Test")
    print("=" * 60)
    print()

    results, errors = test_all_zones()
    print_summary(results, errors)
    plot_api_results(results)
