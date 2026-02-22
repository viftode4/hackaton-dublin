import { useState, useEffect, useCallback } from 'react';
import { SCENARIOS, type ScenarioId } from '../lib/regression-model';

interface Props {
  year: number;
  onYearChange: (year: number) => void;
  scenario: ScenarioId;
  onScenarioChange: (scenario: ScenarioId) => void;
}

const MIN_YEAR = 2025;
const MAX_YEAR = 2075;

export default function TimelineBar({ year, onYearChange, scenario, onScenarioChange }: Props) {
  const [playing, setPlaying] = useState(false);

  const stopPlayback = useCallback(() => {
    setPlaying(false);
  }, []);

  // Advance year when playing
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      onYearChange(year + 1);
    }, 800);
    return () => clearInterval(id);
  }, [playing, year, onYearChange]);

  // Stop at max
  useEffect(() => {
    if (year >= MAX_YEAR) stopPlayback();
  }, [year, stopPlayback]);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20
                    flex items-center gap-3 px-4 py-2
                    bg-black/70 backdrop-blur-md border border-white/10 rounded-full
                    text-white text-xs select-none">

      {/* Scenario picker */}
      <select
        value={scenario}
        onChange={e => onScenarioChange(e.target.value as ScenarioId)}
        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs
                   outline-none cursor-pointer hover:bg-white/15 transition-colors"
      >
        {Object.values(SCENARIOS).map(s => (
          <option key={s.id} value={s.id} className="bg-gray-900">{s.label}</option>
        ))}
      </select>

      {/* Play / Pause */}
      <button
        onClick={() => playing ? stopPlayback() : setPlaying(true)}
        className="w-6 h-6 flex items-center justify-center rounded-full
                   bg-white/10 hover:bg-white/20 transition-colors"
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? '⏸' : '▶'}
      </button>

      {/* Year slider */}
      <input
        type="range"
        min={MIN_YEAR}
        max={MAX_YEAR}
        value={year}
        onChange={e => {
          stopPlayback();
          onYearChange(Number(e.target.value));
        }}
        className="w-48 accent-emerald-400 cursor-pointer"
      />

      {/* Year readout */}
      <span className="font-mono font-bold text-sm min-w-[3ch]">{year}</span>
    </div>
  );
}
