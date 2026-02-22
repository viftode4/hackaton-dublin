import { useState, useEffect, useRef, useMemo } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { GROUND_REGIONS, INITIAL_SATELLITES, updateSatellitePosition, getCarbonScoreColor, type GroundRegion, type SatelliteData } from '@/lib/constants';
import { fetchTLEGroup, computePosition, computeOrbitalMetrics, CURATED_SATELLITE_IDS } from '@/lib/tle-service';
import GlobeView from '@/components/GlobeView';
import Sidebar from '@/components/Sidebar';
import TopNav, { type AppTab } from '@/components/TopNav';
import ScorecardPanel from '@/components/ScorecardPanel';
import InventoryPanel, { type InventoryItem } from '@/components/InventoryPanel';
import ComparePanel, { type CompareLocation } from '@/components/ComparePanel';
import AddLocationPanel, { type NewLocationData } from '@/components/AddLocationPanel';
import CountryCard from '@/components/CountryCard';
import LocationDetailCard, { type LocationDetail } from '@/components/LocationDetailCard';
import { type DataLayers } from '@/components/GlobeView';
import { type CelestialBody, type ExtraterrestrialLocation } from '@/lib/celestial';
import type { CO2Estimate } from '@/lib/co2-api';
import { estimateCO2 } from '@/lib/co2-api';
import { getLocations, getInventories, createInventory, deleteInventory, mintToSolana, type BackendLocation } from '@/lib/api';
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
  } | null>(null);
  const [mintingId, setMintingId] = useState<string | null>(null);
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

  // Fetch real TLE satellite data
  useEffect(() => {
    async function loadTLEData() {
      try {
        const tles = await fetchTLEGroup('stations');
        // Also try to get active satellites for non-station ones
        let activeTles: typeof tles = [];
        try { activeTles = await fetchTLEGroup('active'); } catch { /* ok */ }

        const allTles = [...tles, ...activeTles];
        const now = new Date();
        const realSatellites: SatelliteData[] = [];

        for (const [key, noradId] of Object.entries(CURATED_SATELLITE_IDS)) {
          const tle = allTles.find(t => t.NORAD_CAT_ID === noradId);
          if (!tle) continue;

          const pos = computePosition(tle, now);
          if (!pos) continue;

          const metrics = computeOrbitalMetrics(tle);

          // Carbon score: inversely proportional to power availability
          // Higher power = lower carbon score = greener
          const carbonScore = Math.round(Math.max(50, 250 - metrics.powerAvailabilityW / 2));

          realSatellites.push({
            id: key,
            name: tle.OBJECT_NAME,
            noradId,
            inclination: metrics.inclinationDeg,
            period: metrics.periodMinutes * 60,
            startLat: pos.lat,
            startLng: pos.lng,
            phase: 0,
            altitude: Math.min(pos.altitude / 6371 * 0.3, 0.5),
            altitudeKm: Math.round(pos.altitude),
            status: metrics.radiationLevel === 'low' ? 'OPTIMAL'
              : metrics.radiationLevel === 'moderate' ? 'CAUTION'
              : 'HIGH RADIATION',
            color: getCarbonScoreColor(carbonScore),
            carbonScore,
            isStationary: metrics.periodMinutes > 1400,
            lat: pos.lat,
            lng: pos.lng,
            eclipseFraction: metrics.eclipseFraction,
            radiationLevel: metrics.radiationLevel,
            powerAvailabilityW: metrics.powerAvailabilityW,
            latencyMs: metrics.latencyToGroundMs,
            apogeeKm: metrics.apogeeKm,
            perigeeKm: metrics.perigeeKm,
          });
        }

        if (realSatellites.length > 0) {
          console.log(`Loaded ${realSatellites.length} real satellites from TLE data`);
          setSatellites(realSatellites);
        }
      } catch (err) {
        console.warn('TLE fetch failed, using hardcoded satellites:', err);
        // Keep INITIAL_SATELLITES as fallback
      }
    }
    loadTLEData();
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

  // Satellite motion every 1s
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() / 1000;
      setSatellites(prev => prev.map(s => {
        const pos = updateSatellitePosition(s, elapsed);
        return { ...s, lat: pos.lat, lng: pos.lng };
      }));
    }, 1000);
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

    const detail: LocationDetail = { id, name, body, carbon, region: regionData, satellite: satData, extraterrestrial: etData };

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

  const handleAddToInventory = async (locationId: string, locationName: string, body: string, carbon: number) => {
    if (inventory.some(i => i.id === locationId)) return; // already added
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
      setScorecardTarget(null);
      setActiveTab('inventory');
    } catch (err) {
      console.error('Failed to persist inventory item:', err);
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

  const renderSidePanel = () => {
    if (scorecardTarget) {
      return (
        <ScorecardPanel
          locationId={scorecardTarget.id}
          locationName={scorecardTarget.name}
          body={scorecardTarget.body}
          carbonIntensity={scorecardTarget.carbon}
          customerId={customerId}
          onClose={() => setScorecardTarget(null)}
          onAddToInventory={handleAddToInventory}
        />
      );
    }

    switch (activeTab) {
      case 'map':
        return (
          <div className="flex flex-col h-full">
            {selectedCountry?.co2 && (
              <div className="p-3 border-b border-border">
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
                      }];
                    });
                    if (!compareSelected.includes(id)) {
                      setCompareSelected((prev) => [...prev, id]);
                    }
                    setSelectedCountry(null);
                    setActiveTab('compare');
                  }}
                  onGenerateReport={() => {
                    setScorecardTarget({
                      id: `candidate-${selectedCountry.name}`,
                      name: selectedCountry.name,
                      body: 'earth',
                      carbon: selectedCountry.co2!.co2_intensity_gco2,
                    });
                  }}
                  onDismiss={() => setSelectedCountry(null)}
                />
              </div>
            )}
            {selectedLocation && !selectedCountry?.co2 && (
              <div className="p-3 border-b border-border">
                <LocationDetailCard
                  location={selectedLocation}
                  onDismiss={() => setSelectedLocation(null)}
                  onGenerateReport={() => {
                    setScorecardTarget({
                      id: selectedLocation.id,
                      name: selectedLocation.name,
                      body: selectedLocation.body,
                      carbon: selectedLocation.carbon,
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
              <Sidebar regions={regions} satellites={satellites} onRoutingComplete={setRoutingTarget} />
            </div>
          </div>
        );
      case 'inventory':
        return <InventoryPanel items={inventory} onRemove={handleRemoveFromInventory} onItemClick={handleInventoryClick} onMint={handleMintToSolana} mintingId={mintingId} />;
      case 'compare':
        return <ComparePanel selected={compareSelected} onSelectedChange={setCompareSelected} locations={compareLocations} />;
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
          />

          {/* Init overlay */}
          {showInit && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-fade-out-delay">
              <p className="text-primary text-sm font-medium animate-pulse">Initializing orbital feeds...</p>
            </div>
          )}

          {/* Legend */}
          {celestialBody === 'earth' && (
            <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur-sm rounded-lg p-3 text-[10px] space-y-1.5 max-w-[180px]">
              <p className="text-foreground font-semibold text-xs">Existing Datacenter Density</p>
              <div className="h-2 w-full rounded" style={{ background: 'linear-gradient(to right, hsl(120,80%,50%), hsl(60,80%,50%), hsl(0,80%,50%))' }} />
              <div className="flex justify-between text-muted-foreground">
                <span>Low</span><span>High</span>
              </div>
            </div>
          )}
          {celestialBody === 'orbit' && (
            <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur-sm rounded-lg p-3 text-[10px] space-y-1.5 max-w-[180px]">
              <p className="text-foreground font-semibold text-xs">Carbon Score</p>
              <div className="h-2 w-full rounded" style={{ background: 'linear-gradient(to right, hsl(120,80%,55%), hsl(60,80%,55%), hsl(0,80%,55%))' }} />
              <div className="flex justify-between text-muted-foreground">
                <span>Low (Clean)</span><span>High</span>
              </div>
            </div>
          )}
          {celestialBody === 'moon' && (
            <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur-sm rounded-lg p-3 text-[10px] space-y-1.5 max-w-[180px]">
              <p className="text-foreground font-semibold text-xs">Lunar Features</p>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: '#4488aa' }} />
                <span className="text-muted-foreground">Maria (seas)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: '#aa8844' }} />
                <span className="text-muted-foreground">Montes (mountains)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: '#888888' }} />
                <span className="text-muted-foreground">Craters</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ background: '#00e5ff', width: '8px', height: '8px', transform: 'rotate(45deg)' }} />
                <span className="text-muted-foreground">Datacenter sites</span>
              </div>
            </div>
          )}
          {celestialBody === 'mars' && (
            <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur-sm rounded-lg p-3 text-[10px] space-y-1.5 max-w-[180px]">
              <p className="text-foreground font-semibold text-xs">Mars Geology</p>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm" style={{ background: 'rgba(60, 120, 200, 0.5)' }} />
                <span className="text-muted-foreground">Amazonian (young)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm" style={{ background: 'rgba(200, 140, 60, 0.5)' }} />
                <span className="text-muted-foreground">Hesperian (mid)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm" style={{ background: 'rgba(180, 80, 60, 0.5)' }} />
                <span className="text-muted-foreground">Noachian (ancient)</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full" style={{ background: '#cc6633' }} />
                <span className="text-muted-foreground">Volcanoes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: '#4466cc' }} />
                <span className="text-muted-foreground">Canyons/Valleys</span>
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
          <div style={{ flex: activeTab === 'compare' && compareSelected.length > 2 ? `${Math.min(70, 35 + (compareSelected.length - 2) * 8)}` : '35' }} className="overflow-y-auto border-l border-border min-w-[340px] bg-card">
            {renderSidePanel()}
          </div>
        )}
      </div>
    </div>
  );
}
