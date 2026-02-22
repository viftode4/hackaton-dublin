// frontend/src/lib/regression-model.ts

// ── Model coefficients from trained_model.json ──────────────────────
const MODEL = {
  features: [
    'country_ci', 'emissions_per_capacity', 'local_pct_coal',
    'local_pct_clean', 'idw_weighted_ci', 'country_ci_sq', 'emaps_zone_ci',
  ],
  scaler_mean: [362.909, 1349.833, 0.093, 0.682, 683.903, 186.404, 365.001],
  scaler_scale: [233.883, 968.316, 0.115, 0.224, 227.233, 201.939, 214.582],
  coefficients: [224.678, -17.126, 51.300, -4.456, 10.280, -84.809, 28.406],
  intercept: 332.952,
} as const;

// ── Scenario definitions ────────────────────────────────────────────
export type ScenarioId = 'bau' | 'net_zero' | 'accelerated';

export interface Scenario {
  id: ScenarioId;
  label: string;
  coalDeclineRate: number;
  cleanGrowthRate: number;
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  bau:         { id: 'bau',         label: 'Business as Usual',      coalDeclineRate: 0.01, cleanGrowthRate: 0.01 },
  net_zero:    { id: 'net_zero',    label: 'Net Zero 2050',          coalDeclineRate: 0.04, cleanGrowthRate: 0.04 },
  accelerated: { id: 'accelerated', label: 'Accelerated Transition', coalDeclineRate: 0.06, cleanGrowthRate: 0.06 },
};

// ── Feature vector for a single location ────────────────────────────
export interface LocationFeatures {
  country_ci: number;
  emissions_per_capacity: number;
  local_pct_coal: number;
  local_pct_clean: number;
  idw_weighted_ci: number;
  emaps_zone_ci: number;
}

// ── Core prediction ─────────────────────────────────────────────────
export function predictCO2(features: LocationFeatures): number {
  const raw = [
    features.country_ci,
    features.emissions_per_capacity,
    features.local_pct_coal,
    features.local_pct_clean,
    features.idw_weighted_ci,
    features.country_ci ** 2,
    features.emaps_zone_ci,
  ];

  let prediction = MODEL.intercept;
  for (let i = 0; i < raw.length; i++) {
    const scaled = (raw[i] - MODEL.scaler_mean[i]) / MODEL.scaler_scale[i];
    prediction += MODEL.coefficients[i] * scaled;
  }

  return Math.max(10, Math.min(1200, prediction));
}

// ── Project features to a future year under a scenario ──────────────
export function projectFeatures(
  base: LocationFeatures,
  year: number,
  scenario: Scenario,
): LocationFeatures {
  const dt = year - 2025;
  if (dt <= 0) return base;

  const coalFactor = Math.pow(1 - scenario.coalDeclineRate, dt);
  const cleanFactor = Math.pow(1 + scenario.cleanGrowthRate, dt);

  const pctCoal = Math.max(0, Math.min(1, base.local_pct_coal * coalFactor));
  const pctClean = Math.max(0, Math.min(1, base.local_pct_clean * cleanFactor));

  const fossilDecay = coalFactor;
  const ciDecay = 1 - (1 - coalFactor) * 0.8;

  return {
    country_ci: base.country_ci * ciDecay,
    emissions_per_capacity: base.emissions_per_capacity * fossilDecay,
    local_pct_coal: pctCoal,
    local_pct_clean: pctClean,
    idw_weighted_ci: base.idw_weighted_ci * ciDecay,
    emaps_zone_ci: base.emaps_zone_ci * ciDecay,
  };
}

// ── Convenience: predict CO2 for a location at a future year ────────
export function predictCO2AtYear(
  base: LocationFeatures,
  year: number,
  scenario: Scenario,
): number {
  const projected = projectFeatures(base, year, scenario);
  return predictCO2(projected);
}

// ── Extract features from COUNTRY_DATA entry ────────────────────────
export function countryDataToFeatures(
  co2Intensity: number,
  energyMix: string,
): LocationFeatures {
  const { pctCoal, pctClean } = parseEnergyMixFractions(energyMix);

  return {
    country_ci: co2Intensity,
    emissions_per_capacity: co2Intensity * 3.5,
    local_pct_coal: pctCoal,
    local_pct_clean: pctClean,
    idw_weighted_ci: co2Intensity * 1.1,
    emaps_zone_ci: co2Intensity,
  };
}

// ── Parse energy mix string to get coal and clean fractions ─────────
export function parseEnergyMixFractions(mix: string): { pctCoal: number; pctClean: number } {
  let pctCoal = 0;
  let pctClean = 0;

  const parts = mix.split('/').map(s => s.trim().toLowerCase());
  for (const part of parts) {
    const match = part.match(/^(\d+)%?\s*(.+)/);
    if (!match) continue;
    const pct = parseInt(match[1], 10) / 100;
    const source = match[2].trim();

    if (source.includes('coal')) pctCoal += pct;
    if (['hydro', 'nuclear', 'wind', 'solar', 'geo', 'geothermal'].some(s => source.includes(s))) {
      pctClean += pct;
    }
  }

  return { pctCoal, pctClean };
}
