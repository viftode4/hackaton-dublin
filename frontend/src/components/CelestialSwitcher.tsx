import { Globe, Moon, Orbit, Satellite } from 'lucide-react';
import type { CelestialBody } from '@/lib/celestial';

interface Props {
  active: CelestialBody;
  onChange: (body: CelestialBody) => void;
}

const bodies: { id: CelestialBody; label: string; icon: React.ReactNode }[] = [
  { id: 'earth', label: 'Earth', icon: <Globe className="w-3.5 h-3.5" /> },
  { id: 'orbit', label: 'In Orbit', icon: <Satellite className="w-3.5 h-3.5" /> },
  { id: 'moon', label: 'Moon', icon: <Moon className="w-3.5 h-3.5" /> },
  { id: 'mars', label: 'Mars', icon: <Orbit className="w-3.5 h-3.5" /> },
];

export default function CelestialSwitcher({ active, onChange }: Props) {
  return (
    <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 bg-card/90 backdrop-blur-sm rounded-lg p-1 border border-border">
      {bodies.map(b => (
        <button
          key={b.id}
          onClick={() => onChange(b.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
            active === b.id
              ? 'bg-primary/20 text-primary shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {b.icon}
          {b.label}
        </button>
      ))}
    </div>
  );
}
