// Celestial body definitions for globe switching

export type CelestialBody = 'earth' | 'orbit' | 'moon' | 'mars';

export interface CelestialConfig {
  id: CelestialBody;
  name: string;
  textureUrl: string;
  bumpUrl?: string;
  backgroundUrl: string;
  atmosphereColor: string;
  showAtmosphere: boolean;
  atmosphereAltitude: number;
}

export const CELESTIAL_CONFIGS: Record<CelestialBody, CelestialConfig> = {
  earth: {
    id: 'earth',
    name: 'Earth',
    textureUrl: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
    backgroundUrl: '//unpkg.com/three-globe/example/img/night-sky.png',
    atmosphereColor: '#00d4ff',
    showAtmosphere: true,
    atmosphereAltitude: 0.2,
  },
  orbit: {
    id: 'orbit',
    name: 'In Orbit',
    textureUrl: '//unpkg.com/three-globe/example/img/earth-night.jpg',
    backgroundUrl: '//unpkg.com/three-globe/example/img/night-sky.png',
    atmosphereColor: '#00d4ff',
    showAtmosphere: true,
    atmosphereAltitude: 0.2,
  },
  moon: {
    id: 'moon',
    name: 'Moon',
    textureUrl: '/textures/moon.jpg',
    backgroundUrl: '//unpkg.com/three-globe/example/img/night-sky.png',
    atmosphereColor: '#888888',
    showAtmosphere: false,
    atmosphereAltitude: 0.05,
  },
  mars: {
    id: 'mars',
    name: 'Mars',
    textureUrl: '/textures/mars.jpg',
    backgroundUrl: '//unpkg.com/three-globe/example/img/night-sky.png',
    atmosphereColor: '#e08040',
    showAtmosphere: true,
    atmosphereAltitude: 0.15,
  },
};

export interface ExtraterrestrialLocation {
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  body: CelestialBody;
  carbonIntensity: number; // g CO2/kWh (0 for solar-only sites)
  baseCarbonIntensity: number;
  powerSource: string;
  capacity: string;
  status: string;
  // Extended metrics for feasibility scoring
  illuminationPct?: number;       // Moon: % of time in sunlight
  avgTemperatureC?: number;       // Surface temperature (°C)
  tempRangeC?: [number, number];  // [min, max] °C
  earthVisible?: boolean;         // Direct line-of-sight to Earth
  iceProximityKm?: number;        // Distance to water ice deposits
  solarIrradianceW?: number;      // Mars: W/m² at surface
  dustStormsPerYear?: number;     // Mars: annual dust storm count
  elevationKm?: number;           // Mars: surface elevation
  latencyToEarthMs?: number;      // Communication delay (one-way, ms)
  constructionCostMw?: number;    // Estimated $/MW to build
  coolingEfficiency?: number;     // 0-100 (higher = better natural cooling)
  radiationLevel?: string;        // 'low' | 'moderate' | 'high' | 'extreme'
}

// Moon location data — NASA LRO/LOLA illumination, DIVINER thermal, Lunar Prospector ice
export const MOON_LOCATIONS: ExtraterrestrialLocation[] = [
  { id: 'moon-shackleton', name: 'Shackleton Crater Rim', location: 'South Pole (86% solar)', lat: -89.9, lng: 0, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (86% illumination)', capacity: '5 MW', status: 'Artemis III candidate',
    illuminationPct: 86, avgTemperatureC: -173, tempRangeC: [-203, -53], earthVisible: false, iceProximityKm: 0, latencyToEarthMs: 1300, constructionCostMw: 5e8, coolingEfficiency: 95, radiationLevel: 'high' },
  { id: 'moon-connecting-ridge', name: 'Connecting Ridge', location: 'South Pole (93% solar — best)', lat: -89.5, lng: 45, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (93% — highest known)', capacity: '10 MW', status: 'Peak of Eternal Light',
    illuminationPct: 93, avgTemperatureC: -163, tempRangeC: [-183, -23], earthVisible: true, iceProximityKm: 5, latencyToEarthMs: 1300, constructionCostMw: 4e8, coolingEfficiency: 92, radiationLevel: 'high' },
  { id: 'moon-de-gerlache', name: 'de Gerlache Crater Rim', location: 'South Pole (82% solar)', lat: -88.5, lng: -87, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (82% illumination)', capacity: '4 MW', status: 'Artemis candidate',
    illuminationPct: 82, avgTemperatureC: -178, tempRangeC: [-213, -63], earthVisible: false, iceProximityKm: 2, latencyToEarthMs: 1300, constructionCostMw: 5e8, coolingEfficiency: 96, radiationLevel: 'high' },
  { id: 'moon-malapert', name: 'Malapert Mountain', location: 'South Pole (Earth-visible)', lat: -86.0, lng: 3, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (78% illumination)', capacity: '3 MW', status: 'Comms relay hub',
    illuminationPct: 78, avgTemperatureC: -168, tempRangeC: [-193, -43], earthVisible: true, iceProximityKm: 15, latencyToEarthMs: 1300, constructionCostMw: 5.5e8, coolingEfficiency: 93, radiationLevel: 'high' },
  { id: 'moon-mare-tranq', name: 'Lava Tube, Mare Tranquillitatis', location: 'Sea of Tranquility', lat: 8.5, lng: 31.4, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar + Nuclear', capacity: '2 MW', status: 'Radiation-shielded',
    illuminationPct: 50, avgTemperatureC: -23, tempRangeC: [-173, 107], earthVisible: true, iceProximityKm: 2000, latencyToEarthMs: 1300, constructionCostMw: 3e8, coolingEfficiency: 60, radiationLevel: 'low' },
  { id: 'moon-aristarchus', name: 'Aristarchus Plateau', location: 'Thorium-rich region', lat: 23.7, lng: -47.4, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar + Thorium (future)', capacity: '3 MW', status: 'Resource extraction',
    illuminationPct: 50, avgTemperatureC: -20, tempRangeC: [-170, 110], earthVisible: true, iceProximityKm: 500, latencyToEarthMs: 1300, constructionCostMw: 4e8, coolingEfficiency: 58, radiationLevel: 'high' },
  { id: 'moon-tsiolkovsky', name: 'Tsiolkovsky Crater', location: 'Far Side (radio-quiet)', lat: -21.2, lng: 128.9, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Nuclear + Solar', capacity: '2 MW', status: 'Radio-quiet zone',
    illuminationPct: 50, avgTemperatureC: -30, tempRangeC: [-173, 97], earthVisible: false, iceProximityKm: 800, latencyToEarthMs: 2600, constructionCostMw: 7e8, coolingEfficiency: 62, radiationLevel: 'moderate' },
  { id: 'moon-north-pole', name: 'Peary Crater Rim', location: 'North Pole (76% solar)', lat: 88.6, lng: 33, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (76% illumination)', capacity: '4 MW', status: 'North pole alternative',
    illuminationPct: 76, avgTemperatureC: -170, tempRangeC: [-198, -48], earthVisible: true, iceProximityKm: 10, latencyToEarthMs: 1300, constructionCostMw: 5e8, coolingEfficiency: 94, radiationLevel: 'high' },
];

// Mars location data — NASA TM-102299 irradiance, Battalio & Wang 2021 dust, MOLA elevation
export const MARS_LOCATIONS: ExtraterrestrialLocation[] = [
  { id: 'mars-jezero', name: 'Jezero Crater', location: 'Perseverance site', lat: 18.4, lng: 77.7, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar + Nuclear', capacity: '4 MW', status: 'Best-mapped site',
    solarIrradianceW: 520, avgTemperatureC: -63, dustStormsPerYear: 18, elevationKm: -2.6, latencyToEarthMs: 750000, constructionCostMw: 1.2e9, coolingEfficiency: 85, radiationLevel: 'extreme' },
  { id: 'mars-gale', name: 'Gale Crater', location: 'Curiosity site', lat: -5.4, lng: 137.8, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar + Nuclear', capacity: '5 MW', status: '10+ yrs ground data',
    solarIrradianceW: 560, avgTemperatureC: -49, dustStormsPerYear: 20, elevationKm: -4.5, latencyToEarthMs: 750000, constructionCostMw: 1e9, coolingEfficiency: 82, radiationLevel: 'extreme' },
  { id: 'mars-hellas', name: 'Hellas Planitia', location: 'Deepest point (-8.2km)', lat: -42.7, lng: 70, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Nuclear (primary)', capacity: '8 MW', status: 'Warmest site (thick atmo)',
    solarIrradianceW: 380, avgTemperatureC: -33, dustStormsPerYear: 45, elevationKm: -8.2, latencyToEarthMs: 750000, constructionCostMw: 1.5e9, coolingEfficiency: 72, radiationLevel: 'high' },
  { id: 'mars-elysium', name: 'Elysium Planitia', location: 'InSight site', lat: 4.5, lng: 136, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar + Nuclear', capacity: '6 MW', status: 'Flat terrain, seismic data',
    solarIrradianceW: 550, avgTemperatureC: -55, dustStormsPerYear: 20, elevationKm: -2.6, latencyToEarthMs: 750000, constructionCostMw: 1.1e9, coolingEfficiency: 83, radiationLevel: 'extreme' },
  { id: 'mars-olympus', name: 'Olympus Mons Base', location: 'Highest point (+21.9km)', lat: 18.65, lng: -133.8, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar + Geothermal', capacity: '10 MW', status: 'Above dust storms',
    solarIrradianceW: 590, avgTemperatureC: -73, dustStormsPerYear: 8, elevationKm: 21.9, latencyToEarthMs: 750000, constructionCostMw: 2e9, coolingEfficiency: 90, radiationLevel: 'extreme' },
  { id: 'mars-valles', name: 'Valles Marineris', location: '4000km canyon system', lat: -14, lng: -70, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Nuclear + Solar', capacity: '8 MW', status: 'Canyon radiation shielding',
    solarIrradianceW: 500, avgTemperatureC: -47, dustStormsPerYear: 25, elevationKm: -5.0, latencyToEarthMs: 750000, constructionCostMw: 1.3e9, coolingEfficiency: 78, radiationLevel: 'high' },
  { id: 'mars-arcadia', name: 'Arcadia Planitia', location: 'Subsurface ice confirmed', lat: 46.7, lng: -170, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Nuclear (primary)', capacity: '5 MW', status: 'SpaceX candidate site',
    solarIrradianceW: 350, avgTemperatureC: -70, dustStormsPerYear: 15, elevationKm: -3.5, latencyToEarthMs: 750000, constructionCostMw: 1.4e9, coolingEfficiency: 88, radiationLevel: 'extreme' },
  { id: 'mars-syrtis', name: 'Syrtis Major Planum', location: 'Most stable for solar', lat: 8.4, lng: 69.5, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (540 W/m²)', capacity: '5 MW', status: 'Lowest dust storms',
    solarIrradianceW: 540, avgTemperatureC: -52, dustStormsPerYear: 12, elevationKm: 0.5, latencyToEarthMs: 750000, constructionCostMw: 1e9, coolingEfficiency: 80, radiationLevel: 'extreme' },
  { id: 'mars-noctis', name: 'Noctis Labyrinthus', location: 'Geothermal potential', lat: -6.9, lng: -102, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar + Geothermal', capacity: '6 MW', status: 'Active geology indicators',
    solarIrradianceW: 530, avgTemperatureC: -58, dustStormsPerYear: 22, elevationKm: 4.5, latencyToEarthMs: 750000, constructionCostMw: 1.2e9, coolingEfficiency: 84, radiationLevel: 'extreme' },
  { id: 'mars-utopia', name: 'Utopia Planitia', location: 'Zhurong site', lat: 25.1, lng: 110, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar + Nuclear', capacity: '5 MW', status: 'Chinese mission data',
    solarIrradianceW: 480, avgTemperatureC: -60, dustStormsPerYear: 28, elevationKm: -3.2, latencyToEarthMs: 750000, constructionCostMw: 1.1e9, coolingEfficiency: 86, radiationLevel: 'extreme' },
];
