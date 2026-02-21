# Architecture & Modularity Guide

This file explains how the backend is structured for easy, parallel integration.

## System Overview

```
ORBITAL ATLAS BACKEND
│
├─ DATA LAYER
│  ├─ LocationService (static JSON loader)
│  ├─ Inventory Model (user's data centers)
│  └─ Database (PostgreSQL)
│
├─ API LAYER (7 Controllers)
│  ├─ LocationsController (reads JSON)
│  ├─ InventoriesController (CRUD)
│  ├─ ReportsController (Claude calls)
│  ├─ AdvisorController (Chat & recommendations)
│  ├─ PaymentsController (Stripe)
│  ├─ PortfolioController (Analytics)
│  └─ SolanaController (Blockchain)
│
└─ SERVICE LAYER (2 Services)
   ├─ LocationService (query helpers)
   └─ ClaudeService (AI integration)
```

## Why This Structure is Modular

### 1. Independent Controllers
Each API endpoint is its own controller class with no cross-dependencies:

```
POST /api/inventories    → InventoriesController#create
POST /api/reports/scorecard → ReportsController#scorecard
POST /api/solana/mint    → SolanaController#mint
```

**Impact:** P1 can test inventory CRUD while P4 works on Solana. No blocking.

### 2. Pluggable Services
Services are injected, not hardcoded:

```ruby
# ReportsController calls ClaudeService
class ReportsController < ApplicationController
  def scorecard
    result = ClaudeService.generate_scorecard(location, inventory)
  end
end

# P2 replaces ClaudeService implementation later
# No controller changes needed
```

**Impact:** Swap implementations without touching controllers.

### 3. Static Data Loading
Locations come from JSON files, not a database:

```ruby
# LocationService.all loads from data/locations/*.json
# P2 can update JSON files anytime
# No database migration needed
```

**Impact:** P2 can add/edit locations without running migrations.

### 4. Isolated Integration Points
Each team's work has clear boundaries:

```
P1 (Frontend)     P2 (Data & AI)    P4 (Blockchain)
│                 │                  │
├─ Calls API      ├─ Provides:       ├─ Provides:
├─ Gets JSON      │  - Location      │  - Solana
├─ Submits forms  │    JSON          │    service
└─ Shows data     │  - Claude        └─ Mint function
                  │    prompts
                  └─ Demo data
```

---

## File Dependencies

### Zero Hard Dependencies

```
LocationService  → LocationsController ✓ (one-way)
InventoriesController → Inventory Model ✓ (one-way)
PortfolioController → LocationService ✓ (one-way)
ReportsController → ClaudeService (placeholder) ✓ (swappable)
SolanaController → SolanaService (external) ✓ (pluggable)
```

**No circular dependencies.** Each module can be tested in isolation.

### Data Flow

```
User Request
    ↓
Routes (config/routes.rb)
    ↓
Controller (app/controllers/api/*.rb)
    ↓
Service / Model (app/services/*.rb or app/models/*.rb)
    ↓
Data Source (JSON files or Database)
    ↓
JSON Response
```

Each layer is independent and testable.

---

## Integration Timeline

### Hour 0-2: Setup (DONE ✓)
- [x] Create file structure
- [x] Define routes
- [x] Scaffold controllers
- [x] Scaffold models
- [x] Create services

### Hour 2-4: P1 Kickoff (READY)
**Frontend can:**
- Fetch `GET /api/locations`
- Fetch `GET /api/inventories`
- POST to create inventory
- See CORS working

**No P2 or P4 needed yet.**

### Hour 4-8: P2 Integration (WAITING)
**Once P2 provides:**
1. Location JSON files
2. Demo inventory JSON
3. Claude prompts

**Backend becomes:**
- `LocationService.all` returns real locations
- `POST /api/reports/scorecard` calls Claude
- `rails db:seed` pre-populates data

**Frontend can:**
- Display real locations on globe
- Show scorecard when clicking location
- Load inventory from database

### Hour 8-16: P4 Integration (WAITING)
**Once P4 provides:**
1. Solana minting service
2. Transaction hash function

**Backend becomes:**
- `POST /api/solana/mint` works end-to-end
- Inventory records store tx_hash
- Frontend shows Solana link

### Hour 16-24: Polish (READY WHEN DATA ARRIVES)
- [ ] Error handling & edge cases
- [ ] Performance optimization
- [ ] Full demo flow tested
- [ ] Ready for presentation

---

## Modularity Benefits

### 1. Parallel Development
```
Hour 0-4:  Backend scaffolding (Person 3)
Hour 4-8:  P1 tests endpoints as they work on UI
Hour 4-8:  P2 builds location data & prompts in parallel
Hour 4-8:  P4 builds Solana integration in parallel
```

### 2. Integration Without Conflicts
```
P2 adds location.json → LocationService reads it → No code change needed
P2 upgrades claude_service.rb → Controllers call updated service → Works
P4 connects solana → SolanaController calls it → Works
```

### 3. Easy Testing
```ruby
# Test without external services
LocationService.all  # Works (uses JSON files)
Inventory.create     # Works (uses local database)

# Test without P2
SolanaController.new.mint(location, inventory)  # Works (mock mode)

# Test controllers independently
post :scorecard, params: { location_id: 'iceland' }
```

### 4. Flexible Integration Order
```
Scenario A: P2 ready first
├─ Add location JSON
├─ Test reports endpoint
└─ Check it works

Scenario B: P4 ready first
├─ Connect Solana service
├─ Test mint endpoint
└─ Check it works

No blocking. Each team can finish in any order.
```

---

## How to Use This Structure

### For Backend (Person 3)
1. Keep controllers thin (delegate to services)
2. Keep services focused (one responsibility each)
3. All data validation in models
4. All business logic in services

### For P1 (Frontend)
1. All endpoints documented in `/api/` namespace
2. Use any HTTP client (fetch, axios, etc.)
3. CORS enabled for development
4. Mock responses available

### For P2 (Data & AI)
1. Add JSON files to `data/locations/`
2. Add prompts to `prompts/`
3. Update `ClaudeService` methods
4. No database migrations needed

### For P4 (Blockchain)
1. Implement Solana integration
2. Call `SolanaController#call_solana_service()`
3. Return tx_hash string
4. No controller changes needed

---

## Example: Adding a Complete Feature

**Scenario:** Add a "Compare Locations" feature

### Step 1: Define Route
```ruby
# config/routes.rb
post 'compare/analysis', to: 'compare#analysis'
```

### Step 2: Create Controller
```ruby
# app/controllers/api/compare_controller.rb
class CompareController < ApplicationController
  def analysis
    locations = params[:location_ids].map { |id| LocationService.find(id) }
    filters = CompareService.analyze(locations, params[:filters])
    render json: filters
  end
end
```

### Step 3: Create Service
```ruby
# app/services/compare_service.rb
class CompareService
  def self.analyze(locations, filters)
    # Business logic here
  end
end
```

### Result
✓ New feature integrated without modifying existing code
✓ Other teams unaffected
✓ Ready for P1 to integrate

---

## Key Principles

### 1. Single Responsibility
- Controllers handle HTTP
- Services handle business logic
- Models handle data validation

### 2. Dependency Injection
- Controllers call services
- Services are replaceable
- Easy to swap implementations

### 3. Minimal Coupling
- Controllers don't talk to each other
- Services don't depend on HTTP layer
- Models don't depend on services

### 4. Maximum Cohesion
- All location logic in LocationService
- All inventory logic in InventoriesController + Inventory model
- All Claude logic in ClaudeService

---

## Deployment Ready

This structure scales for production:

```
Development (localhost:3000)
    ↓
Staging (orbital-atlas-api-staging.fly.dev)
    ↓
Production (orbital-atlas-api.fly.dev)
```

Same code, same tests, same structure.
No architectural changes needed.

---

## Summary

**This backend is a modular, extensible system where:**

- ✓ P1 can test endpoints immediately
- ✓ P2 can integrate data anytime
- ✓ P4 can integrate blockchain anytime
- ✓ No component blocks another
- ✓ All integration points are clear
- ✓ Easy to test independently
- ✓ Easy to deploy together
