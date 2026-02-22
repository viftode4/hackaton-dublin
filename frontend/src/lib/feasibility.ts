/**
 * Unified cross-body feasibility scoring engine.
 * Computes a normalized 0-100 score for any datacenter location
 * across Earth, Orbit, Moon, and Mars — enabling apples-to-apples comparison.
 */

export interface FeasibilityScore {
  overall: number;        // 0-100 composite
  power: number;          // 0-100 (energy availability and reliability)
  cooling: number;        // 0-100 (thermal management effectiveness)
  connectivity: number;   // 0-100 (latency, bandwidth, reliability)
  resilience: number;     // 0-100 (radiation, disasters, political stability)
  cost: number;           // 0-100 (construction + operational)
  body: string;
}

interface LocationInput {
  body: string;
  // Earth-specific
  carbon_intensity_gco2?: number;
  energy_cost_kwh?: number;
  disaster_risk?: number;
  political_stability?: number;
  // Orbit-specific
  eclipse_fraction?: number;
  radiation_level?: string;
  power_availability_w?: number;
  latency_ms?: number;
  altitude_km?: number;
  // Moon-specific
  illumination_pct?: number;
  avg_temperature_c?: number;
  ice_proximity_km?: number;
  earth_visible?: boolean;
  // Mars-specific
  solar_irradiance_w?: number;
  dust_storms_per_year?: number;
  elevation_km?: number;
  // Shared
  construction_cost_mw?: number;
}

/** Clamp a value to 0-100 */
function clamp(v: number): number {
  return Math.round(Math.max(0, Math.min(100, v)));
}

function scoreEarth(loc: LocationInput): FeasibilityScore {
  const ci = loc.carbon_intensity_gco2 ?? 300;
  const cost = loc.energy_cost_kwh ?? 0.10;
  const risk = loc.disaster_risk ?? 30;
  const stability = loc.political_stability ?? 70;

  // Power: lower carbon intensity = better (0-700 range → 100-0)
  const power = clamp(100 - (ci / 700) * 100);

  // Cooling: most Earth locations have adequate cooling (slight penalty for hot)
  const temp = loc.avg_temperature_c ?? 15;
  const cooling = clamp(80 + (25 - temp) * 0.8);

  // Connectivity: Earth has best connectivity by default
  const connectivity = 95;

  // Resilience: based on disaster risk and political stability
  const resilience = clamp((100 - risk) * 0.5 + stability * 0.5);

  // Cost: normalized against typical range ($0.03-0.30/kWh)
  const costScore = clamp(100 - ((cost - 0.03) / 0.27) * 100);

  const overall = clamp(power * 0.30 + cooling * 0.10 + connectivity * 0.20 + resilience * 0.20 + costScore * 0.20);
  return { overall, power, cooling, connectivity, resilience, cost: costScore, body: 'earth' };
}

function scoreOrbit(loc: LocationInput): FeasibilityScore {
  const eclipse = loc.eclipse_fraction ?? 0.35;
  const radiation = loc.radiation_level ?? 'low';
  const powerW = loc.power_availability_w ?? 300;
  const latency = loc.latency_ms ?? 5;
  const altitude = loc.altitude_km ?? 400;

  // Power: based on power availability (max ~395 W/m² with no eclipse)
  const power = clamp((powerW / 395) * 100);

  // Cooling: vacuum is excellent for radiative cooling
  const cooling = 90;

  // Connectivity: inversely proportional to latency (2-5000ms range)
  const connectivity = clamp(100 - (Math.log10(Math.max(1, latency)) / Math.log10(5000)) * 100);

  // Resilience: radiation is the key factor
  const radScore = radiation === 'low' ? 85 : radiation === 'moderate' ? 55 : radiation === 'high' ? 25 : 10;
  // Debris risk increases with congested orbits
  const debrisScore = altitude < 600 ? 60 : altitude < 2000 ? 70 : altitude < 36000 ? 80 : 90;
  const resilience = clamp(radScore * 0.7 + debrisScore * 0.3);

  // Cost: orbital construction is extremely expensive
  const buildCost = loc.construction_cost_mw ?? 1e9;
  const costScore = clamp(100 - Math.min(100, (buildCost / 1e10) * 100));

  const overall = clamp(power * 0.30 + cooling * 0.10 + connectivity * 0.25 + resilience * 0.20 + costScore * 0.15);
  return { overall, power, cooling, connectivity, resilience, cost: costScore, body: 'orbit' };
}

function scoreMoon(loc: LocationInput): FeasibilityScore {
  const illumination = loc.illumination_pct ?? 50;
  const temp = loc.avg_temperature_c ?? -50;
  const iceKm = loc.ice_proximity_km ?? 100;
  const earthVis = loc.earth_visible ?? false;

  // Power: directly from illumination percentage (0-100% maps to 0-100)
  const power = clamp(illumination);

  // Cooling: extreme cold is excellent for datacenter cooling
  const cooling = clamp(70 + Math.abs(temp) * 0.3);

  // Connectivity: 1.3s latency to Earth, worse if relay needed
  const baseLatency = earthVis ? 60 : 35; // direct vs relay
  const connectivity = clamp(baseLatency);

  // Resilience: no weather, no disasters, radiation is manageable with regolith
  const resilience = clamp(75 - (iceKm > 100 ? 10 : 0)); // ice proximity helps

  // Cost: lunar construction is very expensive but less than orbit
  const buildCost = loc.construction_cost_mw ?? 5e8;
  const costScore = clamp(100 - Math.min(100, (buildCost / 1e9) * 100));

  const overall = clamp(power * 0.35 + cooling * 0.10 + connectivity * 0.15 + resilience * 0.20 + costScore * 0.20);
  return { overall, power, cooling, connectivity, resilience, cost: costScore, body: 'moon' };
}

function scoreMars(loc: LocationInput): FeasibilityScore {
  const solarW = loc.solar_irradiance_w ?? 500;
  const dust = loc.dust_storms_per_year ?? 20;
  const elevation = loc.elevation_km ?? 0;
  const temp = loc.avg_temperature_c ?? -60;

  // Power: solar irradiance (max ~590 W/m² at Mars equator, clear day)
  // Dust storms dramatically reduce this
  const dustPenalty = dust / 50 * 20; // up to 20 point penalty
  const power = clamp((solarW / 590) * 80 - dustPenalty);

  // Cooling: Mars atmosphere is thin but present; extreme cold helps
  const cooling = clamp(75 + Math.abs(temp) * 0.2);

  // Connectivity: 4-24 minute one-way delay
  const connectivity = clamp(25); // always poor due to distance

  // Resilience: dust storms are the main threat
  const dustRisk = clamp(100 - dust * 1.5);
  // Higher elevation = above some dust but thinner atmosphere
  const elevBonus = elevation > 10 ? 10 : elevation < -4 ? 5 : 0;
  const resilience = clamp(dustRisk * 0.7 + 30 + elevBonus);

  // Cost: Mars construction is the most expensive
  const buildCost = loc.construction_cost_mw ?? 1e9;
  const costScore = clamp(100 - Math.min(100, (buildCost / 2e9) * 100));

  const overall = clamp(power * 0.30 + cooling * 0.10 + connectivity * 0.10 + resilience * 0.30 + costScore * 0.20);
  return { overall, power, cooling, connectivity, resilience, cost: costScore, body: 'mars' };
}

/** Compute feasibility score for any location across any celestial body */
export function computeFeasibility(loc: LocationInput): FeasibilityScore {
  switch (loc.body) {
    case 'earth': return scoreEarth(loc);
    case 'orbit': return scoreOrbit(loc);
    case 'moon': return scoreMoon(loc);
    case 'mars': return scoreMars(loc);
    default: return scoreEarth(loc);
  }
}

/** Get a color for a feasibility score (green = good, red = bad) */
export function getFeasibilityColor(score: number): string {
  const hue = Math.round((score / 100) * 120); // 0=red, 120=green
  return `hsl(${hue}, 70%, 50%)`;
}

/** Get a text label for a feasibility score */
export function getFeasibilityLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Moderate';
  if (score >= 20) return 'Challenging';
  return 'Extreme';
}
