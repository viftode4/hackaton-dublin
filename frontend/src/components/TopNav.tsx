import { MapPin, Package, BarChart3, PlusCircle } from 'lucide-react';
import skylyLogo from '@/assets/skyly-logo.png';

export type AppTab = 'map' | 'inventory' | 'compare' | 'add';

interface Props {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const tabs: { id: AppTab; label: string; icon: React.ReactNode }[] = [
  { id: 'map', label: 'Find Location', icon: <MapPin className="w-4 h-4" /> },
  { id: 'inventory', label: 'Inventory', icon: <Package className="w-4 h-4" /> },
  { id: 'compare', label: 'Compare', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'add', label: 'Add Location', icon: <PlusCircle className="w-4 h-4" /> },
];

export default function TopNav({ activeTab, onTabChange }: Props) {
  return (
    <header className="h-12 flex items-center px-4 bg-card border-b border-border shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-8">
        <img src={skylyLogo} alt="Skyly" className="w-7 h-7 rounded" />
      </div>

      {/* Tabs */}
      <nav className="flex items-center gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Right side - status */}
      <div className="ml-auto flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
        <span className="text-[10px] text-muted-foreground">Live</span>
      </div>
    </header>
  );
}
