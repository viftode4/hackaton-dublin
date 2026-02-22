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
  { id: 'luna-south-pole', name: 'Shackleton Crater', location: 'Lunar South Pole', lat: -89.9, lng: 0, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Continuous Solar', capacity: '5 MW', status: 'Planned 2028' },
  { id: 'luna-mare-tranq', name: 'Mare Tranquillitatis', location: 'Sea of Tranquility', lat: 8.5, lng: 31.4, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar + RTG', capacity: '2 MW', status: 'Conceptual' },
  { id: 'luna-aristarchus', name: 'Aristarchus Plateau', location: 'Aristarchus', lat: 23.7, lng: -47.4, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar Array', capacity: '3 MW', status: 'Proposed' },
  { id: 'luna-peaks-of-light', name: 'Peaks of Eternal Light', location: 'North Pole Ridge', lat: 89.5, lng: 45, body: 'moon', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Continuous Solar', capacity: '10 MW', status: 'Planned 2030' },
];

export const MARS_LOCATIONS: ExtraterrestrialLocation[] = [
  { id: 'mars-hellas', name: 'Hellas Planitia', location: 'Hellas Basin', lat: -42.7, lng: 70, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar + Nuclear', capacity: '8 MW', status: 'Conceptual 2035' },
  { id: 'mars-olympus', name: 'Olympus Mons Base', location: 'Tharsis Region', lat: 18.65, lng: -133.8, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Geothermal + Solar', capacity: '15 MW', status: 'Proposed 2040' },
  { id: 'mars-valles', name: 'Valles Marineris Hub', location: 'Valles Marineris', lat: -14, lng: -70, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Nuclear', capacity: '20 MW', status: 'Theoretical' },
  { id: 'mars-jezero', name: 'Jezero Crater', location: 'Syrtis Major', lat: 18.4, lng: 77.7, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Solar Array', capacity: '4 MW', status: 'Planned 2038' },
  { id: 'mars-elysium', name: 'Elysium Planitia', location: 'Elysium', lat: 4.5, lng: 136, body: 'mars', carbonIntensity: 0, baseCarbonIntensity: 0, powerSource: 'Nuclear + Solar', capacity: '12 MW', status: 'Conceptual 2037' },
];
