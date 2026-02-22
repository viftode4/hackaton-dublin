import { useState, useEffect, useRef, useMemo } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { GROUND_REGIONS, INITIAL_SATELLITES, updateSatellitePosition, type GroundRegion, type SatelliteData } from '@/lib/constants';
import GlobeView from '@/components/GlobeView';
import Sidebar from '@/components/Sidebar';
import TopNav, { type AppTab } from '@/components/TopNav';
import ScorecardPanel from '@/components/ScorecardPanel';
import InventoryPanel, { type InventoryItem } from '@/components/InventoryPanel';
import ComparePanel from '@/components/ComparePanel';
import AddLocationPanel, { type NewLocationData } from '@/components/AddLocationPanel';
import { type CelestialBody, type ExtraterrestrialLocation } from '@/lib/celestial';
import { getLocations, getInventories, createInventory, deleteInventory, type BackendLocation } from '@/lib/api';

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

  const handleLocationClick = (id: string, name: string, body: string, carbon: number) => {
    setScorecardTarget({ id, name, body, carbon });
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
          onClose={() => setScorecardTarget(null)}
          onAddToInventory={handleAddToInventory}
        />
      );
    }

    switch (activeTab) {
      case 'map':
        return <Sidebar regions={regions} satellites={satellites} onRoutingComplete={setRoutingTarget} />;
      case 'inventory':
        return <InventoryPanel items={inventory} onRemove={handleRemoveFromInventory} onItemClick={handleInventoryClick} />;
      case 'compare':
        return <ComparePanel selected={compareSelected} onSelectedChange={setCompareSelected} />;
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
