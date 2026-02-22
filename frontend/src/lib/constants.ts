export interface GroundRegion {
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  baseCarbonIntensity: number;
  carbonIntensity: number;
  energyCostKwh?: number;
  landCostSqm?: number;
  constructionCostMw?: number;
  coolingCostFactor?: number;
  disasterRisk?: number;
  politicalStability?: number;
}

export interface SatelliteData {
  id: string;
  name: string;
  inclination: number;
  period: number;
  startLat: number;
  startLng: number;
  phase: number;
  altitude: number;
  status: string;
  color: string;
  carbonScore: number;
  isStationary: boolean;
  lat: number;
  lng: number;
  noradId?: number;
  altitudeKm?: number;
  eclipseFraction?: number;
  radiationLevel?: string;
  powerAvailabilityW?: number;
  latencyMs?: number;
  apogeeKm?: number;
  perigeeKm?: number;
  category?: string;
}

export interface RoutingResult {
  target: string;
  targetName: string;
  isOrbital: boolean;
  carbonScore: number;
  co2Saved: number;
  estimatedGpuHours: number;
  jobCo2: number;
  baselineCo2: number;
  lat: number;
  lng: number;
  allGroundExceeded: boolean;
  exceedsLinkBudget: boolean;
  estimatedPasses?: number;
  estimatedDeliveryTime?: string;
  contactWindow?: string;
  linkBudget?: number;
}

export const GROUND_REGIONS: GroundRegion[] = [
  { id: 'us-east-1', name: 'US East', location: 'Virginia', lat: 37.5, lng: -79, baseCarbonIntensity: 380, carbonIntensity: 380 },
  { id: 'us-west-2', name: 'US West', location: 'Oregon', lat: 45.5, lng: -122.7, baseCarbonIntensity: 120, carbonIntensity: 120 },
  { id: 'eu-west-1', name: 'EU West', location: 'Ireland', lat: 53.3, lng: -6.3, baseCarbonIntensity: 142, carbonIntensity: 142 },
  { id: 'eu-central-1', name: 'EU Central', location: 'Frankfurt', lat: 50.1, lng: 8.7, baseCarbonIntensity: 310, carbonIntensity: 310 },
  { id: 'ap-southeast-1', name: 'AP Southeast', location: 'Singapore', lat: 1.3, lng: 103.8, baseCarbonIntensity: 420, carbonIntensity: 420 },
  { id: 'ap-northeast-1', name: 'AP Northeast', location: 'Tokyo', lat: 35.7, lng: 139.7, baseCarbonIntensity: 490, carbonIntensity: 490 },
  { id: 'sa-east-1', name: 'SA East', location: 'São Paulo', lat: -23.5, lng: -46.6, baseCarbonIntensity: 95, carbonIntensity: 95 },
];

// Carbon score → color: low (green) → mid (yellow) → high (red)
export const getCarbonScoreColor = (score: number): string => {
  const t = Math.max(0, Math.min(1, (score - 80) / 140));
  const hue = Math.round(120 - t * 120);
  return `hsl(${hue}, 80%, 55%)`;
};

// Real satellite data — colors derived from carbonScore via getCarbonScoreColor
export const INITIAL_SATELLITES: SatelliteData[] = [
  { id: 'ISS', name: 'ISS (Zarya)', inclination: 51.6, period: 5520, startLat: 40, startLng: -40, phase: 0, altitude: 0.06, status: 'SUNLIT', color: '', carbonScore: 200, isStationary: false, lat: 40, lng: -40 },
  { id: 'HUBBLE', name: 'Hubble Space Telescope', inclination: 28.5, period: 5760, startLat: 28, startLng: -80, phase: 0.8, altitude: 0.085, status: 'IN ECLIPSE', color: '', carbonScore: 150, isStationary: false, lat: 28, lng: -80 },
  { id: 'TERRA', name: 'Terra (EOS AM-1)', inclination: 98.2, period: 5940, startLat: 70, startLng: 30, phase: 1.5, altitude: 0.11, status: 'SUNLIT', color: '', carbonScore: 120, isStationary: false, lat: 70, lng: 30 },
  { id: 'LANDSAT9', name: 'Landsat-9', inclination: 98.2, period: 5940, startLat: -45, startLng: 120, phase: 2.1, altitude: 0.11, status: 'SUNLIT', color: '', carbonScore: 110, isStationary: false, lat: -45, lng: 120 },
  { id: 'NOAA20', name: 'NOAA-20 (JPSS-1)', inclination: 98.7, period: 6120, startLat: 60, startLng: -100, phase: 3.0, altitude: 0.13, status: 'SUNLIT', color: '', carbonScore: 130, isStationary: false, lat: 60, lng: -100 },
  { id: 'SENTINEL6', name: 'Sentinel-6 Michael Freilich', inclination: 66, period: 6720, startLat: -30, startLng: 10, phase: 0.4, altitude: 0.21, status: 'SUNLIT', color: '', carbonScore: 100, isStationary: false, lat: -30, lng: 10 },
  { id: 'TIANGONG', name: 'Tiangong Space Station', inclination: 41.5, period: 5520, startLat: 35, startLng: 110, phase: 1.2, altitude: 0.06, status: 'SUNLIT', color: '', carbonScore: 210, isStationary: false, lat: 35, lng: 110 },
  { id: 'STARLINK', name: 'Starlink-1007', inclination: 53, period: 5700, startLat: -20, startLng: -60, phase: 4.0, altitude: 0.085, status: 'IN ECLIPSE', color: '', carbonScore: 170, isStationary: false, lat: -20, lng: -60 },
  { id: 'GOES16', name: 'GOES-16', inclination: 0, period: 0, startLat: 0, startLng: -75.2, phase: 0, altitude: 0.25, status: 'GEOSTATIONARY', color: '', carbonScore: 95, isStationary: true, lat: 0, lng: -75.2 },
  { id: 'INMARSAT5', name: 'Inmarsat-5 F4', inclination: 0, period: 0, startLat: 0, startLng: 25.1, phase: 0, altitude: 0.25, status: 'GEOSTATIONARY', color: '', carbonScore: 85, isStationary: true, lat: 0, lng: 25.1 },
].map(s => ({ ...s, color: getCarbonScoreColor(s.carbonScore) }));

export const USER_LOCATION = { lat: 51.5, lng: -0.1, name: 'London' };

export const getIntensityColor = (intensity: number): string => {
  const hue = Math.max(0, 120 - (intensity / 600) * 120);
  // Convert HSL to hex for compatibility with react-globe.gl
  const h = hue / 360;
  const s = 0.8;
  const l = 0.5;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

export const formatCountdown = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
