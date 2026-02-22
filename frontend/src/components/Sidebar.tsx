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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Explore Locations</h3>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            <Settings className="w-3.5 h-3.5" />
            <ChevronDown className={`w-3 h-3 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {showSettings && (
          <Input type="password" placeholder="Crusoe API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} className="text-sm bg-input" />
        )}
        <p className="text-[10px] text-muted-foreground font-mono">
          {regions.length} regions · {satellites.length.toLocaleString()} orbital assets
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Datacenter Description */}
        <div>
          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Describe Your Datacenter</p>
          <Textarea placeholder="e.g. A 50MW hyperscale facility optimized for AI training with renewable energy targets..." value={description} onChange={e => setDescription(e.target.value)} className="bg-input border-border min-h-[80px] text-sm resize-none" />
        </div>

        {/* Priority Sliders */}
        <div>
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">Investigation Priorities</p>
          <div className="space-y-4">
            <PrioritySlider label="Carbon Neutrality" value={carbonWeight} onChange={setCarbonWeight} color="text-foreground/70" />
            <PrioritySlider label="Other Emissions (NOₓ, PM₂.₅, Water)" value={emissionsWeight} onChange={setEmissionsWeight} color="text-foreground/50" />
            <PrioritySlider label="Cost Efficiency" value={costWeight} onChange={setCostWeight} color="text-foreground/40" />
          </div>
        </div>

        <div>
          <Button onClick={handleCompute} disabled={isComputing} className="w-full h-11 text-sm font-semibold mb-1.5">
            {isComputing ? (
              <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Evaluating {regions.length} ground regions & {satellites.length.toLocaleString()} orbital assets...</span>
            ) : 'FIND TOP 3 LOCATIONS'}
          </Button>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Zap className="w-3 h-3" /> Powered by Crusoe Inference API
          </p>
        </div>

        {/* Results */}
        {results && (
          <div className="animate-slide-up space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Recommended Locations</p>
            {results.map((rec, i) => (
              <button
                key={rec.id}
                onClick={() => onRoutingComplete({ lat: rec.lat, lng: rec.lng })}
                className="w-full text-left bg-muted rounded-lg p-4 hover:bg-muted/80 transition-colors border border-transparent hover:border-border"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className={`w-4 h-4 ${rankColors[i]}`} />
                  <span className={`text-xs font-bold ${rankColors[i]}`}>{rankLabels[i]}</span>
                  <span className="text-foreground font-semibold text-sm">{rec.name}</span>
                  <span className={`ml-auto px-2 py-0.5 text-[10px] font-semibold rounded ${rec.isOrbital ? 'bg-accent text-foreground/70' : 'bg-accent/50 text-foreground/50'}`}>
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
          <div className="border-l-2 border-border pl-3 animate-slide-up">
            <p className="text-[10px] text-muted-foreground mb-1.5">AI Analysis</p>
            {typedText ? (
              <p className="text-sm text-foreground leading-relaxed">{typedText}<span className="animate-pulse text-muted-foreground">▊</span></p>
            ) : !apiKey ? (
              <p className="text-xs text-muted-foreground/50">Add your Crusoe API key in settings to enable AI analysis</p>
            ) : (
              <p className="text-xs text-muted-foreground animate-pulse">Analyzing locations...</p>
            )}
          </div>
        )}
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
