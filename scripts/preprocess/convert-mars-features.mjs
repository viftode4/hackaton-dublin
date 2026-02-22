import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { open } from 'shapefile';
import AdmZip from 'adm-zip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = resolve(__dirname, 'tmp');
const OUTPUT_DIR = resolve(__dirname, '../../frontend/public/data');
const FEATURES_PATH = resolve(OUTPUT_DIR, 'mars-features.json');
const GEOLOGY_PATH = resolve(OUTPUT_DIR, 'mars-geology.json');

const SHAPEFILE_URL = 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.zip';
const GEOLOGY_API = 'https://astrogeology.usgs.gov/pygeoapi/collections/mars/sim3292_global_geologic_map/units/items?f=json&limit=200';

// Relevant Mars feature types
const RELEVANT_TYPES = ['Crater', 'Mons', 'Planitia', 'Planum', 'Vallis', 'Terra', 'Chasma', 'Fossae', 'Labyrinthus', 'Patera', 'Tholus', 'Colles'];
const MIN_DIAMETER_KM = 50; // Larger filter for Mars (more features)

async function convertFeatures() {
  if (existsSync(FEATURES_PATH)) {
    console.log('mars-features.json already exists. Delete to re-generate.');
    return;
  }

  console.log('=== Converting USGS Mars nomenclature ===');
  console.log('Downloading shapefile...');
  const res = await fetch(SHAPEFILE_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zipPath = resolve(TMP_DIR, 'mars_nomenclature.zip');
  await writeFile(zipPath, buf);
  console.log(`  Downloaded ${(buf.length / 1024 / 1024).toFixed(1)} MB`);

  console.log('Extracting ZIP...');
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(TMP_DIR, true);

  const entries = zip.getEntries();
  const shpEntry = entries.find(e => e.entryName.endsWith('.shp'));
  if (!shpEntry) throw new Error('No .shp found in zip');
  const shpPath = resolve(TMP_DIR, shpEntry.entryName);
  const dbfPath = shpPath.replace('.shp', '.dbf');

  console.log('Parsing shapefile...');
  const source = await open(shpPath, dbfPath);
  const features = [];
  let total = 0;

  while (true) {
    const result = await source.read();
    if (result.done) break;
    total++;

    const props = result.value.properties;
    const geom = result.value.geometry;
    if (!geom || !geom.coordinates) continue;

    const featureType = props.type || props.feature_type || props.feat_type || '';
    if (!RELEVANT_TYPES.some(t => featureType.toLowerCase().includes(t.toLowerCase()))) continue;

    const diam = parseFloat(props.diameter) || 0;
    if (featureType.toLowerCase().includes('crater') && diam < MIN_DIAMETER_KM) continue;

    features.push({
      name: props.name || props.clean_name || 'Unknown',
      type: featureType,
      lat: geom.coordinates[1],
      lng: geom.coordinates[0],
      diameter_km: Math.round(diam * 10) / 10,
    });
  }

  console.log(`  Parsed ${total} total features, kept ${features.length} (filtered)`);
  features.sort((a, b) => b.diameter_km - a.diameter_km);

  await writeFile(FEATURES_PATH, JSON.stringify(features, null, 2));
  console.log(`  Saved to ${FEATURES_PATH}`);
}

async function fetchGeology() {
  if (existsSync(GEOLOGY_PATH)) {
    console.log('mars-geology.json already exists. Delete to re-generate.');
    return;
  }

  console.log('=== Fetching Mars geologic map units from USGS pygeoapi ===');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(GEOLOGY_API, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const data = await res.json();

    if (data.features && data.features.length > 0) {
      console.log(`  Got ${data.features.length} geologic units`);
      await writeFile(GEOLOGY_PATH, JSON.stringify(data.features, null, 2));
      console.log(`  Saved to ${GEOLOGY_PATH}`);
    } else {
      throw new Error('No features in response');
    }
  } catch (err) {
    console.warn(`  pygeoapi unavailable (${err.message}), creating fallback regional data...`);
    // Fallback: create approximate Mars regions as simple polygons
    const fallbackRegions = createFallbackMarsRegions();
    await writeFile(GEOLOGY_PATH, JSON.stringify(fallbackRegions, null, 2));
    console.log(`  Saved fallback regions to ${GEOLOGY_PATH}`);
  }
}

function createFallbackMarsRegions() {
  // Major Mars geographic regions as approximate bounding polygons
  const regions = [
    { name: 'Tharsis Rise', age: 'Hesperian-Amazonian', rock_type: 'Volcanic', bounds: [-30, -160, 30, -80] },
    { name: 'Hellas Basin', age: 'Noachian', rock_type: 'Impact basin', bounds: [-60, 40, -20, 100] },
    { name: 'Elysium Region', age: 'Amazonian', rock_type: 'Volcanic', bounds: [-10, 120, 30, 170] },
    { name: 'Utopia Planitia', age: 'Hesperian', rock_type: 'Sedimentary/Volcanic', bounds: [20, 80, 55, 140] },
    { name: 'Acidalia Planitia', age: 'Hesperian', rock_type: 'Sedimentary', bounds: [30, -60, 60, 0] },
    { name: 'Syrtis Major', age: 'Hesperian', rock_type: 'Volcanic', bounds: [-5, 55, 25, 85] },
    { name: 'Noachis Terra', age: 'Noachian', rock_type: 'Highland/Cratered', bounds: [-60, -30, -20, 40] },
    { name: 'Arabia Terra', age: 'Noachian', rock_type: 'Highland', bounds: [0, -10, 40, 50] },
    { name: 'Amazonis Planitia', age: 'Amazonian', rock_type: 'Volcanic plain', bounds: [0, -180, 35, -135] },
    { name: 'Chryse Planitia', age: 'Hesperian', rock_type: 'Outflow sediment', bounds: [10, -55, 40, -20] },
    { name: 'Vastitas Borealis', age: 'Hesperian', rock_type: 'Northern lowlands', bounds: [55, -180, 85, 180] },
    { name: 'Valles Marineris', age: 'Hesperian', rock_type: 'Tectonic canyon', bounds: [-20, -110, 0, -40] },
    { name: 'Terra Cimmeria', age: 'Noachian', rock_type: 'Highland', bounds: [-60, 130, -20, 180] },
    { name: 'Arcadia Region', age: 'Amazonian', rock_type: 'Volcanic/Ice', bounds: [35, -180, 55, -140] },
  ];

  return regions.map(r => {
    const [latMin, lngMin, latMax, lngMax] = r.bounds;
    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [lngMin, latMin],
          [lngMax, latMin],
          [lngMax, latMax],
          [lngMin, latMax],
          [lngMin, latMin],
        ]],
      },
      properties: {
        unit_name: r.name,
        age: r.age,
        rock_type: r.rock_type,
      },
    };
  });
}

async function main() {
  if (!existsSync(TMP_DIR)) await mkdir(TMP_DIR, { recursive: true });
  if (!existsSync(OUTPUT_DIR)) await mkdir(OUTPUT_DIR, { recursive: true });

  await convertFeatures();
  await fetchGeology();
  console.log('Done.');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
