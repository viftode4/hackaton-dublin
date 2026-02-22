with open("geo_estimator.py", "r") as f:
    code = f.read()

# 1. Add globals
old_globals = "CODECARBON_MIX = {}\nFUEL_WEIGHTS = {}       # gCO2eq/kWh per fuel type from CodeCarbon"
new_globals = """CODECARBON_USA_PATH = "../codecarbon/codecarbon/data/private_infra/2016/usa_emissions.json"
CODECARBON_CAN_PATH = "../codecarbon/codecarbon/data/private_infra/2023/canada_energy_mix.json"
REGRESSION_MODEL_PATH = "trained_model.json"

CODECARBON_MIX = {}
FUEL_WEIGHTS = {}       # gCO2eq/kWh per fuel type from CodeCarbon
USA_EMISSIONS = {}
CAN_EMISSIONS = {}
REGRESSION_MODEL = {}"""
code = code.replace(old_globals, new_globals)

# 2. Update load_codecarbon
old_load = """def load_codecarbon():
    global CODECARBON_MIX, FUEL_WEIGHTS
    print("[Layer 1] Loading CodeCarbon data...")
    with open(CODECARBON_MIX_PATH) as f:
        CODECARBON_MIX = json.load(f)
    with open(CODECARBON_FUEL_PATH) as f:
        FUEL_WEIGHTS = json.load(f)
    print(f"  ✅ {len(CODECARBON_MIX)} countries, {len(FUEL_WEIGHTS)} fuel-type weights")
    print(f"     Fuel weights: coal={FUEL_WEIGHTS.get('coal')}, "
          f"gas={FUEL_WEIGHTS.get('natural_gas')}, "
          f"solar={FUEL_WEIGHTS.get('solar')}, "
          f"wind={FUEL_WEIGHTS.get('wind')} gCO2/kWh")"""

new_load = """def load_codecarbon():
    global CODECARBON_MIX, FUEL_WEIGHTS, USA_EMISSIONS, CAN_EMISSIONS, REGRESSION_MODEL
    print("[Layer 1] Loading CodeCarbon data...")
    with open(CODECARBON_MIX_PATH) as f:
        CODECARBON_MIX = json.load(f)
    with open(CODECARBON_FUEL_PATH) as f:
        FUEL_WEIGHTS = json.load(f)
    try:
        with open(CODECARBON_USA_PATH) as f:
            USA_EMISSIONS = json.load(f)
        with open(CODECARBON_CAN_PATH) as f:
            CAN_EMISSIONS = json.load(f)
        with open(REGRESSION_MODEL_PATH) as f:
            REGRESSION_MODEL = json.load(f)
        print(f"  ✅ {len(CODECARBON_MIX)} countries, {len(USA_EMISSIONS)} states, {len(CAN_EMISSIONS)} provinces")
        print(f"  ✅ Trained Regression Model loaded")
    except Exception as e:
        print(f"  ⚠️ Could not load sub-national data: {e}")"""
code = code.replace(old_load, new_load)

with open("geo_estimator.py", "w") as f:
    f.write(code)
print("Updated globals and load function!")
