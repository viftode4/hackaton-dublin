import { Map, ExternalLink } from 'lucide-react';

const MODEL_FILES = [
  { id: 'choropleth', file: 'gridsync_choropleth.html', label: 'Choropleth Map', description: 'Regional carbon intensity choropleth' },
  { id: 'interactive', file: 'gridsync_interactive.html', label: 'Interactive Grid', description: 'Interactive grid-based CO₂ data' },
  { id: 'map', file: 'gridsync_map.html', label: 'Grid Map', description: 'Geospatial grid predictions' },
  { id: 'mvp', file: 'gridsync_mvp.html', label: 'MVP Map', description: 'MVP carbon intensity overview' },
  { id: 'timeseries', file: 'gridsync_timeseries.html', label: 'Time Series', description: '2026→2030 grid predictions over time' },
];

export default function ModelsPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-1.5">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-2">Data Analysis</p>
        {MODEL_FILES.map(model => (
          <button
            key={model.id}
            onClick={() => window.open(`/maps/${model.file}`, '_blank')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
          >
            <Map className="w-4 h-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{model.label}</p>
              <p className="text-[10px] text-muted-foreground truncate">{model.description}</p>
            </div>
            <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-50" />
          </button>
        ))}
      </div>
    </div>
  );
}
