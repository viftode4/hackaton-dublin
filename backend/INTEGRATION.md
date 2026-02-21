# Integration Guide

This document explains how to integrate work from P1 (Frontend), P2 (Data & AI), and P4 (Blockchain).

## Current Status

✓ **Phase 1 Complete:** Backend structure modular and ready for integration

---

## P2: Data & Claude Prompts

### What We're Waiting For

1. **Location Data Files** (4 files)
   - `earth.json` — 15+ Earth locations
   - `moon.json` — 5+ Lunar bases
   - `mars.json` — 3+ Mars locations
   - `orbit.json` — 2+ Orbital platforms

2. **Demo Inventory** (1 file)
   - `demo-inventory.json` — 5 sample data centers with all fields

3. **Claude Prompts** (4 files)
   - `scorecard.md` — System prompt for scorecard generation
   - `blueprint.md` — System prompt for blueprint generation
   - `advisor.md` — System prompt for advisor chat
   - `recommend.md` — System prompt for recommendations

### How to Integrate

1. **Replace placeholder files:**
   ```bash
   # Remove placeholders
   rm backend/data/locations/*.placeholder
   rm backend/data/demo-inventory.json.placeholder
   rm backend/prompts/*.placeholder
   
   # Add your real files
   backend/data/locations/earth.json
   backend/data/locations/moon.json
   backend/data/locations/mars.json
   backend/data/locations/orbit.json
   backend/data/demo-inventory.json
   backend/prompts/scorecard.md
   backend/prompts/blueprint.md
   backend/prompts/advisor.md
   backend/prompts/recommend.md
   ```

2. **Update ClaudeService** in `app/services/claude_service.rb`
   - Replace TODO implementations with real Claude API calls
   - Use `anthropic-sdk` gem (already in Gemfile)
   - Follow existing placeholder structure

3. **Verify:**
   ```bash
   # Seed demo data
   rails db:seed
   
   # Test endpoints
   curl http://localhost:3000/api/locations
   curl -X POST http://localhost:3000/api/reports/scorecard \
     -H "Content-Type: application/json" \
     -d '{"location_id": "iceland-reykjavik"}'
   ```

### File Format Examples

**Location Schema:**
```json
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
```

**Inventory Entry:**
```json
{
  "location_id": "iceland-reykjavik",
  "name": "AcmeCorp Iceland DC-1",
  "capacity_mw": 50,
  "workload_types": ["AI training", "batch processing"],
  "utilization_pct": 72,
  "carbon_footprint_tons": 120,
  "power_source": "geothermal",
  "monthly_cost": 450000
}
```

---

## P1: Frontend Integration

### What Frontend Expects

All endpoints are at `/api/*` namespace:

```typescript
// Locations
GET /api/locations
GET /api/locations/:id
GET /api/locations?body=earth
GET /api/locations?search=iceland

// Inventory
GET /api/inventories
POST /api/inventories
GET /api/inventories/:id
PATCH /api/inventories/:id
DELETE /api/inventories/:id

// Reports
POST /api/reports/scorecard { location_id }
POST /api/reports/blueprint { location_id, scorecard }

// Advisor
POST /api/advisor/chat { message, history }
POST /api/advisor/recommend { requirements }

// Payments
POST /api/payments/checkout { location_id, location_name, success_url, cancel_url }
GET /api/payments/session/:session_id

// Portfolio
GET /api/portfolio/stats

// Blockchain
POST /api/solana/mint { location_id, inventory_id }

// Health
GET /health
```

### How to Test Integration

1. **Start backend:**
   ```bash
   cd backend
   rails s
   # API available at http://localhost:3000
   ```

2. **Frontend can fetch locations:**
   ```javascript
   fetch('http://localhost:3000/api/locations')
     .then(r => r.json())
     .then(console.log)
   ```

3. **CORS is enabled** for all origins (lock down in production)

### Expected Response Formats

**Locations List:**
```json
[
  {
    "id": "iceland-reykjavik",
    "name": "Reykjavik, Iceland",
    "body": "earth",
    ...
  }
]
```

**Inventory List:**
```json
[
  {
    "id": 1,
    "location_id": "iceland-reykjavik",
    "name": "AcmeCorp Iceland DC-1",
    ...
  }
]
```

**Scorecard Response (from Claude):**
```json
{
  "scores": {
    "cost": 88,
    "power": 95,
    "cooling": 97,
    "latency": 65,
    "carbon": 99,
    "risk": 82
  },
  "overall_grade": "A",
  "summary": "Reykjavik offers exceptional...",
  "estimated_cost_range": "$380M - $450M",
  "estimated_timeline": "18-24 months",
  "portfolio_impact": "Would reduce portfolio carbon by 30%"
}
```

---

## P4: Blockchain Integration

### What We're Waiting For

- Solana service endpoint or function
- Minting logic that takes `(location, inventory)` and returns tx_hash

### How to Integrate

1. **Update SolanaController** in `app/controllers/api/solana_controller.rb`
   - Replace `call_solana_service()` with real implementation
   - Method should take `(location, inventory)` and return Solana tx hash

2. **Option A: External Service**
   ```ruby
   # In call_solana_service()
   response = HTTParty.post(
     'https://your-solana-service/mint',
     body: { location:, inventory: }.to_json
   )
   response['tx_hash']
   ```

3. **Option B: Inline (if using solana-rb gem)**
   ```ruby
   # In call_solana_service()
   tx_hash = SolanaService.mint_record(location, inventory)
   ```

4. **Verify:**
   ```bash
   # With SOLANA_MOCK=true (development)
   curl -X POST http://localhost:3000/api/solana/mint \
     -H "Content-Type: application/json" \
     -d '{
       "location_id": "iceland-reykjavik",
       "inventory_id": 1
     }'
   ```

### Expected Output

```json
{
  "tx_hash": "5K4v...",
  "explorer_url": "https://explorer.solana.com/tx/5K4v...?cluster=devnet"
}
```

---

## Integration Checklist

### P2 Checklist
- [ ] Provide location JSON files (4 files)
- [ ] Provide demo-inventory.json (1 file)
- [ ] Provide Claude prompts (4 files)
- [ ] Implement ClaudeService methods
- [ ] Test scorecards/blueprints locally
- [ ] Test advisor chat locally

### P1 Checklist
- [ ] Can fetch `/api/locations`
- [ ] Can fetch `/api/inventories`
- [ ] Can POST to create inventory
- [ ] Can POST to scorecard endpoint
- [ ] CORS requests working
- [ ] Backend URL accessible

### P4 Checklist
- [ ] Solana service ready
- [ ] Returns valid tx_hash format
- [ ] Tested with mock data
- [ ] Ready to connect to endpoint

### Deployment Checklist
- [ ] All files integrated (no more .placeholder files)
- [ ] Database seeded with demo data
- [ ] Environment variables set
- [ ] Health check passing
- [ ] All CRUD operations tested
- [ ] Claude API working
- [ ] Stripe configured (if needed)
- [ ] Solana service connected
- [ ] Deployed to Fly.io/Railway

---

## Troubleshooting

### Locations Not Loading
```bash
# Check if JSON files exist
ls backend/data/locations/*.json

# Check JSON is valid
jq . backend/data/locations/earth.json

# Check service in Rails console
rails c
> LocationService.all.count
```

### Claude Service Not Responding
```bash
# Verify API key
echo $CLAUDE_API_KEY

# Test in console
rails c
> ClaudeService.generate_scorecard(LocationService.find('iceland-reykjavik'), [])
```

### CORS Issues
- Backend has CORS enabled for `*` (development only)
- Check frontend is making requests to `http://localhost:3000/api/*`
- Not `http://localhost:3000/api/*` from different port

---

## Quick Reference

**Backend structure is modular.**
Each system (Locations, Inventory, Claude, Stripe, Solana) is **independent** and can be integrated in any order.

**All integration points marked with TODO:**
- Search for `TODO:` in code to find what needs implementation

**Three main integration files:**
1. `app/services/claude_service.rb` — P2's work
2. `app/controllers/api/solana_controller.rb` — P4's work
3. Controllers ready for P1's requests

**No conflicts or dependencies** between parallel workstreams.
