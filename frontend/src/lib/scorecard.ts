// Mock scorecard data for locations

export interface ScorecardMetric {
  name: string;
  score: number; // 0-100
  label: string;
}

export interface Scorecard {
  locationId: string;
  locationName: string;
  body: string;
  grade: string;
  metrics: ScorecardMetric[];
  summary: string;
  costRange: string;
  timeline: string;
}

const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'F'];

function scoreToGrade(avg: number): string {
  if (avg >= 95) return 'A+';
  if (avg >= 88) return 'A';
  if (avg >= 82) return 'A-';
  if (avg >= 75) return 'B+';
  if (avg >= 68) return 'B';
  if (avg >= 60) return 'B-';
  if (avg >= 50) return 'C+';
  if (avg >= 40) return 'C';
  if (avg >= 25) return 'D';
  return 'F';
}

// Deterministic hash for consistent mock data
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function generateScorecard(locationId: string, locationName: string, body: string, carbonIntensity: number): Scorecard {
  const h = simpleHash(locationId);
  
  const carbonScore = Math.max(10, 100 - Math.round(carbonIntensity / 6));
  const powerScore = 30 + (h % 60);
  const coolingScore = 25 + ((h >> 4) % 65);
  const latencyScore = body === 'earth' ? 50 + ((h >> 8) % 50) : body === 'moon' ? 15 + ((h >> 8) % 30) : 5 + ((h >> 8) % 20);
  const costScore = body === 'earth' ? 40 + ((h >> 12) % 55) : 10 + ((h >> 12) % 35);
  const riskScore = body === 'earth' ? 50 + ((h >> 16) % 45) : 20 + ((h >> 16) % 40);

  const metrics: ScorecardMetric[] = [
    { name: 'Carbon', score: carbonScore, label: `${carbonIntensity}g CO₂/kWh` },
    { name: 'Power', score: powerScore, label: powerScore > 70 ? 'Abundant' : powerScore > 45 ? 'Adequate' : 'Limited' },
    { name: 'Cooling', score: coolingScore, label: coolingScore > 70 ? 'Excellent' : coolingScore > 45 ? 'Good' : 'Challenging' },
    { name: 'Latency', score: latencyScore, label: body === 'earth' ? `${Math.round(5 + (100 - latencyScore) * 0.5)}ms` : body === 'moon' ? '1.3s RTT' : '4-24min RTT' },
    { name: 'Cost', score: costScore, label: costScore > 70 ? '$' : costScore > 45 ? '$$' : '$$$' },
    { name: 'Risk', score: riskScore, label: riskScore > 70 ? 'Low' : riskScore > 45 ? 'Moderate' : 'High' },
  ];

  const avg = metrics.reduce((s, m) => s + m.score, 0) / metrics.length;

  const costRanges: Record<string, string> = {
    earth: `$${(2 + (h % 8)).toFixed(0)}-${(8 + (h % 12)).toFixed(0)}M/yr`,
    moon: `$${(50 + (h % 100)).toFixed(0)}-${(200 + (h % 300)).toFixed(0)}M/yr`,
    mars: `$${(500 + (h % 500)).toFixed(0)}M-${(1 + (h % 3)).toFixed(0)}B/yr`,
  };

  const timelines: Record<string, string> = {
    earth: `${6 + (h % 18)} months`,
    moon: `${2028 + (h % 5)} launch window`,
    mars: `${2035 + (h % 8)} launch window`,
  };

  return {
    locationId,
    locationName,
    body,
    grade: scoreToGrade(avg),
    metrics,
    summary: body === 'earth'
      ? `${locationName} offers ${carbonScore > 70 ? 'strong' : 'moderate'} sustainability credentials with ${powerScore > 60 ? 'reliable' : 'developing'} power infrastructure. ${coolingScore > 60 ? 'Natural cooling advantages reduce' : 'Active cooling systems increase'} operational costs. Ideal for ${latencyScore > 70 ? 'latency-sensitive' : 'batch processing'} workloads.`
      : `${locationName} on the ${body === 'moon' ? 'Moon' : 'Mars'} represents a frontier datacenter opportunity with zero-carbon operations via ${body === 'moon' ? 'continuous solar at the poles' : 'nuclear and solar power'}. ${body === 'moon' ? 'Low latency to Earth enables near-real-time operations.' : 'High latency requires autonomous operation and edge computing paradigms.'}`,
    costRange: costRanges[body] || costRanges.earth,
    timeline: timelines[body] || timelines.earth,
  };
}
