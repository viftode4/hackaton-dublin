import { GroundRegion, SatelliteData, RoutingResult } from './constants';

export interface LocationRecommendation {
  rank: number;
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  carbonScore: number;
  isOrbital: boolean;
  overallScore: number;
  carbonRating: string;
  costRating: string;
  emissionsRating: string;
  summary: string;
}

export function recommendLocations(
  description: string,
  carbonWeight: number,
  emissionsWeight: number,
  costWeight: number,
  regions: GroundRegion[],
  satellites: SatelliteData[]
): LocationRecommendation[] {
  const totalWeight = carbonWeight + emissionsWeight + costWeight || 1;
  const cW = carbonWeight / totalWeight;
  const eW = emissionsWeight / totalWeight;
  const coW = costWeight / totalWeight;

  // Mock cost and emissions indices per region (0-100, lower is better)
  const costIndex: Record<string, number> = {
    'us-east-1': 45, 'us-west-2': 55, 'eu-west-1': 60, 'eu-central-1': 65,
    'ap-southeast-1': 35, 'ap-northeast-1': 70, 'sa-east-1': 30,
    'ISS': 95, 'HUBBLE': 90, 'TERRA': 92, 'LANDSAT9': 88, 'NOAA20': 85, 'SENTINEL6': 80, 'TIANGONG': 93, 'STARLINK': 70, 'GOES16': 98, 'INMARSAT5': 96,
  };
  const emissionsIndex: Record<string, number> = {
    'us-east-1': 75, 'us-west-2': 25, 'eu-west-1': 30, 'eu-central-1': 60,
    'ap-southeast-1': 80, 'ap-northeast-1': 85, 'sa-east-1': 20,
    'ISS': 40, 'HUBBLE': 10, 'TERRA': 15, 'LANDSAT9': 12, 'NOAA20': 18, 'SENTINEL6': 8, 'TIANGONG': 42, 'STARLINK': 30, 'GOES16': 5, 'INMARSAT5': 6,
  };

  const getRating = (val: number, max: number) => {
    const pct = val / max;
    if (pct < 0.3) return 'Excellent';
    if (pct < 0.5) return 'Good';
    if (pct < 0.7) return 'Fair';
    return 'Poor';
  };

  const candidates = [
    ...regions.map(r => ({
      id: r.id, name: r.name, location: r.location, lat: r.lat, lng: r.lng,
      carbonScore: r.carbonIntensity, isOrbital: false,
      cost: costIndex[r.id] ?? 50, emissions: emissionsIndex[r.id] ?? 50,
    })),
    ...satellites.map(s => ({
      id: s.id, name: s.name, location: 'Orbit', lat: s.lat, lng: s.lng,
      carbonScore: s.carbonScore, isOrbital: true,
      cost: costIndex[s.id] ?? 80, emissions: emissionsIndex[s.id] ?? 30,
    })),
  ];

  const maxCarbon = 600;
  const scored = candidates.map(c => {
    const carbonNorm = c.carbonScore / maxCarbon;
    const costNorm = c.cost / 100;
    const emissionsNorm = c.emissions / 100;
    const overallScore = 100 - ((carbonNorm * cW + emissionsNorm * eW + costNorm * coW) * 100);
    return {
      ...c,
      overallScore: Math.round(overallScore),
      carbonRating: getRating(c.carbonScore, maxCarbon),
      costRating: getRating(c.cost, 100),
      emissionsRating: getRating(c.emissions, 100),
    };
  });

  scored.sort((a, b) => b.overallScore - a.overallScore);

  return scored.slice(0, 3).map((c, i) => ({
    rank: i + 1,
    id: c.id,
    name: c.name,
    location: c.location,
    lat: c.lat,
    lng: c.lng,
    carbonScore: c.carbonScore,
    isOrbital: c.isOrbital,
    overallScore: c.overallScore,
    carbonRating: c.carbonRating,
    costRating: c.costRating,
    emissionsRating: c.emissionsRating,
    summary: c.isOrbital
      ? `${c.name} offers ${c.carbonScore} g CO₂/kWh with zero-emission solar operation in orbit.`
      : `${c.name} in ${c.location} offers ${c.carbonScore} g CO₂/kWh with ${c.carbonRating.toLowerCase()} carbon performance.`,
  }));
}

export async function callCrusoeApi(apiKey: string, description: string, recommendations: LocationRecommendation[]): Promise<string> {
  const top = recommendations[0];
  const mock = `Top recommendation: ${top.name} (${top.location}) at ${top.carbonScore} g CO₂/kWh with an overall score of ${top.overallScore}/100. ${top.isOrbital ? 'Orbital infrastructure provides zero operational emissions with continuous solar power.' : `This region benefits from clean grid energy, making it ideal for sustainable datacenter development.`} Consider ${recommendations[1]?.name} as a secondary site for redundancy.`;

  if (!apiKey) return mock;

  try {
    const response = await fetch('https://api.crusoe.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instruct',
        messages: [
          { role: 'system', content: 'You are the AI reasoning engine for Pale Blue Dot, a datacenter location advisor. Given a set of recommended locations, write 2-3 sentences explaining why the top location is best for the described datacenter. Be specific about carbon, cost, and emissions trade-offs. Keep it under 80 words. Sound like a helpful engineer.' },
          { role: 'user', content: `Datacenter description: "${description}". Top 3 recommendations: ${recommendations.map((r, i) => `${i + 1}. ${r.name} (${r.location}) — score ${r.overallScore}/100, carbon ${r.carbonScore}g CO₂/kWh, carbon rating ${r.carbonRating}, cost rating ${r.costRating}, emissions rating ${r.emissionsRating}`).join('; ')}. Write the recommendation justification.` },
        ],
        max_tokens: 150,
        stream: false,
      }),
    });
    if (!response.ok) throw new Error('fail');
    const data = await response.json();
    return data.choices?.[0]?.message?.content || mock;
  } catch {
    return mock;
  }
}
