// frontend/src/lib/regression-model.ts
// New model (MAE 51.1, R²=0.896) — 6 features, all derivable from country_ci + energy mix

// ── Model coefficients from trained_model.json ──────────────────────
const MODEL = {
  features: [
    'country_ci', 'emaps_zone_ci', 'sqrt_zone_ci',
    'zone_x_country', 'country_ci_sq', 'country_coal_frac',
  ],
  scaler_mean: [364.878, 362.808, 17.756, 190.842, 192.305, 0.224],
  scaler_scale: [243.247, 241.307, 6.893, 210.740, 212.303, 0.243],
  coefficients: [50.404, 50.659, 113.527, -29.055, -28.720, 55.165],
  intercept: 333.214,
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
  country_ci: number;      // country-level carbon intensity (gCO₂/kWh)
  emaps_zone_ci: number;   // zone-level carbon intensity
  country_coal_frac: number; // fraction of electricity from coal (0-1)
}

// ── Core prediction ─────────────────────────────────────────────────
export function predictCO2(features: LocationFeatures): number {
  const { country_ci, emaps_zone_ci, country_coal_frac } = features;

  // Derived features (matching training pipeline in geo_estimator.py)
  const sqrt_zone_ci = Math.sqrt(Math.max(0, emaps_zone_ci));
  const zone_x_country = emaps_zone_ci * country_ci / 1000;
  const country_ci_sq = country_ci ** 2 / 1000;

  const raw = [
    country_ci,
    emaps_zone_ci,
    sqrt_zone_ci,
    zone_x_country,
    country_ci_sq,
    country_coal_frac,
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
  const ciDecay = 1 - (1 - coalFactor) * 0.8;

  return {
    country_ci: base.country_ci * ciDecay,
    emaps_zone_ci: base.emaps_zone_ci * ciDecay,
    country_coal_frac: Math.max(0, base.country_coal_frac * coalFactor),
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
  const coalFrac = parseCoalFraction(energyMix);

  return {
    country_ci: co2Intensity,
    emaps_zone_ci: co2Intensity, // approximate: zone CI ≈ country CI
    country_coal_frac: coalFrac,
  };
}

// ── Parse energy mix string to get coal fraction ────────────────────
export function parseCoalFraction(mix: string): number {
  let coalPct = 0;
  // Handle both comma-separated and slash-separated formats
  const parts = mix.split(/[,\/]/).map(s => s.trim().toLowerCase());
  for (const part of parts) {
    const match = part.match(/(\d+)%?\s*(.*)/);
    if (!match) continue;
    const pct = parseInt(match[1], 10) / 100;
    const source = match[2].trim();
    if (source.includes('coal') || source.includes('lignite')) coalPct += pct;
  }
  return coalPct;
}
