import { useState, useEffect, useCallback } from 'react';
import { Settings, ChevronDown, Loader2, Zap, MapPin, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { GroundRegion, SatelliteData } from '@/lib/constants';
import { LocationRecommendation, recommendLocations, callCrusoeApi } from '@/lib/routing';

interface Props {
  regions: GroundRegion[];
  satellites: SatelliteData[];
  onRoutingComplete: (target: { lat: number; lng: number } | null) => void;
}

export default function Sidebar({ regions, satellites, onRoutingComplete }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [description, setDescription] = useState('');
  const [carbonWeight, setCarbonWeight] = useState(70);
  const [emissionsWeight, setEmissionsWeight] = useState(50);
  const [costWeight, setCostWeight] = useState(30);
  const [isComputing, setIsComputing] = useState(false);
  const [results, setResults] = useState<LocationRecommendation[] | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [typedText, setTypedText] = useState('');

  const handleCompute = useCallback(async () => {
    setIsComputing(true);
    setResults(null);
    setAiAnalysis('');
    setTypedText('');
    onRoutingComplete(null);
    await new Promise(r => setTimeout(r, 1800));
    const recs = recommendLocations(description, carbonWeight, emissionsWeight, costWeight, regions, satellites);
    setResults(recs);
    if (recs.length > 0) {
      onRoutingComplete({ lat: recs[0].lat, lng: recs[0].lng });
    }
    setIsComputing(false);
    const analysis = await callCrusoeApi(apiKey, description, recs);
    setAiAnalysis(analysis);
  }, [description, carbonWeight, emissionsWeight, costWeight, regions, satellites, apiKey, onRoutingComplete]);

  // Typewriter
  useEffect(() => {
    if (!aiAnalysis) return;
    let i = 0;
    setTypedText('');
    const interval = setInterval(() => {
      i++;
      setTypedText(aiAnalysis.slice(0, i));
      if (i >= aiAnalysis.length) clearInterval(interval);
    }, 20);
    return () => clearInterval(interval);
  }, [aiAnalysis]);

  const rankColors = ['text-white', 'text-white/60', 'text-white/40'];
  const rankLabels = ['1st', '2nd', '3rd'];

  return (
    <div className="h-full flex flex-col p-5 overflow-y-auto bg-black">
      {/* API Settings */}
      <button onClick={() => setShowSettings(!showSettings)} className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3 hover:text-foreground transition-colors">
        <Settings className="w-3.5 h-3.5" />
        <span>API Settings</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
      </button>
      {showSettings && (
        <div className="mb-4">
          <Input type="password" placeholder="Crusoe API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} className="text-sm bg-input" />
        </div>
      )}

      {/* Datacenter Description */}
      <h2 className="text-lg font-semibold text-white/70 mb-3">Describe the Datacenter You Want to Build</h2>
      <Textarea placeholder="e.g. A 50MW hyperscale facility optimized for AI training with renewable energy targets..." value={description} onChange={e => setDescription(e.target.value)} className="mb-4 bg-input border-border min-h-[80px] text-sm resize-none" />

      {/* Priority Sliders */}
      <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">Investigation Priorities</p>
      <div className="space-y-4 mb-5">
        <PrioritySlider label="Carbon Neutrality" value={carbonWeight} onChange={setCarbonWeight} color="text-white/70" />
        <PrioritySlider label="Other Emissions (NOₓ, PM₂.₅, Water)" value={emissionsWeight} onChange={setEmissionsWeight} color="text-white/50" />
        <PrioritySlider label="Cost Efficiency" value={costWeight} onChange={setCostWeight} color="text-white/30" />
      </div>

      <Button onClick={handleCompute} disabled={isComputing} className="w-full h-11 text-sm font-semibold mb-1.5">
        {isComputing ? (
          <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Evaluating 7 ground regions & 4 orbital assets...</span>
        ) : 'FIND TOP 3 LOCATIONS'}
      </Button>
      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mb-6">
        <Zap className="w-3 h-3" /> Powered by Crusoe Inference API
      </p>

      {/* Results */}
      {results && (
        <div className="animate-slide-up mb-6 space-y-3">
          <h2 className="text-lg font-semibold text-white/70 mb-3">Recommended Locations</h2>
          {results.map((rec, i) => (
            <button
              key={rec.id}
              onClick={() => onRoutingComplete({ lat: rec.lat, lng: rec.lng })}
              className="w-full text-left bg-muted rounded-lg p-4 hover:bg-muted/80 transition-colors border border-transparent hover:border-white/20"
            >
              <div className="flex items-center gap-2 mb-2">
                <Trophy className={`w-4 h-4 ${rankColors[i]}`} />
                <span className={`text-xs font-bold ${rankColors[i]}`}>{rankLabels[i]}</span>
                <span className="text-foreground font-semibold text-sm">{rec.name}</span>
                <span className={`ml-auto px-2 py-0.5 text-[10px] font-semibold rounded ${rec.isOrbital ? 'bg-white/[0.06] text-white/70' : 'bg-white/[0.03] text-white/50'}`}>
                  {rec.isOrbital ? 'ORBITAL' : 'GROUND'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                <MapPin className="w-3 h-3" /> {rec.location}
              </div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Overall Score</span>
                <span className="text-foreground font-bold text-base">{rec.overallScore}/100</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <RatingBadge label="Carbon" rating={rec.carbonRating} value={`${rec.carbonScore}g`} />
                <RatingBadge label="Emissions" rating={rec.emissionsRating} />
                <RatingBadge label="Cost" rating={rec.costRating} />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* AI Analysis */}
      {results && (
        <div className="border-l-2 border-white/20 pl-3 mb-6 animate-slide-up">
          <p className="text-[10px] text-muted-foreground mb-1.5">AI Analysis</p>
          {typedText ? (
            <p className="text-sm text-foreground leading-relaxed">{typedText}<span className="animate-pulse text-white/50">▊</span></p>
          ) : !apiKey ? (
            <p className="text-xs text-white/30">Add your Crusoe API key in settings to enable AI analysis</p>
          ) : (
            <p className="text-xs text-muted-foreground animate-pulse">Analyzing locations...</p>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto pt-6">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-pulse" />
          <span className="text-[10px] text-muted-foreground">Live orbital data · Live carbon feeds</span>
        </div>
        <p className="text-[9px] text-muted-foreground/60">Built at HackEurope 2025 · Sustainability Track · Crusoe Inference Prize</p>
      </div>
    </div>
  );
}

function PrioritySlider({ label, value, onChange, color }: {
  label: string; value: number; onChange: (v: number) => void; color: string;
}) {
  const level = value < 33 ? 'Low' : value < 66 ? 'Medium' : 'High';
  return (
    <div>
      <div className="flex justify-between text-xs mb-2">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-medium ${color}`}>{level}</span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={0} max={100} step={1} />
    </div>
  );
}

function RatingBadge({ label, rating, value }: { label: string; rating: string; value?: string }) {
  const colorMap: Record<string, string> = {
    'Excellent': 'text-white/90',
    'Good': 'text-white/70',
    'Fair': 'text-white/50',
    'Poor': 'text-white/30',
  };
  return (
    <div className="text-center">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className={`text-[10px] font-semibold ${colorMap[rating] ?? 'text-foreground'}`}>
        {value ? `${value} · ` : ''}{rating}
      </p>
    </div>
  );
}
