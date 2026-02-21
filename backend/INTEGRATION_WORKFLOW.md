# Integration Workflow Guide

**This document is the single source of truth for integrating all three workstreams into the backend.**

---

## Overview

Three teams working in parallel:
- **P1 (Frontend)** — Building UI in Lovable
- **P2 (Data & AI)** — Creating location data + Claude prompts
- **P4 (Blockchain)** — Building Solana integration

**This backend is designed so all three can integrate independently, in any order, without blocking each other.**

---

## Phase 0: Backend Foundation (DONE ✓)

Current status: Backend structure is complete and modular.

```
✓ All 7 controllers scaffolded (placeholder implementations)
✓ All routes defined
✓ Database models ready
✓ Services defined (awaiting implementations)
✓ CORS enabled for frontend
✓ Environment config ready
```

**No further backend setup needed.** Ready for integration.

---

## Phase 1: P1 (Frontend) Integration

### Timeline
**Hours 0-4:** Frontend tests backend while it's being built

### What Frontend Needs
- Backend running on `http://localhost:3000`
- CORS enabled ✓
- All `/api/*` endpoints responding
- Mock data for testing UI

### Step 1: Start Backend

```bash
cd backend

# Install gems (first time only)
bundle install

# Create database
rails db:create

# Run migrations
rails db:migrate

# Start server
rails s
```

Backend running at: `http://localhost:3000`

### Step 2: Frontend Confirms Connectivity

```bash
# In frontend project
curl http://localhost:3000/api/locations
# Response: [] (empty, waiting for P2 data)

curl http://localhost:3000/api/inventories
# Response: [] (empty, waiting for seed data)

curl http://localhost:3000/health
# Response: OK
```

### Step 3: Frontend Can Start Testing

Frontend can now:
- ✓ Fetch locations endpoint (empty until P2 provides data)
- ✓ Fetch inventories endpoint (empty until seeded)
- ✓ Create inventory items
- ✓ Test CRUD operations locally
- ✓ Build UI without waiting for data

### How Frontend Integrates Data

Once P2 seeds data:

```javascript
// Frontend can fetch real data
fetch('http://localhost:3000/api/locations')
  .then(r => r.json())
  .then(locations => {
    // Render 3D globe with markers
    renderGlobe(locations)
  })

// Frontend can create inventory
fetch('http://localhost:3000/api/inventories', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    inventory: {
      location_id: 'iceland-reykjavik',
      name: 'My Data Center',
      capacity_mw: 50,
      workload_types: ['AI training'],
      utilization_pct: 80,
      carbon_footprint_tons: 1000,
      power_source: 'renewable',
      monthly_cost: 500000
    }
  })
})
```

### Checkpoint 1: P1 Ready

- [x] Backend running
- [x] CORS working
- [x] Frontend can fetch endpoints
- [x] Basic CRUD testable
- [ ] **Waiting for P2 data to display real UI**

---

## Phase 2: P2 (Data & Prompts) Integration

### Timeline
**Hours 2-8:** P2 provides location data and Claude prompts

### Step 1: Add Location Data

P2 creates location JSON files and adds them to backend:

```bash
# Create earth.json with 15+ locations
backend/data/locations/earth.json

# Create moon.json with 5+ lunar bases
backend/data/locations/moon.json

# Create mars.json with 3+ Mars locations
backend/data/locations/mars.json

# Create orbit.json with 2+ orbital platforms
backend/data/locations/orbit.json
```

**File format:**
```json
[
  {
    "id": "iceland-reykjavik",
    "name": "Reykjavik, Iceland",
    "body": "earth",
    "coordinates": { "lat": 64.15, "lng": -21.94 },
    "energy_cost_kwh": 0.03,
    "energy_sources": ["geothermal", "hydro"],
    "carbon_intensity_gco2": 28,
    "avg_temperature_c": 5,
    "cooling_method": "ambient",
    "cooling_cost_factor": 0.2,
    "land_cost_sqm": 150,
    "construction_cost_mw": 8000000,
    "latency_ms": { "eu": 30, "us": 80, "apac": 200 },
    "disaster_risk": 25,
    "political_stability": 95,
    "regulatory": "EU/EEA, favorable data center policies",
    "connectivity": ["DANICE submarine cable", "Farice-1"],
    "special_factors": ["100% renewable grid", "natural cooling year-round"]
  }
]
```

### Step 1.5: Verify Location Data Loads

```bash
# In backend directory
rails c
> LocationService.all.count
# Should print: (number of locations)

> LocationService.find('iceland-reykjavik')
# Should print location object

> LocationService.by_body('moon').count
# Should print: (number of moon locations)
```

### Step 2: Add Demo Inventory

P2 creates demo inventory file:

```bash
# Create demo-inventory.json with 5 sample data centers
backend/data/demo-inventory.json
```

**File format:**
```json
[
  {
    "location_id": "ashburn-virginia",
    "name": "AcmeCorp US-East-1",
    "capacity_mw": 200,
    "workload_types": ["cloud services", "AI inference"],
    "utilization_pct": 85,
    "carbon_footprint_tons": 45000,
    "power_source": "grid (40% fossil)",
    "monthly_cost": 2800000
  },
  {
    "location_id": "iceland-reykjavik",
    "name": "AcmeCorp Green-1",
    "capacity_mw": 50,
    "workload_types": ["AI training"],
    "utilization_pct": 65,
    "carbon_footprint_tons": 120,
    "power_source": "geothermal",
    "monthly_cost": 450000
  }
]
```

### Step 2.5: Seed Database

```bash
# In backend directory
rails db:seed
# Should import demo-inventory.json into database

# Verify
rails c
> Inventory.count
# Should print: 5 (or however many you seeded)

> Inventory.first
# Should print: AcmeCorp US-East-1
```

### Step 3: Add Claude Prompts

P2 creates 4 prompt files and adds them to backend:

```bash
# 4 files to create:
backend/prompts/scorecard.md
backend/prompts/blueprint.md
backend/prompts/advisor.md
backend/prompts/recommend.md
```

**Example scorecard.md:**
```markdown
You are Orbital Atlas, an expert data center infrastructure consultant.

Given a location's data and the user's existing portfolio, generate a feasibility scorecard in JSON format.

## Output Format (MUST be valid JSON)
{
  "scores": {
    "cost": 0-100,
    "power": 0-100,
    "cooling": 0-100,
    "latency": 0-100,
    "carbon": 0-100,
    "risk": 0-100
  },
  "overall_grade": "A|B|C|D|F",
  "summary": "2-3 sentence analysis",
  "estimated_cost_range": "$XXM - $YYM",
  "estimated_timeline": "XX-YY months",
  "portfolio_impact": "How this affects portfolio"
}

## Scoring Guidelines
- cost: 100 = cheapest, 0 = prohibitively expensive
- power: 100 = abundant & cheap, 0 = scarce
- cooling: 100 = natural cooling, 0 = extreme requirements
- latency: 100 = <10ms to markets, 0 = >1s
- carbon: 100 = zero carbon, 0 = 100% fossil
- risk: 100 = minimal risk, 0 = extreme risk
```

### Step 4: Implement ClaudeService

P2 implements methods in `app/services/claude_service.rb`:

```ruby
class ClaudeService
  # P2: Replace these TODO implementations

  def self.generate_scorecard(location, inventory = [])
    # Call Claude API with scorecard prompt
    # Return JSON response
  end

  def self.generate_blueprint(location, scorecard = {}, inventory = [])
    # Call Claude API with blueprint prompt
    # Return JSON response
  end

  def self.chat(message, inventory = [], history = [])
    # Call Claude API with advisor prompt
    # Stream or return response
  end

  def self.recommend(requirements, inventory = [])
    # Call Claude API with recommendations prompt
    # Return JSON response
  end
end
```

### Step 4.5: Verify Claude Integration

```bash
# Ensure CLAUDE_API_KEY is set in .env
echo $CLAUDE_API_KEY

# Test in Rails console
rails c
> location = LocationService.find('iceland-reykjavik')
> ClaudeService.generate_scorecard(location, [])
# Should return JSON scorecard

> ClaudeService.chat("Why Iceland?", [], [])
# Should return advisor response
```

### Step 5: Test Scorecard Endpoint

```bash
# Scorecard endpoint
curl -X POST http://localhost:3000/api/reports/scorecard \
  -H "Content-Type: application/json" \
  -d '{"location_id": "iceland-reykjavik"}'

# Response should be:
{
  "scores": { ... },
  "overall_grade": "A",
  "summary": "...",
  ...
}
```

### Step 6: Test Chat Endpoint

```bash
# Chat endpoint
curl -X POST http://localhost:3000/api/advisor/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What location should I consider?",
    "history": []
  }'

# Response should be:
{
  "message": "Based on your portfolio...",
  "role": "assistant"
}
```

### Checkpoint 2: P2 Complete

- [ ] All location JSON files added
- [ ] All 4 prompt files added
- [ ] ClaudeService fully implemented
- [ ] `rails db:seed` runs successfully
- [ ] `/api/locations` returns real locations
- [ ] `/api/inventories` returns seeded data
- [ ] `/api/reports/scorecard` works
- [ ] `/api/advisor/chat` works

**At this point:**
- Frontend can display real locations and inventory
- Frontend can request scorecards and get Claude responses
- Frontend can chat with advisor

---

## Phase 3: P4 (Blockchain) Integration

### Timeline
**Hours 4-12:** P4 connects Solana integration

### Step 1: P4 Builds Solana Service

P4 creates Solana minting service (Node.js, Python, or Rust):

**Service should:**
- Accept `(location_data, inventory_data)`
- Mint transaction on Solana devnet
- Return transaction hash string
- Format: `"5K4v..."`

### Step 2: Update SolanaController

Backend team (or P4) updates `app/controllers/api/solana_controller.rb`:

```ruby
module Api
  class SolanaController < ApplicationController
    def mint
      # ... existing code ...

      # Option A: Call external Solana service
      tx_hash = HTTParty.post(
        ENV['SOLANA_SERVICE_URL'] || 'http://localhost:4000/mint',
        body: {
          location: location.to_json,
          inventory: inventory.to_json
        }.to_json,
        headers: { 'Content-Type' => 'application/json' }
      )['tx_hash']

      # Option B: Use solana-rb gem if available
      # tx_hash = SolanaService.mint_record(location, inventory)

      # Update inventory with hash
      inventory.update(solana_tx_hash: tx_hash)

      render json: {
        tx_hash: tx_hash,
        explorer_url: "https://explorer.solana.com/tx/#{tx_hash}?cluster=devnet"
      }, status: :created
    end
  end
end
```

### Step 3: Add Solana Environment Variables

Update `.env`:

```bash
SOLANA_SERVICE_URL=http://localhost:4000
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_MOCK=false  # Disable mock mode when real service is ready
```

### Step 4: Test Solana Endpoint

```bash
# First create an inventory item
curl -X POST http://localhost:3000/api/inventories \
  -H "Content-Type: application/json" \
  -d '{
    "inventory": {
      "location_id": "iceland-reykjavik",
      "name": "Test DC",
      "capacity_mw": 50,
      "workload_types": ["AI training"],
      "utilization_pct": 80,
      "carbon_footprint_tons": 500,
      "power_source": "geothermal",
      "monthly_cost": 100000
    }
  }'
# Gets inventory_id: 1

# Then mint on Solana
curl -X POST http://localhost:3000/api/solana/mint \
  -H "Content-Type: application/json" \
  -d '{
    "location_id": "iceland-reykjavik",
    "inventory_id": 1
  }'

# Response should be:
{
  "tx_hash": "5K4v...",
  "explorer_url": "https://explorer.solana.com/tx/5K4v...?cluster=devnet"
}
```

### Step 5: Verify Transaction on Chain

```bash
# Visit Solana explorer
https://explorer.solana.com/tx/5K4v...?cluster=devnet

# Should show the transaction
```

### Checkpoint 3: P4 Complete

- [ ] Solana service implemented
- [ ] SolanaController updated
- [ ] Environment variables set
- [ ] `/api/solana/mint` endpoint works
- [ ] Transactions appear on Solana explorer

**At this point:**
- Frontend can mint records on blockchain
- Inventory items store transaction hashes
- Full end-to-end demo possible

---

## Full Integration Flow

### Hour 0-4: Foundation
```
Backend setup (Person 3)
├─ All files created ✓
├─ Routes defined ✓
├─ Controllers scaffolded ✓
└─ Models ready ✓
```

### Hour 4-8: P1 + P2 Parallel
```
P1 (Frontend)                 P2 (Data & AI)
├─ Start backend             ├─ Add location JSON
├─ Test endpoints            ├─ Add demo inventory
├─ Build UI components       ├─ Implement Claude
└─ Ready for data            └─ Run db:seed

Checkpoint: Frontend displays real locations + inventory
```

### Hour 8-12: P4 Integration
```
P4 (Blockchain)
├─ Build Solana service
├─ Connect to endpoint
└─ Test minting

Checkpoint: Inventory items can be minted on blockchain
```

### Hour 12+: Polish & Deploy
```
All Systems
├─ End-to-end demo works
├─ Error handling solid
├─ Performance optimized
└─ Ready for presentation
```

---

## Integration Testing Checklist

### After Each Phase

**Phase 1: Backend + P1 (Frontend)**
```
[ ] rails s starts without errors
[ ] curl http://localhost:3000/health returns OK
[ ] GET /api/locations returns empty array []
[ ] GET /api/inventories returns empty array []
[ ] POST /api/inventories creates item
[ ] DELETE /api/inventories/:id removes item
```

**Phase 2: P2 (Data & Prompts)**
```
[ ] rails db:seed returns no errors
[ ] LocationService.all.count > 0
[ ] GET /api/locations returns N locations
[ ] Inventory.count matches seeded data
[ ] POST /api/reports/scorecard returns valid JSON
[ ] POST /api/advisor/chat returns message
[ ] POST /api/advisor/recommend returns recommendations
```

**Phase 3: P4 (Blockchain)**
```
[ ] POST /api/solana/mint returns tx_hash
[ ] Solana explorer shows transaction
[ ] inventory.solana_tx_hash is populated
[ ] GET /api/portfolio/stats shows Solana records
```

---

## Troubleshooting Integration

### "Locations are empty"
```bash
# Check if files exist
ls backend/data/locations/*.json

# Verify JSON is valid
jq . backend/data/locations/earth.json

# Check service loads it
rails c
> LocationService.all.count
```

### "Claude not responding"
```bash
# Verify API key
echo $CLAUDE_API_KEY

# Check prompt files exist
ls backend/prompts/*.md

# Test service directly
rails c
> ClaudeService.generate_scorecard(LocationService.find('iceland-reykjavik'), [])
```

### "Solana endpoint returns error"
```bash
# Check environment variables
echo $SOLANA_SERVICE_URL
echo $SOLANA_MOCK

# Test with mock mode enabled
# Set SOLANA_MOCK=true to use mock tx_hash

# Verify external service is running
curl $SOLANA_SERVICE_URL/mint
```

### "CORS errors in frontend"
```bash
# CORS is already configured in config/initializers/cors.rb
# For development, it allows all origins

# Verify response includes CORS headers
curl -i http://localhost:3000/api/locations | grep -i "access-control"

# Backend should respond with:
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD
```

---

## File Changes Summary

### P2 (Data & Prompts) Must Add:
```
backend/data/locations/earth.json          (NEW)
backend/data/locations/moon.json           (NEW)
backend/data/locations/mars.json           (NEW)
backend/data/locations/orbit.json          (NEW)
backend/data/demo-inventory.json           (NEW)
backend/prompts/scorecard.md               (NEW)
backend/prompts/blueprint.md               (NEW)
backend/prompts/advisor.md                 (NEW)
backend/prompts/recommend.md               (NEW)
backend/app/services/claude_service.rb     (MODIFY - implement methods)
```

### P4 (Blockchain) Must Add/Modify:
```
backend/app/controllers/api/solana_controller.rb   (MODIFY - implement mint)
backend/.env                                        (MODIFY - add SOLANA_SERVICE_URL)
```

### P1 (Frontend) Can Use:
```
All endpoints at http://localhost:3000/api/*

GET  /api/locations
GET  /api/locations/:id
GET  /api/inventories
POST /api/inventories
GET  /api/inventories/:id
PATCH /api/inventories/:id
DELETE /api/inventories/:id
POST /api/reports/scorecard
POST /api/reports/blueprint
POST /api/advisor/chat
POST /api/advisor/recommend
POST /api/payments/checkout
GET  /api/payments/session/:session_id
GET  /api/portfolio/stats
POST /api/solana/mint
GET  /health
```

---

## Deployment

### Before Going Live

```bash
# Complete all integration phases
[ ] Location data loaded
[ ] Claude prompts implemented
[ ] Solana service connected
[ ] All endpoints tested

# Deploy to Fly.io or Railway
flyctl deploy
# or
git push origin main  # (if using Railway)

# Set production environment variables
flyctl secrets set CLAUDE_API_KEY=sk-ant-...
flyctl secrets set STRIPE_SECRET_KEY=sk_test_...
flyctl secrets set SOLANA_SERVICE_URL=...

# Verify deployment
curl https://orbital-atlas-api.fly.dev/health
curl https://orbital-atlas-api.fly.dev/api/locations

# Update frontend API URL (from localhost:3000 to fly.dev)
```

---

## Quick Reference: Integration Checklist

- [ ] **Phase 0:** Backend structure complete
  - [x] Project scaffolded
  - [x] Routes defined
  - [x] Controllers created
  - [x] Database ready

- [ ] **Phase 1:** P1 (Frontend) Integration
  - [ ] Backend running on localhost:3000
  - [ ] CORS working
  - [ ] Frontend can fetch endpoints

- [ ] **Phase 2:** P2 (Data & AI) Integration
  - [ ] Location JSON files added
  - [ ] Demo inventory added & seeded
  - [ ] Claude prompts added
  - [ ] ClaudeService implemented
  - [ ] `/api/reports/scorecard` works
  - [ ] `/api/advisor/chat` works

- [ ] **Phase 3:** P4 (Blockchain) Integration
  - [ ] Solana service built
  - [ ] SolanaController updated
  - [ ] `/api/solana/mint` works
  - [ ] Transactions on Solana explorer

- [ ] **Final:** Deployment Ready
  - [ ] All phases complete
  - [ ] End-to-end demo works
  - [ ] Error handling solid
  - [ ] Deployed & accessible

---

**This is your integration roadmap. Follow it phase-by-phase, and all three teams stay unblocked.**
