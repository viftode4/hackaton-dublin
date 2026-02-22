import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import {
  type ScenarioId,
  SCENARIOS,
  countryDataToFeatures,
  predictCO2AtYear,
} from '@/lib/regression-model';
import type { CompareLocation } from '@/components/ComparePanel';

const PALETTE = [
  '#22d3ee', '#f97316', '#a78bfa', '#34d399', '#fb7185', '#facc15',
  '#60a5fa', '#f472b6', '#4ade80', '#e879f9', '#2dd4bf', '#fbbf24',
];

const YEARS = [2025, 2030, 2035, 2040, 2045, 2050, 2055, 2060, 2065, 2070, 2075];
const MILESTONE_YEARS = [2030, 2040, 2050];

export { PALETTE };

interface TrajectoryChartProps {
  locations: CompareLocation[];
  scenario: ScenarioId;
  projectionYear: number;
  colorStartIndex?: number;
  /** When true (single location mode), shows all 3 scenarios instead of 1 line per location */
  multiScenario?: boolean;
  highlightId?: string | null;
  compact?: boolean;
}

export default function TrajectoryChart({
  locations,
  scenario,
  projectionYear,
  colorStartIndex = 0,
  multiScenario = false,
  highlightId,
  compact = false,
}: TrajectoryChartProps) {
  const chartData = useMemo(() => {
    if (multiScenario && locations.length === 1) {
      const loc = locations[0];
      const features = countryDataToFeatures(
        loc.carbon,
        loc.energyMix ?? '40% gas, 30% coal, 20% hydro, 10% other',
        loc.trendPct,
      );
      return YEARS.map(year => {
        const row: Record<string, number> = { year };
        for (const sid of Object.keys(SCENARIOS) as ScenarioId[]) {
          row[sid] = Math.round(predictCO2AtYear(features, year, SCENARIOS[sid]));
        }
        return row;
      });
    }

    return YEARS.map(year => {
      const row: Record<string, number> = { year };
      for (const loc of locations) {
        const features = countryDataToFeatures(
          loc.carbon,
          loc.energyMix ?? '40% gas, 30% coal, 20% hydro, 10% other',
          loc.trendPct,
        );
        row[loc.id] = Math.round(predictCO2AtYear(features, year, SCENARIOS[scenario]));
      }
      return row;
    });
  }, [locations, scenario, multiScenario]);

  const chartConfig = useMemo<ChartConfig>(() => {
    if (multiScenario && locations.length === 1) {
      return {
        bau: { label: 'Business as Usual', color: '#f97316' },
        net_zero: { label: 'Net Zero 2050', color: '#22d3ee' },
        accelerated: { label: 'Accelerated', color: '#34d399' },
      };
    }
    const cfg: ChartConfig = {};
    locations.forEach((loc, i) => {
      cfg[loc.id] = {
        label: loc.name,
        color: PALETTE[(i + colorStartIndex) % PALETTE.length],
      };
    });
    return cfg;
  }, [locations, colorStartIndex, multiScenario]);

  const lineKeys = multiScenario && locations.length === 1
    ? (Object.keys(SCENARIOS) as ScenarioId[])
    : locations.map(l => l.id);

  const height = compact ? 200 : 280;

  return (
    <ChartContainer config={chartConfig} className={`w-full ${compact ? 'aspect-auto' : ''}`} style={compact ? { height } : undefined}>
      <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
        <XAxis
          dataKey="year"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={v => `${v}`}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={v => `${v}`}
          width={40}
          label={{ value: 'g CO₂/kWh', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: 'hsl(var(--muted-foreground))' }, offset: 10 }}
        />

        {MILESTONE_YEARS.map(y => (
          <ReferenceLine
            key={`m-${y}`}
            x={y}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            strokeOpacity={0.4}
          />
        ))}

        {projectionYear > 2025 && (
          <ReferenceLine
            x={projectionYear}
            stroke="#22d3ee"
            strokeWidth={2}
            strokeOpacity={0.7}
            label={{ value: `${projectionYear}`, position: 'top', style: { fontSize: 10, fill: '#22d3ee' } }}
          />
        )}

        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const year = payload?.[0]?.payload?.year;
                return year ? `Year ${year}` : '';
              }}
            />
          }
        />

        {lineKeys.map((key, i) => {
          const color = chartConfig[key]?.color ?? PALETTE[i % PALETTE.length];
          const isHighlighted = highlightId == null || highlightId === key;
          const dashArray = multiScenario && key === 'bau' ? '6 3' : undefined;
          return (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={color}
              strokeWidth={isHighlighted ? 2 : 1}
              strokeOpacity={isHighlighted ? 1 : 0.3}
              strokeDasharray={dashArray}
              dot={false}
              activeDot={{ r: 3 }}
            />
          );
        })}
      </LineChart>
    </ChartContainer>
  );
}
