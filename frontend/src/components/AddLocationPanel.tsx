import { useState, useRef, useEffect } from 'react';
import { Plus, MapPin, Search, Zap, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { searchCities, type CityData } from '@/lib/cities';

export interface NewLocationData {
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  capacityMW: number;
  powerSource: string;
}

interface Props {
  onAdd: (location: NewLocationData) => void;
  onBulkAdd?: (locations: NewLocationData[]) => void;
}

export default function AddLocationPanel({ onAdd, onBulkAdd }: Props) {
  const [cityQuery, setCityQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CityData[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCity, setSelectedCity] = useState<CityData | null>(null);
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [capacity, setCapacity] = useState('');
  const [powerSource, setPowerSource] = useState('');
  const [csvResult, setCsvResult] = useState<{ count: number; errors: string[] } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const results = searchCities(cityQuery);
    setSuggestions(results);
    setShowSuggestions(results.length > 0 && cityQuery.length > 0);
  }, [cityQuery]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectCity = (city: CityData) => {
    setSelectedCity(city);
    setCityQuery(`${city.name}, ${city.country}`);
    setLat(city.lat.toString());
    setLng(city.lng.toString());
    setShowSuggestions(false);
    if (!name) setName(`${city.name} DC`);
  };

  const handleSubmit = () => {
    if (!name || !lat || !lng) return;
    onAdd({
      name,
      city: selectedCity?.name || cityQuery,
      country: selectedCity?.country || '',
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      capacityMW: parseFloat(capacity) || 0,
      powerSource: powerSource || 'Unknown',
    });
    // Reset form
    setName('');
    setCityQuery('');
    setSelectedCity(null);
    setLat('');
    setLng('');
    setCapacity('');
    setPowerSource('');
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        setCsvResult({ count: 0, errors: ['CSV must have a header row and at least one data row.'] });
        return;
      }
      const header = lines[0].toLowerCase().split(',').map(h => h.trim());
      const nameIdx = header.findIndex(h => h === 'name');
      const latIdx = header.findIndex(h => h === 'lat' || h === 'latitude');
      const lngIdx = header.findIndex(h => h === 'lng' || h === 'longitude' || h === 'lon');
      if (latIdx === -1 || lngIdx === -1) {
        setCsvResult({ count: 0, errors: ['CSV must contain "lat" and "lng" (or "latitude"/"longitude") columns.'] });
        return;
      }
      const cityIdx = header.findIndex(h => h === 'city');
      const countryIdx = header.findIndex(h => h === 'country');
      const capIdx = header.findIndex(h => h === 'capacity' || h === 'capacitymw' || h === 'capacity_mw');
      const powerIdx = header.findIndex(h => h === 'power' || h === 'powersource' || h === 'power_source');

      const locations: NewLocationData[] = [];
      const errors: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        const parsedLat = parseFloat(cols[latIdx]);
        const parsedLng = parseFloat(cols[lngIdx]);
        if (isNaN(parsedLat) || isNaN(parsedLng)) {
          errors.push(`Row ${i + 1}: invalid coordinates`);
          continue;
        }
        locations.push({
          name: (nameIdx !== -1 ? cols[nameIdx] : '') || `Location ${i}`,
          city: cityIdx !== -1 ? cols[cityIdx] || '' : '',
          country: countryIdx !== -1 ? cols[countryIdx] || '' : '',
          lat: parsedLat,
          lng: parsedLng,
          capacityMW: capIdx !== -1 ? parseFloat(cols[capIdx]) || 0 : 0,
          powerSource: powerIdx !== -1 ? cols[powerIdx] || 'Unknown' : 'Unknown',
        });
      }
      if (locations.length > 0) {
        if (onBulkAdd) {
          onBulkAdd(locations);
        } else {
          locations.forEach(loc => onAdd(loc));
        }
      }
      setCsvResult({ count: locations.length, errors });
    };
    reader.readAsText(file);
    // Reset so same file can be re-uploaded
    e.target.value = '';
  };

  const isValid = name.trim() && lat && lng && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng));

  return (
    <div className="h-full flex flex-col p-5 overflow-y-auto">
      <div className="flex items-center gap-2 mb-5">
        <Plus className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Add Location</h2>
      </div>

      {/* City autocomplete */}
      <label className="text-xs text-muted-foreground mb-1.5">City</label>
      <div className="relative mb-4" ref={wrapperRef}>
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground z-10" />
        <Input
          value={cityQuery}
          onChange={e => {
            setCityQuery(e.target.value);
            setSelectedCity(null);
          }}
          placeholder="Type a city name..."
          className="pl-8 text-sm bg-input"
        />
        {showSuggestions && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-[220px] overflow-y-auto">
            {suggestions.map(city => (
              <button
                key={`${city.name}-${city.country}`}
                onClick={() => selectCity(city)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left transition-colors hover:bg-muted"
              >
                <MapPin className="w-3 h-3 text-primary shrink-0" />
                <span className="text-foreground font-medium">{city.name}</span>
                <span className="text-muted-foreground">{city.country}</span>
                <span className="ml-auto text-[9px] text-muted-foreground font-mono">
                  {city.lat.toFixed(2)}, {city.lng.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Coordinates (auto-filled) */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Latitude</label>
          <Input
            type="number"
            value={lat}
            onChange={e => setLat(e.target.value)}
            placeholder="e.g. 51.5"
            className="text-sm bg-input"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Longitude</label>
          <Input
            type="number"
            value={lng}
            onChange={e => setLng(e.target.value)}
            placeholder="e.g. -0.12"
            className="text-sm bg-input"
          />
        </div>
      </div>

      {selectedCity && (
        <div className="flex items-center gap-1.5 mb-4 px-2 py-1.5 rounded-md bg-primary/10 border border-primary/20">
          <Zap className="w-3 h-3 text-primary" />
          <span className="text-[10px] text-primary">Coordinates auto-filled from {selectedCity.name}</span>
        </div>
      )}

      {/* Name */}
      <label className="text-xs text-muted-foreground mb-1.5">Location Name</label>
      <Input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="e.g. London Hyperscale DC"
        className="mb-4 text-sm bg-input"
      />

      {/* Capacity */}
      <label className="text-xs text-muted-foreground mb-1.5">Capacity (MW)</label>
      <Input
        type="number"
        value={capacity}
        onChange={e => setCapacity(e.target.value)}
        placeholder="e.g. 50"
        className="mb-4 text-sm bg-input"
      />

      {/* Power Source */}
      <label className="text-xs text-muted-foreground mb-1.5">Power Source</label>
      <Input
        value={powerSource}
        onChange={e => setPowerSource(e.target.value)}
        placeholder="e.g. Solar + Grid"
        className="mb-6 text-sm bg-input"
      />

      <Button onClick={handleSubmit} disabled={!isValid} className="w-full h-11 text-sm font-semibold">
        <Plus className="w-4 h-4 mr-1.5" />
        Add to Inventory
      </Button>

      {/* CSV Upload */}
      <div className="mt-6 pt-6 border-t border-border">
        <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">Bulk Import</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleCsvUpload}
          className="hidden"
        />
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-11 text-sm font-semibold gap-2"
        >
          <Upload className="w-4 h-4" />
          Upload CSV File
        </Button>
        <div className="mt-2 flex items-start gap-1.5 text-[10px] text-muted-foreground">
          <FileText className="w-3 h-3 mt-0.5 shrink-0" />
          <span>Columns: <span className="font-mono">name, lat, lng, city, country, capacity, power</span> (lat &amp; lng required)</span>
        </div>

        {csvResult && (
          <div className={`mt-3 p-2.5 rounded-md text-xs ${csvResult.count > 0 ? 'bg-success/10 border border-success/20' : 'bg-destructive/10 border border-destructive/20'}`}>
            {csvResult.count > 0 && (
              <div className="flex items-center gap-1.5 text-success mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="font-medium">{csvResult.count} location{csvResult.count !== 1 ? 's' : ''} imported</span>
              </div>
            )}
            {csvResult.errors.map((err, i) => (
              <div key={i} className="flex items-center gap-1.5 text-destructive">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{err}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
