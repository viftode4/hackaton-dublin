import { useState, useEffect, useRef, useMemo } from 'react';
import { PanelRightClose, PanelRightOpen, Bot, MapPin as MapPinIcon, ArrowUpDown, Satellite } from 'lucide-react';
import { GROUND_REGIONS, INITIAL_SATELLITES, type GroundRegion, type SatelliteData } from '@/lib/constants';
import { fetchTLEGroup, computeOrbitalMetrics, type TLERecord } from '@/lib/tle-service';
import { propagateAll, BAND_LABELS, type SatelliteCategory } from '@/lib/satellite-store';
import GlobeView from '@/components/GlobeView';
import Sidebar from '@/components/Sidebar';
import OrbitSidebar from '@/components/OrbitSidebar';
import TopNav, { type AppTab } from '@/components/TopNav';
import ScorecardPanel from '@/components/ScorecardPanel';
import InventoryPanel, { type InventoryItem } from '@/components/InventoryPanel';
import ComparePanel, { type CompareLocation } from '@/components/ComparePanel';
import AddLocationPanel, { type NewLocationData } from '@/components/AddLocationPanel';
import CountryCard from '@/components/CountryCard';
import ChatPanel from '@/components/ChatPanel';
import RankingsPanel from '@/components/RankingsPanel';
import LocationDetailCard, { type LocationDetail } from '@/components/LocationDetailCard';
import TimelineBar from '@/components/TimelineBar';
import { type DataLayers } from '@/components/GlobeView';
import { type ScenarioId } from '@/lib/regression-model';
import { type CelestialBody, type ExtraterrestrialLocation } from '@/lib/celestial';
import type { CO2Estimate } from '@/lib/co2-api';
import { estimateCO2 } from '@/lib/co2-api';
import { getLocations, getInventories, createInventory, deleteInventory, mintToSolana, listBlueprints, type BackendLocation } from '@/lib/api';
import { loadPowerPlantLOD, loadDataCenters, type PowerPlantLOD, type DataCenter } from '@/lib/geo-data';
import { useAuth } from '@/lib/auth';

/** Map a backend location (body=earth) to a GroundRegion for the globe. */
function toGroundRegion(loc: BackendLocation): GroundRegion {
  // Extract a short "location" label from the full name (e.g. "Dublin, Ireland" → "Ireland")
  const parts = loc.name.split(',').map(s => s.trim());
  const shortName = parts[0]; // city name
  const locationLabel = parts[1] ?? loc.name; // country or full name
  return {
    id: loc.id,
    name: shortName,
    location: locationLabel,
    lat: loc.coordinates.lat,
    lng: loc.coordinates.lng,
    baseCarbonIntensity: loc.carbon_intensity_gco2,
    carbonIntensity: loc.carbon_intensity_gco2,
    energyCostKwh: loc.energy_cost_kwh,
    landCostSqm: loc.land_cost_sqm,
    constructionCostMw: loc.construction_cost_mw,
    coolingCostFactor: loc.cooling_cost_factor,
    disasterRisk: loc.disaster_risk,
    politicalStability: loc.political_stability,
  };
}

/** Map a backend location (body=moon|mars) to an ExtraterrestrialLocation. */
function toExtraterrestrialLocation(loc: BackendLocation): ExtraterrestrialLocation {
  const parts = loc.name.split(',').map(s => s.trim());
  return {
    id: loc.id,
    name: parts[0],
    location: parts[1] ?? loc.name,
    lat: loc.coordinates.lat,
    lng: loc.coordinates.lng,
    body: loc.body as CelestialBody,
    carbonIntensity: loc.carbon_intensity_gco2,
    baseCarbonIntensity: loc.carbon_intensity_gco2,
    powerSource: loc.energy_sources.join(', '),
    capacity: `${(loc.construction_cost_mw / 1e6).toFixed(0)}M build`,
    status: loc.special_factors[0] ?? 'Available',
  };
}

export default function Atlas() {
  const { user } = useAuth();
  const customerId = user?.username;
  const [regions, setRegions] = useState<GroundRegion[]>(GROUND_REGIONS);
  const [satellites, setSatellites] = useState<SatelliteData[]>(INITIAL_SATELLITES);
  const [moonLocations, setMoonLocations] = useState<ExtraterrestrialLocation[] | undefined>();
  const [marsLocations, setMarsLocations] = useState<ExtraterrestrialLocation[] | undefined>();
  const [routingTarget, setRoutingTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showInit, setShowInit] = useState(true);
  
  const [activeTab, setActiveTab] = useState<AppTab>('map');
  const [celestialBody, setCelestialBody] = useState<CelestialBody>('earth');
  const [compareSelected, setCompareSelected] = useState<string[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [zoomTarget, setZoomTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [scorecardTarget, setScorecardTarget] = useState<{
    id: string; name: string; body: string; carbon: number;
    locationData?: Record<string, unknown>;
    initialViewMode?: 'scorecard' | 'blueprint';
  } | null>(null);
  const [mintingId, setMintingId] = useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = useState<'explore' | 'rankings' | 'chat' | 'satellites'>('explore');
  const [dataLayers, setDataLayers] = useState<DataLayers>({ heatmap: true, powerPlants: false, datacenters: false });
  const [selectedLocation, setSelectedLocation] = useState<LocationDetail | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<{
    name: string; lat: number; lng: number; co2?: CO2Estimate;
  } | null>(null);
  // Candidates added to compare — persists after selectedCountry is dismissed
  const [candidateCountries, setCandidateCountries] = useState<CompareLocation[]>([]);

  // GeoJSON data layers
  const [powerPlantLOD, setPowerPlantLOD] = useState<PowerPlantLOD | null>(null);
  const [globalDatacenters, setGlobalDatacenters] = useState<DataCenter[]>([]);

  // TLE records for real-time SGP4 propagation
  const tleRecordsRef = useRef<TLERecord[]>([]);
  // Active satellite category filters (all on by default)
  const [activeCategories, setActiveCategories] = useState<Set<SatelliteCategory>>(
    new Set(['station', 'weather', 'comms', 'earth-obs', 'navigation', 'science', 'other'])
  );
  const [satelliteSearch, setSatelliteSearch] = useState('');
  const [projectionYear, setProjectionYear] = useState(2025);
  const [scenario, setScenario] = useState<ScenarioId>('net_zero');

  // Map of all backend locations for enriching inventory items
  const locationsRef = useRef<Map<string, BackendLocation>>(new Map());

  // Fetch locations + inventories from backend on mount
  useEffect(() => {
    getLocations()
      .then(async (data) => {
        // Build a lookup map for enriching inventory
        const locMap = new Map<string, BackendLocation>();
        for (const loc of data) locMap.set(loc.id, loc);
        locationsRef.current = locMap;

        const earth = data.filter(l => l.body === 'earth').map(toGroundRegion);
        const moon = data.filter(l => l.body === 'moon').map(toExtraterrestrialLocation);
        const mars = data.filter(l => l.body === 'mars').map(toExtraterrestrialLocation);

        if (earth.length > 0) setRegions(earth);
        if (moon.length > 0) setMoonLocations(moon);
        if (mars.length > 0) setMarsLocations(mars);

        // Now fetch persisted inventories and enrich with location data
        try {
          const backendInv = await getInventories();
          const inventoryLocationIds = new Set(backendInv.map(bi => bi.location_id));

          // Sync: create inventory + mint for any paid blueprints
          const blueprintLocationIds = new Set<string>();
          try {
            const blueprints = await listBlueprints(customerId);
            for (const bp of blueprints) blueprintLocationIds.add(bp.location_id);
            for (const bp of blueprints) {
              const existing = backendInv.find(bi => bi.location_id === bp.location_id);
              if (!existing) {
                // Missing from inventory — create + mint
                try {
                  const loc = locMap.get(bp.location_id);
                  const created = await createInventory({
                    inventory: {
                      location_id: bp.location_id,
                      name: bp.location_name || loc?.name || bp.location_id,
                      capacity_mw: Math.round(10 + Math.random() * 90),
                      utilization_pct: Math.round(40 + Math.random() * 55),
                      carbon_footprint_tons: loc?.carbon_intensity_gco2 ?? 0,
                      power_source: loc?.energy_sources[0] ?? null,
                      monthly_cost: Math.round(100000 + Math.random() * 900000),
                      workload_types: ['General'],
                    },
                  });
                  backendInv.push(created);
                  try {
                    await mintToSolana(bp.location_id, created.id, customerId);
                    const updated = await getInventories();
                    const match = updated.find(i => i.id === created.id);
                    if (match) {
                      const idx = backendInv.findIndex(i => i.id === created.id);
                      if (idx >= 0) backendInv[idx] = match;
                    }
                  } catch {}
                } catch {}
              } else if (!existing.solana_tx_hash) {
                // In inventory but not minted — mint now
                try {
                  await mintToSolana(bp.location_id, existing.id, customerId);
                  const updated = await getInventories();
                  const match = updated.find(i => i.id === existing.id);
                  if (match) {
                    const idx = backendInv.findIndex(i => i.id === existing.id);
                    if (idx >= 0) backendInv[idx] = match;
                  }
                } catch {}
              }
            }
          } catch {}

          const enriched: InventoryItem[] = backendInv.map(bi => {
            const loc = locMap.get(bi.location_id);
            const parts = (loc?.name ?? bi.name).split(',').map(s => s.trim());
            return {
              id: bi.location_id,
              backendId: bi.id,
              name: bi.name,
              location: loc ? (parts[1] ?? loc.name) : 'Unknown',
              body: loc?.body ?? 'earth',
              lat: loc?.coordinates.lat ?? 0,
              lng: loc?.coordinates.lng ?? 0,
              capacityMW: bi.capacity_mw,
              utilization: bi.utilization_pct,
              carbonFootprint: bi.carbon_footprint_tons,
              monthlyCost: bi.monthly_cost,
              solanaTxHash: bi.solana_tx_hash ?? undefined,
              hasBlueprint: blueprintLocationIds.has(bi.location_id),
            };
          });
          if (enriched.length > 0) setInventory(enriched);
        } catch {
          // Inventory fetch failed — start with empty, no-op
        }
      })
      .catch(() => {
        // API down — keep hardcoded fallbacks, no-op
      });
  }, []);

  // Fetch ALL active TLE data from CelesTrak via backend proxy
  useEffect(() => {
    async function loadAllTLEs() {
      try {
        const tles = await fetchTLEGroup('active');
        console.log(`Fetched ${tles.length} TLE records from CelesTrak`);
        tleRecordsRef.current = tles;
        const sats = propagateAll(tles);
        if (sats.length > 0) {
          console.log(`Propagated ${sats.length} satellite positions`);
          setSatellites(sats);
        }
      } catch (err) {
        console.warn('TLE fetch failed, trying stations group:', err);
        try {
          const tles = await fetchTLEGroup('stations');
          tleRecordsRef.current = tles;
          const sats = propagateAll(tles);
          if (sats.length > 0) setSatellites(sats);
        } catch {
          console.warn('All TLE fetches failed, using hardcoded satellites');
        }
      }
    }
    loadAllTLEs();
  }, []);

  // Load GeoJSON data layers (power plants + global datacenters)
  useEffect(() => {
    loadPowerPlantLOD().then(setPowerPlantLOD).catch(() => {});
    loadDataCenters().then(setGlobalDatacenters).catch(() => {});
  }, []);

  // Carbon fluctuation every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      setRegions(prev => prev.map(r => ({
        ...r,
        carbonIntensity: r.baseCarbonIntensity + Math.round((Math.random() - 0.5) * 30),
      })));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Real-time SGP4 propagation every 3s
  useEffect(() => {
    const interval = setInterval(() => {
      if (tleRecordsRef.current.length === 0) return;
      const sats = propagateAll(tleRecordsRef.current);
      if (sats.length > 0) setSatellites(sats);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Init message fade
  useEffect(() => {
    const t = setTimeout(() => setShowInit(false), 2500);
    return () => clearTimeout(t);
  }, []);

  // Build CompareLocation[] from all backend data sources for the compare panel
  const compareLocations = useMemo<CompareLocation[]>(() => {
    const locs: CompareLocation[] = [];
    for (const r of regions) {
      locs.push({ id: r.id, name: `${r.name} (${r.location})`, body: 'earth', region: 'earth', carbon: r.carbonIntensity, location: r.location });
    }
    for (const s of satellites) {
      locs.push({ id: s.id, name: s.name, body: 'orbit', region: 'orbit', carbon: s.carbonScore, location: s.status });
    }
    if (moonLocations) {
      for (const m of moonLocations) {
        locs.push({ id: m.id, name: `${m.name} (${m.location})`, body: 'moon', region: 'moon', carbon: m.carbonIntensity, location: m.location });
      }
    }
    if (marsLocations) {
      for (const m of marsLocations) {
        locs.push({ id: m.id, name: `${m.name} (${m.location})`, body: 'mars', region: 'mars', carbon: m.carbonIntensity, location: m.location });
      }
    }
    // Include candidate countries that were added to compare
    for (const c of candidateCountries) {
      if (!locs.some(l => l.id === c.id)) {
        locs.push(c);
      }
    }
    return locs;
  }, [regions, satellites, moonLocations, marsLocations, candidateCountries]);

  const handleLocationClick = (id: string, name: string, body: string, carbon: number, regionData?: import('@/lib/constants').GroundRegion, satData?: import('@/lib/constants').SatelliteData, etData?: ExtraterrestrialLocation) => {
    // Clear country selection when clicking a datacenter/satellite
    setSelectedCountry(null);

    // Enrich satellite with orbital metrics from TLE (computed on-demand, not during batch propagation)
    let enrichedSat = satData;
    if (body === 'orbit' && satData?.noradId) {
      const tle = tleRecordsRef.current.find(t => t.NORAD_CAT_ID === satData.noradId);
      if (tle) {
        const metrics = computeOrbitalMetrics(tle);
        enrichedSat = {
          ...satData,
          apogeeKm: metrics.apogeeKm,
          perigeeKm: metrics.perigeeKm,
          eclipseFraction: metrics.eclipseFraction,
          radiationLevel: metrics.radiationLevel,
          powerAvailabilityW: metrics.powerAvailabilityW,
          latencyMs: metrics.latencyToGroundMs,
        };
      }
    }

    const detail: LocationDetail = { id, name, body, carbon, region: regionData, satellite: enrichedSat, extraterrestrial: etData };

    // Enrich with country CO2 data for Earth locations
    if (body === 'earth' && regionData) {
      estimateCO2(regionData.lat, regionData.lng, regionData.location).then((co2) => {
        setSelectedLocation({ ...detail, countryCO2: co2 });
      }).catch(() => {
        setSelectedLocation(detail);
      });
    } else {
      setSelectedLocation(detail);
    }
  };

  const handleAddToInventory = async (locationId: string, locationName: string, body: string, carbon: number): Promise<number | undefined> => {
    if (inventory.some(i => i.id === locationId)) {
      // Already in inventory — return existing backend ID
      return inventory.find(i => i.id === locationId)?.backendId;
    }
    const region = regions.find(r => r.id === locationId);
    const sat = satellites.find(s => s.id === locationId);
    const lat = region?.lat ?? sat?.lat ?? 0;
    const lng = region?.lng ?? sat?.lng ?? 0;
    const location = region?.location ?? sat?.status ?? body;
    const capacityMW = Math.round(10 + Math.random() * 90);
    const utilization = Math.round(40 + Math.random() * 55);
    const monthlyCost = Math.round(100000 + Math.random() * 900000);

    const loc = locationsRef.current.get(locationId);
    try {
      const created = await createInventory({
        inventory: {
          location_id: locationId,
          name: locationName,
          capacity_mw: capacityMW,
          utilization_pct: utilization,
          carbon_footprint_tons: carbon,
          power_source: loc?.energy_sources[0] ?? null,
          monthly_cost: monthlyCost,
          workload_types: ['General'],
        },
      });
      const newItem: InventoryItem = {
        id: locationId, backendId: created.id, name: locationName, location, body, lat, lng,
        capacityMW, utilization, carbonFootprint: carbon, monthlyCost,
        solanaTxHash: created.solana_tx_hash ?? undefined,
      };
      setInventory(prev => [...prev, newItem]);
      return created.id;
    } catch (err) {
      console.error('Failed to persist inventory item:', err);
      return undefined;
    }
  };

  const handleRemoveFromInventory = async (id: string) => {
    const item = inventory.find(i => i.id === id);
    if (item?.backendId) {
      try {
        await deleteInventory(item.backendId);
      } catch (err) {
        console.error('Failed to delete inventory item:', err);
        return; // don't remove from state if API fails
      }
    }
    setInventory(prev => prev.filter(i => i.id !== id));
  };

  const handleInventoryClick = (item: InventoryItem) => {
    // Set the celestial body to match
    if (item.body === 'earth') setCelestialBody('earth');
    else if (item.body === 'orbit') setCelestialBody('orbit');
    else if (item.body === 'moon') setCelestialBody('moon');
    else if (item.body === 'mars') setCelestialBody('mars');
    setZoomTarget({ lat: item.lat, lng: item.lng });
  };

  const handleViewBlueprint = (item: InventoryItem) => {
    setScorecardTarget({
      id: item.id,
      name: item.name,
      body: item.body,
      carbon: item.carbonFootprint,
      initialViewMode: 'blueprint',
    });
    setSidebarOpen(true);
  };

  const handleMintToSolana = async (item: InventoryItem) => {
    if (!item.backendId || item.solanaTxHash) return;
    setMintingId(item.id);
    try {
      const result = await mintToSolana(item.id, item.backendId, customerId);
      setInventory(prev => prev.map(i =>
        i.id === item.id ? { ...i, solanaTxHash: result.tx_hash } : i
      ));
    } catch (err) {
      console.error('Mint failed:', err);
    } finally {
      setMintingId(null);
    }
  };

  const handleAddLocation = async (loc: NewLocationData) => {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const capacityMW = loc.capacityMW || 1;
    try {
      const created = await createInventory({
        inventory: {
          location_id: id,
          name: loc.name,
          capacity_mw: capacityMW,
          utilization_pct: 1,
          carbon_footprint_tons: 0,
          power_source: null,
          monthly_cost: 1,
          workload_types: ['General'],
        },
      });
      const newItem: InventoryItem = {
        id, backendId: created.id, name: loc.name,
        location: `${loc.city}${loc.country ? ', ' + loc.country : ''}`,
        body: 'earth', lat: loc.lat, lng: loc.lng,
        capacityMW, utilization: 0, carbonFootprint: 0, monthlyCost: 0,
      };
      setInventory(prev => [...prev, newItem]);
      setActiveTab('inventory');
    } catch (err) {
      console.error('Failed to persist custom location:', err);
    }
  };

  const handleBulkAddLocations = (locations: NewLocationData[]) => {
    const newItems: InventoryItem[] = locations.map((loc, i) => ({
      id: `custom-${Date.now()}-${i}`,
      name: loc.name,
      location: `${loc.city}${loc.country ? ', ' + loc.country : ''}`,
      body: 'earth', lat: loc.lat, lng: loc.lng,
      capacityMW: loc.capacityMW || 0,
      utilization: 0,
      carbonFootprint: 0,
      monthlyCost: 0,
    }));
    setInventory(prev => [...prev, ...newItems]);
  };

  /** Build backend-compatible location data from frontend LocationDetail for AI reports */
  const buildLocationData = (loc: LocationDetail): Record<string, unknown> => {
    const sat = loc.satellite;
    const et = loc.extraterrestrial;
    const region = loc.region;

    if (loc.body === 'orbit' && sat) {
      const band = sat.status ? (BAND_LABELS[sat.status as import('@/lib/satellite-store').OrbitalBand] ?? sat.status) : 'LEO';
      return {
        id: loc.id,
        name: loc.name,
        body: 'orbit',
        coordinates: { lat: sat.lat ?? 0, lng: sat.lng ?? 0 },
        energy_cost_kwh: sat.powerAvailabilityW ? Math.round(10000 / (sat.powerAvailabilityW / 100)) : 7000,
        energy_sources: [`solar (${sat.eclipseFraction ? Math.round(sat.eclipseFraction * 100) : 35}% eclipse)`],
        carbon_intensity_gco2: 0,
        avg_temperature_c: -170,
        cooling_method: 'radiative (vacuum)',
        cooling_cost_factor: 0,
        land_cost_sqm: 0,
        construction_cost_mw: 500000000,
        latency_ms: { earth: sat.latencyMs ?? 10 },
        disaster_risk: sat.radiationLevel === 'extreme' ? 80 : sat.radiationLevel === 'high' ? 60 : 30,
        political_stability: 75,
        regulatory: 'International Space Law',
        connectivity: ['Ground station pass', 'TDRSS relay'],
        special_factors: [
          `${band} band`,
          `Altitude: ${sat.altitudeKm ?? sat.altitude ?? 0} km`,
          `Inclination: ${sat.inclination ?? 0}°`,
          `Period: ${sat.period ?? 0} min`,
          `Eclipse fraction: ${sat.eclipseFraction ?? 0}`,
          `Radiation: ${sat.radiationLevel ?? 'unknown'}`,
          `Power: ${sat.powerAvailabilityW ?? 0} W/m²`,
          sat.noradId ? `NORAD ${sat.noradId}` : '',
          sat.category ?? '',
        ].filter(Boolean),
        orbital_metrics: {
          altitude_km: sat.altitudeKm ?? sat.altitude,
          apogee_km: sat.apogeeKm,
          perigee_km: sat.perigeeKm,
          inclination_deg: sat.inclination,
          period_minutes: sat.period,
          eclipse_fraction: sat.eclipseFraction,
          radiation_level: sat.radiationLevel,
          power_availability_w: sat.powerAvailabilityW,
          latency_ms: sat.latencyMs,
          norad_id: sat.noradId,
          band,
          category: sat.category,
        },
      };
    }

    if ((loc.body === 'moon' || loc.body === 'mars') && et) {
      return {
        id: loc.id,
        name: loc.name,
        body: loc.body,
        coordinates: { lat: et.lat, lng: et.lng },
        energy_cost_kwh: loc.body === 'moon' ? 12000 : 25000,
        energy_sources: et.solarIrradianceW > 800 ? ['solar'] : ['nuclear', 'solar'],
        carbon_intensity_gco2: 0,
        avg_temperature_c: et.avgTemperatureC,
        cooling_method: loc.body === 'moon' ? 'radiative (vacuum)' : 'CO₂ atmosphere radiative',
        cooling_cost_factor: 0,
        land_cost_sqm: 0,
        construction_cost_mw: et.constructionCostMw ?? 2000000000,
        latency_ms: { earth: loc.body === 'moon' ? 1300 : 900000 },
        disaster_risk: et.dustStormsPerYear ? Math.min(80, et.dustStormsPerYear * 10) : 20,
        political_stability: 90,
        regulatory: 'Outer Space Treaty',
        connectivity: loc.body === 'moon' ? ['Direct Earth link', 'Lunar relay'] : ['DSN relay', 'Mars relay orbit'],
        special_factors: [
          `Illumination: ${et.illuminationPct}%`,
          `Temperature: ${et.avgTemperatureC}°C`,
          `Solar irradiance: ${et.solarIrradianceW} W/m²`,
          et.iceProximityKm != null ? `Ice proximity: ${et.iceProximityKm} km` : '',
          et.earthVisible ? 'Earth visible' : 'No Earth line-of-sight',
          et.elevationKm != null ? `Elevation: ${et.elevationKm} km` : '',
        ].filter(Boolean),
        extraterrestrial_metrics: {
          illumination_pct: et.illuminationPct,
          avg_temperature_c: et.avgTemperatureC,
          ice_proximity_km: et.iceProximityKm,
          earth_visible: et.earthVisible,
          solar_irradiance_w: et.solarIrradianceW,
          dust_storms_per_year: et.dustStormsPerYear,
          elevation_km: et.elevationKm,
        },
      };
    }

    // Earth: use backend region data if available
    if (region) {
      return {
        id: loc.id,
        name: loc.name,
        body: 'earth',
        coordinates: { lat: region.lat, lng: region.lng },
        energy_cost_kwh: region.energyCostKwh ?? 0,
        energy_sources: [],
        carbon_intensity_gco2: region.carbonIntensity,
        avg_temperature_c: 20,
        cooling_method: 'standard',
        cooling_cost_factor: region.coolingCostFactor ?? 1,
        land_cost_sqm: region.landCostSqm ?? 0,
        construction_cost_mw: region.constructionCostMw ?? 10000000,
        latency_ms: {},
        disaster_risk: region.disasterRisk ?? 30,
        political_stability: region.politicalStability ?? 70,
        regulatory: '',
        connectivity: [],
        special_factors: [`Location: ${region.location}`],
      };
    }

    // Fallback: minimal data
    return { id: loc.id, name: loc.name, body: loc.body, carbon_intensity_gco2: loc.carbon };
  };

  const renderSidePanel = () => {
    if (scorecardTarget) {
      return (
        <ScorecardPanel
          locationId={scorecardTarget.id}
          locationName={scorecardTarget.name}
          body={scorecardTarget.body}
          carbonIntensity={scorecardTarget.carbon}
          customerId={customerId}
          locationData={scorecardTarget.locationData}
          initialViewMode={scorecardTarget.initialViewMode}
          onClose={() => setScorecardTarget(null)}
          onInventoryChanged={() => {
            Promise.all([getInventories(), listBlueprints(customerId)]).then(([backendInv, bps]) => {
              const bpIds = new Set(bps.map(bp => bp.location_id));
              const enriched: InventoryItem[] = backendInv.map(bi => {
                const loc = locationsRef.current.get(bi.location_id);
                const parts = (loc?.name ?? bi.name).split(',').map(s => s.trim());
                return {
                  id: bi.location_id,
                  backendId: bi.id,
                  name: bi.name,
                  location: loc ? (parts[1] ?? loc.name) : 'Unknown',
                  body: loc?.body ?? 'earth',
                  lat: loc?.coordinates.lat ?? 0,
                  lng: loc?.coordinates.lng ?? 0,
                  capacityMW: bi.capacity_mw,
                  utilization: bi.utilization_pct,
                  carbonFootprint: bi.carbon_footprint_tons,
                  monthlyCost: bi.monthly_cost,
                  solanaTxHash: bi.solana_tx_hash ?? undefined,
                  hasBlueprint: bpIds.has(bi.location_id),
                };
              });
              setInventory(enriched);
            }).catch(() => {});
          }}
        />
      );
    }

    switch (activeTab) {
      case 'inventory':
        return <InventoryPanel items={inventory} onRemove={handleRemoveFromInventory} onItemClick={handleInventoryClick} onViewBlueprint={handleViewBlueprint} onMint={handleMintToSolana} mintingId={mintingId} />;
      case 'compare':
        return <ComparePanel selected={compareSelected} onSelectedChange={setCompareSelected} locations={compareLocations} projectionYear={projectionYear} scenario={scenario} />;
      case 'add':
        return <AddLocationPanel onAdd={handleAddLocation} onBulkAdd={handleBulkAddLocations} />;
    }
  };

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
      <TopNav activeTab={activeTab} onTabChange={(tab) => { setActiveTab(tab); setScorecardTarget(null); setSidebarOpen(true); }} />

      <div className="flex flex-1 overflow-hidden">
        {/* Globe */}
        <div className={sidebarOpen ? undefined : "flex-1"} style={sidebarOpen ? { position: 'relative', overflow: 'hidden', flex: activeTab === 'compare' && compareSelected.length > 2 ? `${Math.max(30, 65 - (compareSelected.length - 2) * 8)}` : '65' } : { position: 'relative', overflow: 'hidden' }}>
          <GlobeView
            regions={activeTab === 'compare' && compareSelected.length > 0
              ? regions.filter(r => compareSelected.includes(r.id))
              : regions}
            satellites={activeTab === 'compare' && compareSelected.length > 0
              ? satellites.filter(s => compareSelected.includes(s.id))
              : satellites}
            routingTarget={routingTarget}
            celestialBody={celestialBody}
            onCelestialBodyChange={setCelestialBody}
            onLocationClick={handleLocationClick}
            zoomTarget={zoomTarget}
            moonLocations={moonLocations}
            marsLocations={marsLocations}
            dataLayers={dataLayers}
            onDataLayersChange={setDataLayers}
            onCountryClick={(country) => {
              setSelectedCountry(country);
              setSelectedLocation(null);
              setScorecardTarget(null);
            }}
            activeCountry={selectedCountry}
            activeLocation={selectedLocation}
            powerPlantLOD={powerPlantLOD ?? undefined}
            globalDatacenters={globalDatacenters}
            activeCategories={activeCategories}
            onActiveCategoriesChange={setActiveCategories}
            satelliteSearch={satelliteSearch}
            onSatelliteSearchChange={setSatelliteSearch}
            projectionYear={projectionYear}
            scenario={scenario}
          />

          {/* Timeline bar for CO₂ projections */}
          {dataLayers.heatmap && celestialBody === 'earth' && (
            <TimelineBar
              year={projectionYear}
              onYearChange={setProjectionYear}
              scenario={scenario}
              onScenarioChange={setScenario}
            />
          )}

          {/* Init overlay */}
          {showInit && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-fade-out-delay">
              <p className="text-white/50 text-sm font-medium animate-pulse">Initializing orbital feeds...</p>
            </div>
          )}

          {/* Legend */}
          {celestialBody === 'earth' && (
            <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur-sm rounded-lg p-3 text-[10px] space-y-1.5 max-w-[180px]">
              <p className="text-foreground font-semibold text-xs">CO₂ Intensity (g/kWh)</p>
              <div className="h-2 w-full rounded" style={{ background: 'linear-gradient(to right, hsl(120,80%,50%), hsl(60,80%,50%), hsl(0,80%,50%))' }} />
              <div className="flex justify-between text-muted-foreground">
                <span>0</span><span>400+</span>
              </div>
            </div>
          )}
          {celestialBody === 'moon' && (
            <div className="absolute bottom-4 left-4 bg-black/90 backdrop-blur-sm border border-white/10 rounded-lg p-3.5 text-[11px] space-y-2 max-w-[200px]">
              <p className="text-white font-semibold text-xs">Lunar Features</p>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#66bbdd', boxShadow: '0 0 4px #66bbdd88' }} />
                <span className="text-white/70">Maria (seas)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#ddbb66', boxShadow: '0 0 4px #ddbb6688' }} />
                <span className="text-white/70">Montes (mountains)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#bbbbbb', boxShadow: '0 0 4px #bbbbbb88' }} />
                <span className="text-white/70">Craters</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="shrink-0" style={{ background: '#00e5ff', width: '12px', height: '12px', transform: 'rotate(45deg)', borderRadius: '2px', boxShadow: '0 0 6px #00e5ff88' }} />
                <span className="text-white/70 ml-0.5">Datacenter sites</span>
              </div>
            </div>
          )}
          {celestialBody === 'mars' && (
            <div className="absolute bottom-4 left-4 bg-black/90 backdrop-blur-sm border border-white/10 rounded-lg p-3.5 text-[11px] space-y-2 max-w-[200px]">
              <p className="text-white font-semibold text-xs">Mars Geology</p>
              <div className="flex items-center gap-2">
                <span className="w-4 h-2.5 rounded-sm shrink-0" style={{ background: 'rgba(80, 150, 240, 0.8)' }} />
                <span className="text-white/70">Amazonian (young)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-2.5 rounded-sm shrink-0" style={{ background: 'rgba(230, 170, 70, 0.8)' }} />
                <span className="text-white/70">Hesperian (mid)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-2.5 rounded-sm shrink-0" style={{ background: 'rgba(210, 100, 70, 0.8)' }} />
                <span className="text-white/70">Noachian (ancient)</span>
              </div>
              <div className="flex items-center gap-2 mt-1 pt-1 border-t border-white/10">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#ee8855', boxShadow: '0 0 4px #ee885588' }} />
                <span className="text-white/70">Volcanoes</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#6688ee', boxShadow: '0 0 4px #6688ee88' }} />
                <span className="text-white/70">Canyons/Valleys</span>
              </div>
            </div>
          )}

          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(prev => !prev)}
            className="absolute top-4 right-4 z-20 bg-card/80 backdrop-blur-sm border border-border rounded-lg p-2 hover:bg-card transition-colors"
            title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {sidebarOpen ? <PanelRightClose className="w-4 h-4 text-foreground" /> : <PanelRightOpen className="w-4 h-4 text-foreground" />}
          </button>
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <div style={{ flex: activeTab === 'compare' && compareSelected.length > 2 ? `${Math.min(70, 35 + (compareSelected.length - 2) * 8)}` : '35' }} className="flex flex-col border-l border-border min-w-[340px] bg-card overflow-hidden">
            {/* Sub-tabs: Explore / Rankings / AI Chat */}
            {activeTab === 'map' && !scorecardTarget && (
              <div className="flex border-b border-border shrink-0">
                {([
                  { id: 'explore' as const, icon: <MapPinIcon className="w-3.5 h-3.5" />, label: 'Explore' },
                  ...(celestialBody === 'orbit' ? [{ id: 'satellites' as const, icon: <Satellite className="w-3.5 h-3.5" />, label: 'Satellites' }] : []),
                  { id: 'rankings' as const, icon: <ArrowUpDown className="w-3.5 h-3.5" />, label: 'Rankings' },
                  { id: 'chat' as const, icon: <Bot className="w-3.5 h-3.5" />, label: 'AI Advisor' },
                ]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setSidebarMode(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] uppercase tracking-widest font-medium transition-colors ${
                      sidebarMode === tab.id
                        ? 'text-foreground bg-white/[0.04] border-b-2 border-white/30'
                        : 'text-muted-foreground hover:text-foreground/60'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Location/Country cards — visible across all map sub-tabs */}
            {activeTab === 'map' && !scorecardTarget && selectedCountry?.co2 && (
              <div className="p-3 border-b border-border shrink-0">
                <CountryCard
                  name={selectedCountry.name}
                  co2={selectedCountry.co2}
                  onAddToCompare={() => {
                    const id = `candidate-${selectedCountry.name}`;
                    setCandidateCountries((prev) => {
                      if (prev.some(c => c.id === id)) return prev;
                      return [...prev, {
                        id,
                        name: selectedCountry.name,
                        body: 'earth',
                        region: 'earth' as const,
                        carbon: selectedCountry.co2!.co2_intensity_gco2,
                        location: selectedCountry.name,
                        energyMix: selectedCountry.co2!.energy_mix,
                        trendPct: selectedCountry.co2!.country_trend_pct,
                      }];
                    });
                    if (!compareSelected.includes(id)) {
                      setCompareSelected((prev) => [...prev, id]);
                    }
                    setSelectedCountry(null);
                    setActiveTab('compare');
                  }}
                  onGenerateReport={() => {
                    const countryId = `candidate-${selectedCountry.name}`;
                    setScorecardTarget({
                      id: countryId,
                      name: selectedCountry.name,
                      body: 'earth',
                      carbon: selectedCountry.co2!.co2_intensity_gco2,
                      locationData: {
                        id: countryId,
                        name: selectedCountry.name,
                        body: 'earth',
                        carbon_intensity_gco2: selectedCountry.co2!.co2_intensity_gco2,
                        coordinates: { lat: 0, lng: 0 },
                        energy_cost_kwh: 0,
                        energy_sources: [],
                        avg_temperature_c: 20,
                        cooling_method: 'standard',
                        special_factors: [`Country: ${selectedCountry.name}`],
                      },
                    });
                  }}
                  onDismiss={() => setSelectedCountry(null)}
                />
              </div>
            )}
            {activeTab === 'map' && !scorecardTarget && selectedLocation && !selectedCountry?.co2 && (
              <div className="p-3 border-b border-border shrink-0">
                <LocationDetailCard
                  location={selectedLocation}
                  onDismiss={() => setSelectedLocation(null)}
                  onGenerateReport={() => {
                    setScorecardTarget({
                      id: selectedLocation.id,
                      name: selectedLocation.name,
                      body: selectedLocation.body,
                      carbon: selectedLocation.carbon,
                      locationData: buildLocationData(selectedLocation),
                    });
                  }}
                  onAddToCompare={() => {
                    const id = selectedLocation.id;
                    setCandidateCountries((prev) => {
                      if (prev.some(c => c.id === id)) return prev;
                      return [...prev, {
                        id,
                        name: selectedLocation.name,
                        body: selectedLocation.body,
                        region: selectedLocation.body,
                        carbon: selectedLocation.carbon,
                        location: selectedLocation.region?.location ?? selectedLocation.satellite?.status ?? selectedLocation.body,
                        energyMix: selectedLocation.countryCO2?.energy_mix,
                        trendPct: selectedLocation.countryCO2?.country_trend_pct,
                      }];
                    });
                    if (!compareSelected.includes(id)) {
                      setCompareSelected((prev) => [...prev, id]);
                    }
                    setSelectedLocation(null);
                    setActiveTab('compare');
                  }}
                  onAddToInventory={() => {
                    handleAddToInventory(
                      selectedLocation.id,
                      selectedLocation.name,
                      selectedLocation.body,
                      selectedLocation.carbon,
                    );
                    setSelectedLocation(null);
                  }}
                />
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {activeTab === 'map' && !scorecardTarget ? (
                sidebarMode === 'chat' ? (
                  <ChatPanel
                    onClose={() => setSidebarMode('explore')}
                    locationContext={selectedLocation ? buildLocationData(selectedLocation) : undefined}
                    onInventoryChanged={() => {
                      // Refresh inventory from backend after AI-driven payment
                      Promise.all([getInventories(), listBlueprints(customerId)]).then(([backendInv, bps]) => {
                        const bpIds = new Set(bps.map(bp => bp.location_id));
                        const enriched = backendInv.map(bi => {
                          const loc = locationsRef.current.get(bi.location_id);
                          const parts = (loc?.name ?? bi.name).split(',').map(s => s.trim());
                          return {
                            id: bi.location_id,
                            backendId: bi.id,
                            name: bi.name,
                            location: loc ? (parts[1] ?? loc.name) : 'Unknown',
                            body: loc?.body ?? 'earth',
                            lat: loc?.coordinates.lat ?? 0,
                            lng: loc?.coordinates.lng ?? 0,
                            capacityMW: bi.capacity_mw,
                            utilization: bi.utilization_pct,
                            carbonFootprint: bi.carbon_footprint_tons,
                            monthlyCost: bi.monthly_cost,
                            solanaTxHash: bi.solana_tx_hash ?? undefined,
                            hasBlueprint: bpIds.has(bi.location_id),
                          };
                        });
                        setInventory(enriched);
                      }).catch(() => {});
                    }}
                  />
                ) : sidebarMode === 'rankings' ? (
                  <RankingsPanel
                    projectionYear={projectionYear}
                    scenario={scenario}
                  />
                ) : sidebarMode === 'satellites' ? (
                  <OrbitSidebar
                    satellites={satellites}
                    search={satelliteSearch}
                    onSearchChange={setSatelliteSearch}
                    onSatelliteClick={(sat) => {
                      setZoomTarget({ lat: sat.lat, lng: sat.lng });
                      handleLocationClick(sat.id, sat.name, 'orbit', sat.carbonScore, undefined, sat);
                    }}
                  />
                ) : (
                  <Sidebar regions={regions} satellites={satellites} onRoutingComplete={setRoutingTarget} />
                )
              ) : (
                renderSidePanel()
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
