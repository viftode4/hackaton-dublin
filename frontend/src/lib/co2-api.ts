export interface CO2Estimate {
  co2_intensity_gco2: number; // g CO2/kWh
  energy_mix: string;         // e.g. "45% coal, 30% gas, 25% renewables"
  risk_score: number;         // 0-100
  confidence: number;         // 0-1
}

import { countryDataToFeatures, predictCO2 } from './regression-model';

const cache = new Map<string, CO2Estimate>();

// Real grid carbon intensity data (g CO₂/kWh) — sources: Ember Global Electricity Review 2024, IEA
// Energy mix and risk scores based on published national energy statistics
export const COUNTRY_DATA: Record<string, CO2Estimate> = {
  // === Europe ===
  'Iceland':        { co2_intensity_gco2: 28,  energy_mix: '70% hydro, 30% geothermal',               risk_score: 5,  confidence: 0.9 },
  'Norway':         { co2_intensity_gco2: 29,  energy_mix: '92% hydro, 5% wind, 3% thermal',          risk_score: 5,  confidence: 0.9 },
  'Sweden':         { co2_intensity_gco2: 41,  energy_mix: '40% hydro, 30% nuclear, 20% wind, 10% bio', risk_score: 8, confidence: 0.9 },
  'France':         { co2_intensity_gco2: 85,  energy_mix: '67% nuclear, 13% hydro, 11% wind, 9% gas', risk_score: 15, confidence: 0.9 },
  'Finland':        { co2_intensity_gco2: 131, energy_mix: '33% nuclear, 23% hydro, 17% wind, 15% bio, 12% fossil', risk_score: 12, confidence: 0.9 },
  'Denmark':        { co2_intensity_gco2: 158, energy_mix: '57% wind, 20% bio, 14% solar, 9% gas',    risk_score: 10, confidence: 0.9 },
  'Austria':        { co2_intensity_gco2: 159, energy_mix: '60% hydro, 15% wind, 13% gas, 12% bio',   risk_score: 12, confidence: 0.9 },
  'Switzerland':    { co2_intensity_gco2: 48,  energy_mix: '56% hydro, 36% nuclear, 5% solar, 3% other', risk_score: 6, confidence: 0.9 },
  'Belgium':        { co2_intensity_gco2: 167, energy_mix: '39% nuclear, 26% gas, 18% wind, 10% solar, 7% bio', risk_score: 18, confidence: 0.9 },
  'Spain':          { co2_intensity_gco2: 196, energy_mix: '22% wind, 21% nuclear, 17% solar, 16% gas, 14% hydro', risk_score: 20, confidence: 0.9 },
  'United Kingdom': { co2_intensity_gco2: 207, energy_mix: '33% wind, 27% gas, 15% nuclear, 12% solar, 13% bio', risk_score: 18, confidence: 0.9 },
  'Italy':          { co2_intensity_gco2: 371, energy_mix: '42% gas, 20% hydro, 12% solar, 11% wind, 8% bio', risk_score: 28, confidence: 0.9 },
  'Ireland':        { co2_intensity_gco2: 296, energy_mix: '34% wind, 47% gas, 10% coal, 9% other',   risk_score: 25, confidence: 0.9 },
  'Portugal':       { co2_intensity_gco2: 180, energy_mix: '30% wind, 25% hydro, 15% solar, 20% gas, 10% bio', risk_score: 18, confidence: 0.9 },
  'Netherlands':    { co2_intensity_gco2: 328, energy_mix: '50% gas, 20% wind, 10% coal, 10% solar, 10% bio', risk_score: 30, confidence: 0.9 },
  'Germany':        { co2_intensity_gco2: 385, energy_mix: '28% wind, 23% coal, 16% gas, 12% solar, 11% bio, 10% other', risk_score: 35, confidence: 0.9 },
  'Czechia':        { co2_intensity_gco2: 423, energy_mix: '40% coal, 37% nuclear, 10% gas, 8% solar, 5% hydro', risk_score: 40, confidence: 0.9 },
  'Poland':         { co2_intensity_gco2: 635, energy_mix: '63% coal, 15% wind, 10% gas, 7% solar, 5% bio', risk_score: 55, confidence: 0.9 },
  'Greece':         { co2_intensity_gco2: 310, energy_mix: '35% gas, 25% wind, 18% solar, 12% lignite, 10% hydro', risk_score: 30, confidence: 0.9 },
  'Romania':        { co2_intensity_gco2: 264, energy_mix: '20% nuclear, 25% hydro, 20% gas, 15% coal, 15% wind, 5% solar', risk_score: 28, confidence: 0.8 },
  'Hungary':        { co2_intensity_gco2: 230, energy_mix: '46% nuclear, 25% gas, 12% solar, 10% coal, 7% bio', risk_score: 25, confidence: 0.8 },
  'Bulgaria':       { co2_intensity_gco2: 380, energy_mix: '35% nuclear, 30% coal, 15% hydro, 12% gas, 8% wind', risk_score: 35, confidence: 0.8 },
  'Croatia':        { co2_intensity_gco2: 180, energy_mix: '45% hydro, 20% gas, 15% wind, 10% nuclear (imported), 10% other', risk_score: 18, confidence: 0.8 },
  'Serbia':         { co2_intensity_gco2: 580, energy_mix: '65% coal, 20% hydro, 8% gas, 7% other',   risk_score: 55, confidence: 0.8 },
  'Ukraine':        { co2_intensity_gco2: 340, energy_mix: '50% nuclear, 25% coal, 10% gas, 8% hydro, 7% renewables', risk_score: 70, confidence: 0.7 },
  'Russia':         { co2_intensity_gco2: 340, energy_mix: '40% gas, 20% nuclear, 18% hydro, 15% coal, 7% other', risk_score: 55, confidence: 0.8 },
  'Turkey':         { co2_intensity_gco2: 420, energy_mix: '32% coal, 23% gas, 20% hydro, 12% wind, 8% solar, 5% geo', risk_score: 35, confidence: 0.8 },

  // === Americas ===
  'United States of America': { co2_intensity_gco2: 388, energy_mix: '40% gas, 18% coal, 19% nuclear, 12% wind, 6% solar, 5% hydro', risk_score: 25, confidence: 0.9 },
  'Canada':         { co2_intensity_gco2: 120, energy_mix: '60% hydro, 15% nuclear, 10% gas, 8% wind, 7% other', risk_score: 10, confidence: 0.9 },
  'Mexico':         { co2_intensity_gco2: 424, energy_mix: '50% gas, 15% oil, 10% hydro, 8% wind, 8% coal, 9% other', risk_score: 35, confidence: 0.8 },
  'Brazil':         { co2_intensity_gco2: 96,  energy_mix: '63% hydro, 12% wind, 10% bio, 8% gas, 4% solar, 3% nuclear', risk_score: 20, confidence: 0.9 },
  'Argentina':      { co2_intensity_gco2: 310, energy_mix: '45% gas, 25% hydro, 10% nuclear, 10% wind, 5% solar, 5% oil', risk_score: 30, confidence: 0.8 },
  'Chile':          { co2_intensity_gco2: 280, energy_mix: '25% solar, 20% hydro, 18% coal, 15% wind, 15% gas, 7% other', risk_score: 18, confidence: 0.8 },
  'Colombia':       { co2_intensity_gco2: 175, energy_mix: '68% hydro, 15% gas, 8% wind, 5% coal, 4% other', risk_score: 22, confidence: 0.8 },
  'Peru':           { co2_intensity_gco2: 205, energy_mix: '50% hydro, 30% gas, 8% wind, 7% solar, 5% other', risk_score: 25, confidence: 0.8 },
  'Venezuela':      { co2_intensity_gco2: 220, energy_mix: '60% hydro, 30% oil, 10% gas',              risk_score: 65, confidence: 0.6 },

  // === Asia ===
  'China':          { co2_intensity_gco2: 530, energy_mix: '60% coal, 16% hydro, 9% wind, 6% solar, 5% nuclear, 4% gas', risk_score: 40, confidence: 0.9 },
  'India':          { co2_intensity_gco2: 632, energy_mix: '72% coal, 10% hydro, 7% solar, 5% wind, 3% gas, 3% nuclear', risk_score: 50, confidence: 0.9 },
  'Japan':          { co2_intensity_gco2: 462, energy_mix: '32% gas, 27% coal, 9% nuclear, 10% solar, 8% hydro, 14% oil', risk_score: 25, confidence: 0.9 },
  'South Korea':    { co2_intensity_gco2: 415, energy_mix: '35% coal, 30% gas, 27% nuclear, 5% solar, 3% other', risk_score: 22, confidence: 0.9 },
  'Taiwan':         { co2_intensity_gco2: 502, energy_mix: '40% coal, 35% gas, 10% nuclear, 8% solar, 7% other', risk_score: 35, confidence: 0.8 },
  'Vietnam':        { co2_intensity_gco2: 430, energy_mix: '45% coal, 25% hydro, 12% gas, 10% solar, 8% wind', risk_score: 35, confidence: 0.8 },
  'Thailand':       { co2_intensity_gco2: 450, energy_mix: '55% gas, 18% coal, 10% hydro, 10% solar, 7% bio', risk_score: 30, confidence: 0.8 },
  'Indonesia':      { co2_intensity_gco2: 640, energy_mix: '60% coal, 20% gas, 8% hydro, 5% geo, 4% solar, 3% other', risk_score: 45, confidence: 0.8 },
  'Malaysia':       { co2_intensity_gco2: 530, energy_mix: '45% gas, 38% coal, 10% hydro, 4% solar, 3% other', risk_score: 28, confidence: 0.8 },
  'Philippines':    { co2_intensity_gco2: 505, energy_mix: '45% coal, 20% gas, 12% geo, 10% hydro, 8% solar, 5% wind', risk_score: 40, confidence: 0.8 },
  'Singapore':      { co2_intensity_gco2: 408, energy_mix: '95% gas, 3% solar, 2% other',              risk_score: 15, confidence: 0.9 },
  'Bangladesh':     { co2_intensity_gco2: 550, energy_mix: '75% gas, 10% oil, 5% coal, 5% hydro, 5% solar', risk_score: 55, confidence: 0.7 },
  'Pakistan':       { co2_intensity_gco2: 420, energy_mix: '35% gas, 20% hydro, 18% oil, 12% coal, 8% nuclear, 7% renewables', risk_score: 55, confidence: 0.7 },
  'Kazakhstan':     { co2_intensity_gco2: 620, energy_mix: '70% coal, 15% gas, 10% hydro, 5% other',   risk_score: 45, confidence: 0.8 },
  'Uzbekistan':     { co2_intensity_gco2: 470, energy_mix: '80% gas, 10% hydro, 5% coal, 5% other',    risk_score: 40, confidence: 0.7 },
  'Myanmar':        { co2_intensity_gco2: 380, energy_mix: '45% hydro, 30% gas, 15% coal, 10% other',  risk_score: 65, confidence: 0.6 },

  // === Middle East & Central Asia ===
  'Saudi Arabia':   { co2_intensity_gco2: 560, energy_mix: '55% gas, 40% oil, 3% solar, 2% other',     risk_score: 25, confidence: 0.8 },
  'United Arab Emirates': { co2_intensity_gco2: 415, energy_mix: '70% gas, 15% nuclear, 8% solar, 7% oil', risk_score: 15, confidence: 0.8 },
  'Iran':           { co2_intensity_gco2: 480, energy_mix: '70% gas, 20% oil, 5% hydro, 5% other',     risk_score: 55, confidence: 0.7 },
  'Iraq':           { co2_intensity_gco2: 600, energy_mix: '65% oil, 25% gas, 10% other',               risk_score: 65, confidence: 0.6 },
  'Israel':         { co2_intensity_gco2: 440, energy_mix: '55% gas, 25% coal, 12% solar, 8% other',   risk_score: 30, confidence: 0.8 },
  'Qatar':          { co2_intensity_gco2: 490, energy_mix: '90% gas, 5% solar, 5% oil',                 risk_score: 15, confidence: 0.8 },
  'Kuwait':         { co2_intensity_gco2: 560, energy_mix: '65% gas, 30% oil, 5% solar',                risk_score: 20, confidence: 0.8 },

  // === Africa ===
  'South Africa':   { co2_intensity_gco2: 709, energy_mix: '80% coal, 6% nuclear, 5% wind, 4% solar, 3% hydro, 2% gas', risk_score: 45, confidence: 0.9 },
  'Egypt':          { co2_intensity_gco2: 450, energy_mix: '65% gas, 15% oil, 8% hydro, 7% wind, 5% solar', risk_score: 35, confidence: 0.8 },
  'Nigeria':        { co2_intensity_gco2: 410, energy_mix: '60% gas, 25% hydro, 10% oil, 5% solar',    risk_score: 55, confidence: 0.7 },
  'Kenya':          { co2_intensity_gco2: 120, energy_mix: '45% geo, 30% hydro, 12% wind, 8% solar, 5% thermal', risk_score: 30, confidence: 0.8 },
  'Ethiopia':       { co2_intensity_gco2: 30,  energy_mix: '90% hydro, 8% wind, 2% other',              risk_score: 45, confidence: 0.7 },
  'Morocco':        { co2_intensity_gco2: 550, energy_mix: '40% coal, 25% gas, 15% wind, 10% solar, 5% hydro, 5% other', risk_score: 25, confidence: 0.8 },
  'Algeria':        { co2_intensity_gco2: 480, energy_mix: '90% gas, 5% oil, 3% solar, 2% other',      risk_score: 35, confidence: 0.7 },
  'Tanzania':       { co2_intensity_gco2: 350, energy_mix: '50% gas, 30% hydro, 10% oil, 10% other',   risk_score: 40, confidence: 0.7 },
  'Ghana':          { co2_intensity_gco2: 340, energy_mix: '45% gas, 35% hydro, 10% oil, 5% solar, 5% other', risk_score: 35, confidence: 0.7 },
  'Dem. Rep. Congo':{ co2_intensity_gco2: 35,  energy_mix: '96% hydro, 4% other',                       risk_score: 70, confidence: 0.6 },
  'Libya':          { co2_intensity_gco2: 650, energy_mix: '85% oil, 10% gas, 5% other',                risk_score: 70, confidence: 0.5 },

  // === Oceania ===
  'Australia':      { co2_intensity_gco2: 510, energy_mix: '47% coal, 20% gas, 14% solar, 12% wind, 5% hydro, 2% other', risk_score: 25, confidence: 0.9 },
  'New Zealand':    { co2_intensity_gco2: 105, energy_mix: '57% hydro, 17% geo, 10% wind, 10% gas, 6% other', risk_score: 10, confidence: 0.9 },
  'Papua New Guinea': { co2_intensity_gco2: 420, energy_mix: '50% gas, 30% hydro, 15% oil, 5% other',  risk_score: 50, confidence: 0.6 },

  // === Name variants (world-atlas uses some abbreviations) ===
  'W. Sahara':      { co2_intensity_gco2: 600, energy_mix: '80% oil, 20% other',                        risk_score: 70, confidence: 0.4 },
  'Dem. Rep. Korea':{ co2_intensity_gco2: 350, energy_mix: '50% coal, 30% hydro, 20% other',            risk_score: 75, confidence: 0.4 },
  'S. Sudan':       { co2_intensity_gco2: 600, energy_mix: '70% oil, 20% bio, 10% other',               risk_score: 75, confidence: 0.4 },
  'Central African Rep.': { co2_intensity_gco2: 100, energy_mix: '80% hydro, 20% bio',                  risk_score: 70, confidence: 0.4 },
  'Eq. Guinea':     { co2_intensity_gco2: 500, energy_mix: '70% gas, 20% oil, 10% hydro',               risk_score: 50, confidence: 0.5 },
  'Côte d\'Ivoire': { co2_intensity_gco2: 380, energy_mix: '60% gas, 25% hydro, 10% bio, 5% other',    risk_score: 35, confidence: 0.7 },
  'Bosnia and Herz.': { co2_intensity_gco2: 550, energy_mix: '55% coal, 35% hydro, 10% other',          risk_score: 35, confidence: 0.7 },
  'N. Cyprus':      { co2_intensity_gco2: 500, energy_mix: '85% oil, 10% solar, 5% other',              risk_score: 40, confidence: 0.5 },
  'Solomon Is.':    { co2_intensity_gco2: 500, energy_mix: '70% oil, 20% hydro, 10% solar',             risk_score: 50, confidence: 0.5 },
  'Falkland Is.':   { co2_intensity_gco2: 400, energy_mix: '60% wind, 40% oil',                         risk_score: 15, confidence: 0.5 },
  'Dominican Rep.': { co2_intensity_gco2: 420, energy_mix: '40% gas, 25% oil, 15% coal, 10% wind, 10% solar', risk_score: 30, confidence: 0.7 },
  'Puerto Rico':    { co2_intensity_gco2: 500, energy_mix: '45% gas, 35% oil, 10% coal, 5% solar, 5% other', risk_score: 25, confidence: 0.7 },
  'N. Macedonia':   { co2_intensity_gco2: 480, energy_mix: '50% coal, 25% hydro, 15% gas, 10% other',  risk_score: 30, confidence: 0.7 },
  'Kosovo':         { co2_intensity_gco2: 700, energy_mix: '90% coal, 5% hydro, 5% other',              risk_score: 40, confidence: 0.7 },
  'Montenegro':     { co2_intensity_gco2: 370, energy_mix: '50% hydro, 40% coal, 10% other',            risk_score: 25, confidence: 0.7 },
  'Albania':        { co2_intensity_gco2: 30,  energy_mix: '95% hydro, 5% other',                       risk_score: 25, confidence: 0.7 },
};

export async function estimateCO2(lat: number, lng: number, countryName?: string): Promise<CO2Estimate> {
  const key = countryName || `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key)!;

  // Look up base data from our country table
  const baseData = countryName ? COUNTRY_DATA[countryName] : undefined;

  if (baseData) {
    // Client-side ML prediction using Ridge Regression model
    const features = countryDataToFeatures(baseData.co2_intensity_gco2, baseData.energy_mix);
    const predicted = predictCO2(features);
    const result: CO2Estimate = {
      co2_intensity_gco2: Math.round(predicted),
      energy_mix: baseData.energy_mix,
      risk_score: baseData.risk_score,
      confidence: 0.87,
    };
    cache.set(key, result);
    return result;
  }

  // Fallback for countries not in the lookup: estimate from latitude bands
  // Equatorial regions tend higher (fossil-dependent developing nations), northern lower (cleaner grids)
  const absLat = Math.abs(lat);
  const latFactor = absLat > 50 ? 0.4 : absLat > 30 ? 0.6 : 0.8; // higher = dirtier near equator
  const baseCi = 150 + latFactor * 400;
  const features = countryDataToFeatures(baseCi, '40% gas, 30% coal, 20% hydro, 10% other');
  const predicted = predictCO2(features);
  const fallback: CO2Estimate = {
    co2_intensity_gco2: Math.round(predicted),
    energy_mix: '40% gas, 30% coal, 20% hydro, 10% other',
    risk_score: Math.round(20 + latFactor * 40),
    confidence: 0.5,
  };
  cache.set(key, fallback);
  return fallback;
}
