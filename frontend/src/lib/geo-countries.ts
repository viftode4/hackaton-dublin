import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';

let cached: any[] | null = null;

export async function getCountryFeatures(): Promise<any[]> {
  if (cached) return cached;
  const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
  const topo: Topology = await res.json();
  const geojson = feature(topo, topo.objects.countries as any);
  cached = (geojson as any).features;
  return cached!;
}

/** Approximate centroid of a GeoJSON geometry by averaging all coordinates. */
export function getCentroid(geometry: any): { lat: number; lng: number } {
  const coords: [number, number][] =
    geometry.type === 'MultiPolygon'
      ? geometry.coordinates.flat(2)
      : geometry.coordinates.flat();
  const sum = coords.reduce(
    (acc, c) => [acc[0] + c[0], acc[1] + c[1]] as [number, number],
    [0, 0] as [number, number],
  );
  return { lng: sum[0] / coords.length, lat: sum[1] / coords.length };
}
