import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEXTURES_DIR = resolve(__dirname, '../../frontend/public/textures');

const TEXTURES = [
  // NASA SVS CGI Moon Kit — 2K color map (447 KB)
  {
    url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg',
    dest: 'moon-nasa.jpg',
    desc: 'Moon surface (LRO, 2K)',
  },
  // NASA SVS Moon elevation/bump map (109 KB)
  {
    url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg',
    dest: 'moon-bump.jpg',
    desc: 'Moon bump map (LOLA)',
  },
];

async function download(url, destName, desc) {
  const destPath = resolve(TEXTURES_DIR, destName);
  if (existsSync(destPath)) {
    console.log(`  SKIP ${desc} — already exists at ${destName}`);
    return;
  }
  console.log(`  Downloading ${desc} from ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
  console.log(`  DONE ${destName} (${(buf.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  if (!existsSync(TEXTURES_DIR)) {
    await mkdir(TEXTURES_DIR, { recursive: true });
  }

  console.log('=== Downloading NASA textures ===');
  for (const t of TEXTURES) {
    try {
      await download(t.url, t.dest, t.desc);
    } catch (err) {
      console.error(`  FAIL ${t.desc}: ${err.message}`);
    }
  }
  console.log('Done.');
}

main();
