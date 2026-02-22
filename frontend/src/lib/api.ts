// Orbital Atlas Backend API client
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  return res.json();
}

// --- Advisor ---

export interface ChatResponse {
  message: string;
  role: string;
  tools_used: { tool: string; input: Record<string, unknown> }[];
  agent: boolean;
  error?: string;
}

export async function advisorChat(
  message: string,
  history: { role: string; content: string }[] = [],
  customerId?: string,
): Promise<ChatResponse> {
  return request('/api/advisor/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history, customer_id: customerId }),
  });
}

// --- Reports ---

export async function generateScorecard(locationId: string, customerId?: string) {
  return request<Record<string, unknown>>('/api/reports/scorecard', {
    method: 'POST',
    body: JSON.stringify({ location_id: locationId, customer_id: customerId }),
  });
}

export async function generateBlueprint(locationId: string, customerId?: string) {
  return request<Record<string, unknown>>('/api/reports/blueprint', {
    method: 'POST',
    body: JSON.stringify({ location_id: locationId, customer_id: customerId }),
  });
}

// --- Payments ---

export interface CheckoutResponse {
  checkout_url: string;
  session_id: string;
  amount_cents: number;
  currency: string;
  error?: string;
}

export async function createCheckout(locationId: string, locationName: string, email?: string): Promise<CheckoutResponse> {
  return request('/api/payments/checkout', {
    method: 'POST',
    body: JSON.stringify({ location_id: locationId, location_name: locationName, email }),
  });
}

export async function checkPayment(locationId: string, customerId?: string): Promise<{ paid: boolean }> {
  const cid = customerId || 'anonymous';
  return request(`/api/payments/check?location_id=${encodeURIComponent(locationId)}&customer_id=${encodeURIComponent(cid)}`);
}

export async function getSessionStatus(sessionId: string) {
  return request<{ paid: boolean; status: string; location_id?: string }>(`/api/payments/session/${sessionId}`);
}

// --- Locations ---

export interface BackendLocation {
  id: string;
  name: string;
  body: string;
  coordinates: { lat: number; lng: number };
  energy_cost_kwh: number;
  energy_sources: string[];
  carbon_intensity_gco2: number;
  avg_temperature_c: number;
  cooling_method: string;
  cooling_cost_factor: number;
  land_cost_sqm: number;
  construction_cost_mw: number;
  latency_ms: Record<string, number>;
  disaster_risk: number;
  political_stability: number;
  regulatory: string;
  connectivity: string[];
  special_factors: string[];
}

export async function getLocations(body?: string): Promise<BackendLocation[]> {
  const params = body ? `?body=${encodeURIComponent(body)}` : '';
  return request<BackendLocation[]>(`/api/locations${params}`);
}

// --- Inventory ---

export interface BackendInventory {
  id: number;
  location_id: string;
  name: string;
  capacity_mw: number;
  utilization_pct: number;
  carbon_footprint_tons: number;
  power_source: string | null;
  monthly_cost: number;
  solana_tx_hash: string | null;
  workload_types: string[];
}

export async function getInventories(): Promise<BackendInventory[]> {
  return request<BackendInventory[]>('/api/inventories');
}

export async function createInventory(data: { inventory: Omit<BackendInventory, 'id' | 'solana_tx_hash'> & { solana_tx_hash?: string } }): Promise<BackendInventory> {
  return request<BackendInventory>('/api/inventories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteInventory(id: number): Promise<void> {
  await fetch(`${API_BASE}/api/inventories/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function updateInventory(id: number, data: Record<string, unknown>): Promise<BackendInventory> {
  return request<BackendInventory>(`/api/inventories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ inventory: data }),
  });
}
