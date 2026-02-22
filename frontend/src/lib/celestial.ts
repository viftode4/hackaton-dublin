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
}

export const MOON_LOCATIONS: ExtraterrestrialLocation[] = [
  { id: 'moon-shackleton', name: 'Shackleton Crater Rim', location: 'South Pole (86% solar)', lat: -89.9, lng: 0, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (86% illumination)', capacity: '5 MW', status: 'Artemis III candidate' },
  { id: 'moon-connecting-ridge', name: 'Connecting Ridge', location: 'South Pole (93% solar — best)', lat: -89.5, lng: 45, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (93% — highest known)', capacity: '10 MW', status: 'Peak of Eternal Light' },
  { id: 'moon-de-gerlache', name: 'de Gerlache Crater Rim', location: 'South Pole (82% solar)', lat: -88.5, lng: -87, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (82% illumination)', capacity: '4 MW', status: 'Artemis candidate' },
  { id: 'moon-malapert', name: 'Malapert Mountain', location: 'South Pole (Earth-visible)', lat: -86.0, lng: 3, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (78% illumination)', capacity: '3 MW', status: 'Comms relay hub' },
  { id: 'moon-mare-tranq', name: 'Lava Tube, Mare Tranquillitatis', location: 'Sea of Tranquility', lat: 8.5, lng: 31.4, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar + Nuclear', capacity: '2 MW', status: 'Radiation-shielded' },
  { id: 'moon-aristarchus', name: 'Aristarchus Plateau', location: 'Thorium-rich region', lat: 23.7, lng: -47.4, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar + Thorium (future)', capacity: '3 MW', status: 'Resource extraction' },
  { id: 'moon-tsiolkovsky', name: 'Tsiolkovsky Crater', location: 'Far Side (radio-quiet)', lat: -21.2, lng: 128.9, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Nuclear + Solar', capacity: '2 MW', status: 'Radio-quiet zone' },
  { id: 'moon-north-pole', name: 'Peary Crater Rim', location: 'North Pole (76% solar)', lat: 88.6, lng: 33, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (76% illumination)', capacity: '4 MW', status: 'North pole alternative' },
];

export const MARS_LOCATIONS: ExtraterrestrialLocation[] = [
  { id: 'mars-jezero', name: 'Jezero Crater', location: 'Perseverance site (520 W/m²)', lat: 18.4, lng: 77.7, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (520 W/m²) + Nuclear', capacity: '4 MW', status: 'Best-mapped site' },
  { id: 'mars-gale', name: 'Gale Crater', location: 'Curiosity site (560 W/m²)', lat: -5.4, lng: 137.8, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (560 W/m²) + Nuclear', capacity: '5 MW', status: '10+ yrs ground data' },
  { id: 'mars-hellas', name: 'Hellas Planitia', location: 'Deepest point (-8.2km)', lat: -42.7, lng: 70, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Nuclear (primary)', capacity: '8 MW', status: 'Warmest site (thick atmo)' },
  { id: 'mars-elysium', name: 'Elysium Planitia', location: 'InSight site (550 W/m²)', lat: 4.5, lng: 136, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (550 W/m²) + Nuclear', capacity: '6 MW', status: 'Flat terrain, seismic data' },
  { id: 'mars-olympus', name: 'Olympus Mons Base', location: 'Highest point (+21.9km)', lat: 18.65, lng: -133.8, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (590 W/m²) + Geothermal', capacity: '10 MW', status: 'Above dust storms' },
  { id: 'mars-valles', name: 'Valles Marineris', location: '4000km canyon system', lat: -14, lng: -70, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Nuclear + Solar', capacity: '8 MW', status: 'Canyon radiation shielding' },
  { id: 'mars-arcadia', name: 'Arcadia Planitia', location: 'Subsurface ice confirmed', lat: 46.7, lng: -170, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Nuclear (primary)', capacity: '5 MW', status: 'SpaceX candidate site' },
  { id: 'mars-syrtis', name: 'Syrtis Major Planum', location: 'Lowest dust storms (12/yr)', lat: 8.4, lng: 69.5, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar (540 W/m²)', capacity: '5 MW', status: 'Most stable for solar' },
  { id: 'mars-noctis', name: 'Noctis Labyrinthus', location: 'Geothermal potential', lat: -6.9, lng: -102, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar + Geothermal', capacity: '6 MW', status: 'Active geology indicators' },
  { id: 'mars-utopia', name: 'Utopia Planitia', location: 'Zhurong site (480 W/m²)', lat: 25.1, lng: 110, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar + Nuclear', capacity: '5 MW', status: 'Chinese mission data' },
];
