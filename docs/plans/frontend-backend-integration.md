# Frontend–Backend Integration Plan

**Date:** 2026-02-22
**Goal:** Connect the existing React frontend to the Rails backend API, feature by feature.

---

## Current State

The frontend has a working API client (`src/lib/api.ts`) with functions for all major endpoints, but most components use **hardcoded constants or local state** instead of calling the backend. The backend is fully built with all endpoints operational.

### What's Already Connected
- **ChatPanel** → `POST /api/advisor/chat` (working)
- **ScorecardPanel** → `POST /api/reports/scorecard` + `POST /api/payments/checkout` + `GET /api/payments/check` (partial — shows mock first, fetches real in background)
- **PaymentSuccess** → `GET /api/payments/session/:id` (working)

### What Needs Connecting
- Atlas.tsx doesn't fetch locations from API
- Inventory is local-only (not persisted)
- ComparePanel uses hardcoded data
- AddLocationPanel doesn't call backend
- No Solana mint button
- No `customerId` passed to any API call
- Missing API functions: `deleteInventory`, `updateInventory`, `mintSolana`

---

## Feature 1: Wire Locations from Backend

**Files:** `src/pages/Atlas.tsx`, `src/lib/api.ts`

### Problem
Atlas.tsx initializes regions from `GROUND_REGIONS` constant (hardcoded). The backend has `GET /api/locations` with richer data (energy costs, latency, regulatory info, etc.).

### Tasks
1. Add `getLocations(body?: string)` query param support in `api.ts`
2. In Atlas.tsx, call `getLocations()` on mount
3. Map backend location format → `GroundRegion` / `SatelliteData` format the globe expects
4. Keep the carbon fluctuation simulation (nice UX), but seed from real backend values
5. Keep satellite motion simulation (orbital mechanics), seed from backend data

### Backend Location Format → Frontend Format Mapping
```
Backend (JSON)                    → Frontend (GroundRegion)
─────────────────────────────────────────────────────────
id                                → id
name                              → name (split for short name)
coordinates.lat / .lng            → lat / lng
carbon_intensity_gco2             → carbonIntensity + baseCarbonIntensity
body                              → used to separate ground vs orbit
energy_cost_kwh                   → (new field, available for scorecard)
disaster_risk                     → (new field, available for scorecard)
```

### Acceptance
- Globe shows locations fetched from `GET /api/locations`
- Fallback to hardcoded constants if API is down (graceful degradation)
- No visual regression — globe looks the same

---

## Feature 2: Inventory CRUD (Persist to Backend)

**Files:** `src/pages/Atlas.tsx`, `src/components/InventoryPanel.tsx`, `src/lib/api.ts`

### Problem
Inventory lives in React `useState` only. Refreshing the page loses all data. Backend has full CRUD at `/api/inventories`.

### Tasks
1. Add missing API functions to `api.ts`:
   - `deleteInventory(id: number): Promise<void>`
   - `updateInventory(id: number, data): Promise<Record<string, unknown>>`
   - `mintSolana(locationId: string, inventoryId: number, customerId?: string)`
2. Load inventory from backend on mount: `getInventories()`
3. Map backend inventory format ↔ frontend `InventoryItem` format
4. On "Add to Inventory" (from ScorecardPanel): call `createInventory()`, then add to state
5. On "Remove": call `deleteInventory()`, then remove from state
6. Handle loading/error states

### Backend Inventory Format ↔ Frontend InventoryItem Mapping
```
Backend (DB columns)              → Frontend (InventoryItem)
─────────────────────────────────────────────────────────
id (integer, auto)                → backendId (new, for API calls)
location_id                       → id (location reference)
name                              → name
capacity_mw                       → capacityMW
utilization_pct                   → utilization
carbon_footprint_tons             → carbonFootprint
monthly_cost                      → monthlyCost
power_source                      → (new field)
solana_tx_hash                    → solanaTxHash (new field)
workload_types                    → (new field)
```

Note: Frontend `InventoryItem` also has `location`, `body`, `lat`, `lng` which come from the location data, not the inventory record. We'll need to join/enrich.

### Acceptance
- Inventory persists across page refreshes
- Add/remove operations sync to backend
- Loading spinner while fetching
- Graceful error if backend is down

---

## Feature 3: Add Location → Backend

**Files:** `src/components/AddLocationPanel.tsx`, `src/pages/Atlas.tsx`, `src/lib/api.ts`

### Problem
AddLocationPanel form creates a local `InventoryItem` but never calls the backend. The backend expects `POST /api/inventories` with specific fields.

### Tasks
1. In Atlas.tsx `handleAddLocation()`: call `createInventory()` with mapped data before adding to local state
2. In Atlas.tsx `handleBulkAddLocations()`: call `createInventory()` for each location
3. Map `NewLocationData` → backend inventory params
4. Handle validation errors from backend
5. Show success/error toast

### Field Mapping
```
NewLocationData                   → Backend POST /api/inventories
─────────────────────────────────────────────────────────
name                              → inventory[name]
(generate from coords)            → inventory[location_id]
capacityMW                        → inventory[capacity_mw]
powerSource                       → inventory[power_source]
                                  → inventory[monthly_cost] = 0 (default)
                                  → inventory[workload_types] = []
```

### Acceptance
- Adding a location persists to backend
- Bulk CSV import persists to backend
- Form shows errors if backend rejects
- Backend ID returned and stored for future operations

---

## Feature 4: ComparePanel → Real Data

**Files:** `src/components/ComparePanel.tsx`, `src/lib/api.ts`

### Problem
ComparePanel builds `ALL_COMPARE_LOCATIONS` from hardcoded `GROUND_REGIONS` + `INITIAL_SATELLITES` constants and generates mock scorecards client-side.

### Tasks
1. Accept locations as a prop from Atlas (which now fetches from API)
2. Or: fetch locations directly in ComparePanel via `getLocations()`
3. Keep the client-side mock scorecard for instant display (same pattern as ScorecardPanel)
4. Optionally fetch real scorecards from `POST /api/reports/scorecard` when comparison is triggered

### Acceptance
- Compare panel shows backend locations, not hardcoded constants
- Still works offline with graceful degradation

---

## Feature 5: Pass customerId to API Calls

**Files:** `src/lib/auth.tsx`, `src/pages/Atlas.tsx`, `src/components/ScorecardPanel.tsx`, `src/components/ChatPanel.tsx`

### Problem
Auth is localStorage-based with `username` as the user identifier. No API call passes `customerId`, so backend defaults everything to `"anonymous"`. This means payment status checks, inventory, and metering don't differentiate users.

### Tasks
1. Use `username` from auth context as `customerId`
2. Create a hook or helper: `useCustomerId()` → returns `user?.username ?? 'anonymous'`
3. Thread `customerId` through to:
   - `advisorChat(message, history, customerId)`
   - `generateScorecard(locationId, customerId)`
   - `checkPayment(locationId, customerId)`
   - `createCheckout(locationId, locationName, email)`
   - `mintSolana(locationId, inventoryId, customerId)`

### Acceptance
- All API calls include `customerId`
- Payment checks work per-user
- Advisor chat tracks user identity

---

## Feature 6: Solana Mint Button

**Files:** `src/components/InventoryPanel.tsx`, `src/lib/api.ts`

### Problem
No mint button exists in the UI. Backend has `POST /api/solana/mint` ready (with mock mode via `SOLANA_MOCK=true`).

### Tasks
1. Add `mintSolana()` function to `api.ts`
2. Add "Mint to Solana" button to each inventory card in InventoryPanel
3. Show loading state during mint
4. After mint: display `explorer_url` as a link
5. Show `solanaTxHash` badge if already minted (disable re-mint)

### Acceptance
- Each inventory item shows "Mint to Solana" button
- Minting calls backend, gets back tx_hash + explorer URL
- Already-minted items show explorer link instead of mint button
- Loading spinner during mint operation

---

## Feature 7: Environment Setup

**Files:** `frontend/.env`, `frontend/.env.example`

### Tasks
1. Create `.env.example`:
   ```
   VITE_API_URL=http://localhost:3002
   ```
2. Create `.env` for local development (gitignored)
3. Verify vite config uses port 8080 (already configured)

---

## Execution Order

```
Feature 7 (.env)          → 5 min, unblocks everything
Feature 1 (Locations)     → 30 min, core data flow
Feature 2 (Inventory)     → 45 min, persistence
Feature 3 (Add Location)  → 20 min, builds on Feature 2
Feature 5 (customerId)    → 15 min, threading auth
Feature 4 (Compare)       → 20 min, builds on Feature 1
Feature 6 (Solana mint)   → 20 min, builds on Feature 2
```

Total: ~7 features, incremental, each one testable independently.
