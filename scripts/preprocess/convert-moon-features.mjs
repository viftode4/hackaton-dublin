import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { open } from 'shapefile';
import AdmZip from 'adm-zip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = resolve(__dirname, 'tmp');
const OUTPUT_DIR = resolve(__dirname, '../../frontend/public/data');
const OUTPUT_PATH = resolve(OUTPUT_DIR, 'moon-features.json');

const SHAPEFILE_URL = 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.zip';

// Feature types relevant for datacenter placement visualization
const RELEVANT_TYPES = ['Crater', 'Mare', 'Mons', 'Planitia', 'Lacus', 'Palus', 'Promontorium', 'Vallis', 'Rima', 'Sinus', 'Catena', 'Rupes', 'Dorsum'];
const MIN_DIAMETER_KM = 20; // Only craters >= 20km (non-crater features pass regardless)

async function main() {
  if (!existsSync(TMP_DIR)) await mkdir(TMP_DIR, { recursive: true });
  if (!existsSync(OUTPUT_DIR)) await mkdir(OUTPUT_DIR, { recursive: true });

  // Check if output already exists
  if (existsSync(OUTPUT_PATH)) {
    console.log('moon-features.json already exists. Delete it to re-generate.');
    return;
  }

  console.log('=== Converting USGS Moon nomenclature ===');
  console.log('Downloading shapefile...');
  const res = await fetch(SHAPEFILE_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zipPath = resolve(TMP_DIR, 'moon_nomenclature.zip');
  await writeFile(zipPath, buf);
  console.log(`  Downloaded ${(buf.length / 1024 / 1024).toFixed(1)} MB`);

  console.log('Extracting ZIP...');
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(TMP_DIR, true);

  // Find the .shp file
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

    // Filter: only relevant types
    if (!RELEVANT_TYPES.some(t => featureType.toLowerCase().includes(t.toLowerCase()))) continue;

    const diam = parseFloat(props.diameter) || 0;
    // For craters, apply minimum diameter filter
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

  // Sort by diameter descending for priority rendering
  features.sort((a, b) => b.diameter_km - a.diameter_km);

  await writeFile(OUTPUT_PATH, JSON.stringify(features, null, 2));
  console.log(`  Saved to ${OUTPUT_PATH}`);
  console.log('Done.');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
