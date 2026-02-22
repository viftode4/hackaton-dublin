import * as satellite from 'satellite.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface TLERecord {
  OBJECT_NAME: string;
  NORAD_CAT_ID: number;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  TLE_LINE1: string;
  TLE_LINE2: string;
}

export interface SatellitePosition {
  lat: number;
  lng: number;
  altitude: number; // km
  velocity: number; // km/s
}

export interface OrbitalMetrics {
  periodMinutes: number;
  inclinationDeg: number;
  eccentricity: number;
  apogeeKm: number;
  perigeeKm: number;
  eclipseFraction: number; // 0-1
  solarIrradiance: number; // W/m²
  radiationLevel: string; // 'low' | 'moderate' | 'high' | 'extreme'
  latencyToGroundMs: number;
  powerAvailabilityW: number; // per m² of solar panel
}

const EARTH_RADIUS_KM = 6371;
const SOLAR_CONSTANT = 1361; // W/m² at 1 AU
const SOLAR_PANEL_EFFICIENCY = 0.29; // Triple-junction GaAs

/** Compute satellite position at a given time from TLE */
export function computePosition(tle: TLERecord, date: Date = new Date()): SatellitePosition | null {
  try {
    const satrec = satellite.twoline2satrec(tle.TLE_LINE1, tle.TLE_LINE2);
    const positionAndVelocity = satellite.propagate(satrec, date);
    if (!positionAndVelocity.position || typeof positionAndVelocity.position === 'boolean') return null;

    const gmst = satellite.gstime(date);
    const geo = satellite.eciToGeodetic(positionAndVelocity.position as satellite.EciVec3<number>, gmst);

    const vel = positionAndVelocity.velocity;
    const velocity = vel && typeof vel !== 'boolean'
      ? Math.sqrt((vel as satellite.EciVec3<number>).x ** 2 + (vel as satellite.EciVec3<number>).y ** 2 + (vel as satellite.EciVec3<number>).z ** 2)
      : 0;

    return {
      lat: satellite.degreesLat(geo.latitude),
      lng: satellite.degreesLong(geo.longitude),
      altitude: geo.height,
      velocity,
    };
  } catch {
    return null;
  }
}

/** Compute orbital feasibility metrics from TLE orbital elements */
export function computeOrbitalMetrics(tle: TLERecord): OrbitalMetrics {
  const meanMotion = tle.MEAN_MOTION; // rev/day
  const periodMinutes = (24 * 60) / meanMotion;
  const inclination = tle.INCLINATION;
  const eccentricity = tle.ECCENTRICITY;

  // Semi-major axis from mean motion (Kepler's 3rd law)
  const mu = 398600.4418; // km³/s² (Earth gravitational parameter)
  const n = meanMotion * (2 * Math.PI) / 86400; // rad/s
  const sma = Math.pow(mu / (n * n), 1 / 3); // km
  const apogee = sma * (1 + eccentricity) - EARTH_RADIUS_KM;
  const perigee = sma * (1 - eccentricity) - EARTH_RADIUS_KM;
  const avgAltitude = (apogee + perigee) / 2;

  // Eclipse fraction estimate (simplified)
  const rho = Math.asin(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + avgAltitude));
  const eclipseFraction = rho / Math.PI;

  // Radiation level based on altitude (Van Allen belts)
  let radiationLevel: string;
  if (avgAltitude < 1000) radiationLevel = 'low';
  else if (avgAltitude < 6000) radiationLevel = 'high'; // inner belt
  else if (avgAltitude < 13000) radiationLevel = 'moderate';
  else if (avgAltitude < 40000) radiationLevel = 'extreme'; // outer belt
  else radiationLevel = 'moderate';

  // Latency (speed of light round trip)
  const latencyToGroundMs = (avgAltitude * 2) / 299.792;

  // Power availability
  const solarIrradiance = SOLAR_CONSTANT;
  const powerAvailability = solarIrradiance * SOLAR_PANEL_EFFICIENCY * (1 - eclipseFraction);

  return {
    periodMinutes: Math.round(periodMinutes * 10) / 10,
    inclinationDeg: Math.round(inclination * 10) / 10,
    eccentricity: Math.round(eccentricity * 10000) / 10000,
    apogeeKm: Math.round(apogee),
    perigeeKm: Math.round(perigee),
    eclipseFraction: Math.round(eclipseFraction * 1000) / 1000,
    solarIrradiance,
    radiationLevel,
    latencyToGroundMs: Math.round(latencyToGroundMs * 100) / 100,
    powerAvailabilityW: Math.round(powerAvailability),
  };
}

const CELESTRAK_BASE = 'https://celestrak.org/NORAD/elements/gp.php';
const TLE_ALT_BASE = 'https://tle.ivanstanojevic.me/api/tle/';

/** Parse orbital elements from TLE line 2 */
function parseTLELines(line1: string, line2: string): Pick<TLERecord, 'EPOCH' | 'MEAN_MOTION' | 'ECCENTRICITY' | 'INCLINATION' | 'RA_OF_ASC_NODE' | 'ARG_OF_PERICENTER' | 'MEAN_ANOMALY'> {
  // Line 1 col 18-32: epoch (YY + day-of-year with fractional)
  const epochYear = parseInt(line1.substring(18, 20));
  const epochDay = parseFloat(line1.substring(20, 32));
  const fullYear = epochYear >= 57 ? 1900 + epochYear : 2000 + epochYear;
  const jan1 = new Date(Date.UTC(fullYear, 0, 1));
  const epoch = new Date(jan1.getTime() + (epochDay - 1) * 86400000);

  return {
    EPOCH: epoch.toISOString(),
    INCLINATION: parseFloat(line2.substring(8, 16).trim()),
    RA_OF_ASC_NODE: parseFloat(line2.substring(17, 25).trim()),
    ECCENTRICITY: parseFloat('0.' + line2.substring(26, 33).trim()),
    ARG_OF_PERICENTER: parseFloat(line2.substring(34, 42).trim()),
    MEAN_ANOMALY: parseFloat(line2.substring(43, 51).trim()),
    MEAN_MOTION: parseFloat(line2.substring(52, 63).trim()),
  };
}

/** Convert alternative API response to TLERecord */
function altToTLERecord(item: { satelliteId: number; name: string; line1: string; line2: string }): TLERecord {
  const parsed = parseTLELines(item.line1, item.line2);
  return {
    OBJECT_NAME: item.name,
    NORAD_CAT_ID: item.satelliteId,
    TLE_LINE1: item.line1,
    TLE_LINE2: item.line2,
    ...parsed,
  };
}

/** Fetch from alternative TLE API (tle.ivanstanojevic.me) — paginated */
async function fetchFromAltAPI(pageSize = 20, pages = 5): Promise<TLERecord[]> {
  const results: TLERecord[] = [];
  for (let page = 1; page <= pages; page++) {
    const res = await fetch(`${TLE_ALT_BASE}?page=${page}&page_size=${pageSize}`);
    if (!res.ok) break;
    const data = await res.json();
    if (!data.member || data.member.length === 0) break;
    for (const item of data.member) {
      results.push(altToTLERecord(item));
    }
  }
  return results;
}

/** Fetch curated satellites from alternative API */
async function fetchCuratedFromAlt(): Promise<TLERecord[]> {
  const ids = Object.values(CURATED_SATELLITE_IDS);
  const fetches = ids.map(async (id) => {
    try {
      const res = await fetch(`${TLE_ALT_BASE}/${id}`);
      if (!res.ok) return null;
      const item = await res.json();
      return altToTLERecord(item);
    } catch { return null; }
  });
  const results = await Promise.all(fetches);
  return results.filter((r): r is TLERecord => r !== null);
}

/** Fetch TLE data — try backend proxy, then CelesTrak, then alternative API */
export async function fetchTLEGroup(group: string): Promise<TLERecord[]> {
  // Try backend proxy first
  try {
    const res = await fetch(`${API_BASE}/api/tle?group=${encodeURIComponent(group)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch { /* proxy unavailable */ }
  // Try direct CelesTrak
  try {
    const res = await fetch(`${CELESTRAK_BASE}?GROUP=${encodeURIComponent(group)}&FORMAT=JSON`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch { /* CelesTrak unavailable */ }
  // Fall back to alternative TLE API
  console.log('CelesTrak unavailable, using alternative TLE API');
  const curated = await fetchCuratedFromAlt();
  if (curated.length > 0) {
    const paginated = await fetchFromAltAPI(20, 5);
    // Merge curated + paginated, deduplicate by NORAD_CAT_ID
    const seen = new Set(curated.map(r => r.NORAD_CAT_ID));
    for (const r of paginated) {
      if (!seen.has(r.NORAD_CAT_ID)) {
        curated.push(r);
        seen.add(r.NORAD_CAT_ID);
      }
    }
    return curated;
  }
  throw new Error('All TLE sources unavailable');
}

export async function fetchTLEByNoradId(catnr: number): Promise<TLERecord[]> {
  try {
    const res = await fetch(`${API_BASE}/api/tle?catnr=${catnr}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch { /* proxy unavailable */ }
  try {
    const res = await fetch(`${CELESTRAK_BASE}?CATNR=${catnr}&FORMAT=JSON`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch { /* CelesTrak unavailable */ }
  // Fall back to alternative API
  const res = await fetch(`${TLE_ALT_BASE}/${catnr}`);
  if (!res.ok) throw new Error(`All TLE sources failed for NORAD ${catnr}`);
  const item = await res.json();
  return [altToTLERecord(item)];
}

/** Curated list of interesting satellites for the orbital datacenter view */
export const CURATED_SATELLITE_IDS: Record<string, number> = {
  // Space stations
  ISS: 25544,
  TIANGONG: 48274,
  // Earth observation
  TERRA: 25994,
  AQUA: 27424,
  LANDSAT9: 49260,
  SENTINEL6: 46984,
  // Communications
  GOES16: 41866,
  GOES18: 51850,
  // LEO constellations
  STARLINK: 44238,
  ONEWEB: 44057,
  // Weather
  NOAA20: 43013,
  METOP_C: 43689,
  // Science
  HUBBLE: 20580,
};
