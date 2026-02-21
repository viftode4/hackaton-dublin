# Orbital Atlas — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a 3D interactive solar system data center feasibility estimator that stacks 10 hackathon challenges (~€30.5k+).

**Architecture:** Lovable-built React frontend with 3D globe (Three.js), Ruby on Rails API backend, Claude AI via Crusoe for report generation, Solana for on-chain portfolio records, Stripe + Paid for billing.

**Tech Stack:** React (Lovable), Three.js, Ruby on Rails 7, PostgreSQL, Claude API (via Crusoe), Solana web3.js, Stripe, Paid.ai

---

## API Contract (AGREE ON THIS FIRST — Hour 0)

Everyone reads this before starting. Frontend and backend work independently against this contract.

### Endpoints

```
GET    /api/locations                    → List all curated locations
GET    /api/locations/:id                → Get one location with full data
GET    /api/inventory                    → List user's data centers
POST   /api/inventory                    → Add a data center to inventory
DELETE /api/inventory/:id                → Remove from inventory
POST   /api/reports/scorecard            → Generate quick scorecard (Claude)
POST   /api/reports/blueprint            → Generate full blueprint (Claude, paid)
POST   /api/advisor/chat                 → Chat with AI advisor (streaming SSE)
POST   /api/advisor/recommend            → Get top-N location recommendations
POST   /api/payments/checkout            → Create Stripe checkout session
POST   /api/solana/mint                  → Mint on-chain record for approved site
GET    /api/portfolio/stats              → Portfolio analytics (carbon, coverage, etc.)
```

### Key Data Shapes

```json
// Location
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

// Inventory Item
{
  "id": 1,
  "location_id": "iceland-reykjavik",
  "name": "AcmeCorp Iceland DC-1",
  "capacity_mw": 50,
  "workload_types": ["AI training", "batch processing"],
  "utilization_pct": 72,
  "carbon_footprint_tons": 120,
  "power_source": "geothermal",
  "solana_tx_hash": "5K4v...",
  "monthly_cost": 150000
}

// Scorecard (Claude response)
{
  "location_id": "iceland-reykjavik",
  "scores": {
    "cost": 88, "power": 95, "cooling": 97,
    "latency": 65, "carbon": 99, "risk": 82
  },
  "overall_grade": "A",
  "summary": "Reykjavik offers exceptional...",
  "estimated_cost_range": "$380M - $450M",
  "estimated_timeline": "18-24 months",
  "portfolio_impact": "Would reduce portfolio carbon by 30%"
}
```

---

## Timeline Overview (48 hours)

```
Hour  0-2:   Setup + API contract agreement + scaffolding
Hour  2-8:   Core build (each person on their track)
Hour  8-10:  First integration checkpoint — frontend talks to backend
Hour 10-20:  Feature completion (reports, chat, Solana, Stripe)
Hour 20-24:  Integration + polish
Hour 24-30:  Sleep
Hour 30-40:  Bug fixes, stretch features, demo prep
Hour 40-44:  Full demo rehearsal
Hour 44-48:  Final polish + submit
```

---

## WORKSTREAM 1: Frontend (Lovable) — Person 1

### Task 1.1: Scaffold Project in Lovable

**Step 1:** Create new Lovable project
- Go to lovable.dev, create new project
- Prompt: "Create a React app with a dark sci-fi theme. Full-screen layout with a 3D Earth globe on the left (70% width) and a collapsible right panel (30%) for content. Include a top navigation bar with logo 'Orbital Atlas' and tabs: Map, Inventory, Compare, Chat. Use Tailwind CSS. Dark background (#0a0a1a), accent color cyan (#00d4ff)."

**Step 2:** Push to GitHub
- Connect Lovable to the hackaton-dublin repo
- Set up as a subdirectory or separate branch (coordinate with team)

**Step 3:** Commit scaffold

---

### Task 1.2: 3D Globe — Earth

**Step 1:** Prompt Lovable for 3D Earth
- "Add a 3D interactive Earth globe using Three.js in the main area. Use a realistic Earth texture (NASA Blue Marble). The globe should rotate slowly by default, and the user can click-drag to rotate and scroll to zoom. Add a starfield background."

**Step 2:** Add location markers
- "Add glowing cyan dot markers on the globe at these coordinates: [paste 10-15 Earth locations from the dataset]. When hovering a marker, show a tooltip with the location name. When clicking a marker, emit an event with the location ID."

**Step 3:** Test: markers appear, click events fire

**Step 4:** Commit

---

### Task 1.3: 3D Globe — Moon & Mars

**Step 1:** Add celestial body switcher
- "Add buttons at the bottom of the globe: Earth, Moon, Mars. When clicked, the globe transitions (zoom out, swap texture, zoom in) to the selected body. Use NASA textures for Moon and Mars."

**Step 2:** Add Moon location markers
- Same marker system but for Moon coordinates (lunar south pole, etc.)

**Step 3:** Add Mars location markers

**Step 4:** Test: switching between bodies works, markers show

**Step 5:** Commit

---

### Task 1.4: Scorecard Panel

**Step 1:** Build scorecard UI
- "When a location marker is clicked, slide in a panel from the right showing a scorecard. Include: location name, body (Earth/Moon/Mars with icon), 6 metric bars (cost, power, cooling, latency, carbon, risk) each scored 0-100 with color coding (red/yellow/green). Show an overall grade (A-F) as a large letter. Include a one-paragraph summary, estimated cost range, and timeline. Add a 'Full Blueprint' button and an 'Add to Inventory' button."

**Step 2:** Wire to backend API
- On marker click, call `POST /api/reports/scorecard` with `{ location_id }`
- Show loading spinner while Claude generates
- Populate scorecard with response

**Step 3:** Test: click location → scorecard appears with real data

**Step 4:** Commit

---

### Task 1.5: Chat Interface

**Step 1:** Build chat panel
- "Add a chat tab in the right panel. Standard chat UI: message list with user/assistant bubbles, text input at bottom, send button. Assistant messages should stream in character by character. Style: dark theme, cyan accent for assistant messages."

**Step 2:** Wire to backend
- On send, call `POST /api/advisor/chat` with `{ message, inventory_context }`
- Stream response via SSE
- When Claude mentions a location, make it clickable (rotates globe to that location)

**Step 3:** Test: send message → get streaming response

**Step 4:** Commit

---

### Task 1.6: Inventory Dashboard

**Step 1:** Build inventory panel
- "Add an Inventory tab showing a list of the user's data centers as cards. Each card shows: name, location (with body icon), capacity (MW), utilization %, carbon footprint, monthly cost. Include a total summary bar at top: total capacity, avg utilization, total carbon, total cost. Add a delete button on each card."

**Step 2:** Wire to backend
- Load inventory from `GET /api/inventory`
- Delete calls `DELETE /api/inventory/:id`
- "Add to Inventory" from scorecard calls `POST /api/inventory`
- Refresh dashboard after changes

**Step 3:** Show inventory items as different-colored markers on globe (green = existing, cyan = curated)

**Step 4:** Test: inventory CRUD works, globe shows both marker types

**Step 5:** Commit

---

### Task 1.7: Comparison View

**Step 1:** Build compare panel
- "Add a Compare tab. User can select 2-3 locations from a dropdown. Show side-by-side scorecards with a radar chart overlay comparing all 6 metrics. Highlight which location wins each category."

**Step 2:** Wire to backend (fetch scorecards for selected locations)

**Step 3:** Commit

---

### Task 1.8: Landing Page

**Step 1:** Build landing page
- "Create a landing page at the root route. Hero section: animated Earth globe in background, title 'Orbital Atlas', subtitle 'Plan your next data center — anywhere in the solar system', CTA button 'Launch Atlas'. Sections: How it Works (3 steps), Challenge badges (show all 10 challenge logos), Team section. Dark sci-fi theme."

**Step 2:** CTA routes to the main app

**Step 3:** Commit

---

### Task 1.9: Stripe Checkout + Solana UI

**Step 1:** Blueprint paywall
- When user clicks "Full Blueprint" on scorecard, show pricing modal
- Call `POST /api/payments/checkout` → redirect to Stripe checkout
- On return, show blueprint content

**Step 2:** Solana mint confirmation
- When user adds to inventory, show "Mint on Solana?" confirmation
- Call `POST /api/solana/mint`
- Show Solana tx link on success
- Display Solana tx hash on inventory cards

**Step 3:** Commit

---

## WORKSTREAM 2: AI + Data ("The Model") — Person 2

### Task 2.1: Curate Earth Location Dataset

**Step 1:** Create `data/locations/earth.json`

Research and create entries for 15 Earth locations. Use real data from IEA, Electricity Maps, NOAA, TeleGeography. Locations:

1. Reykjavik, Iceland (geothermal paradise)
2. Lule, Sweden (cold + hydro)
3. Dublin, Ireland (hyperscaler hub)
4. Ashburn, Virginia (Data Center Alley)
5. The Dalles, Oregon (Google's hydro hub)
6. Singapore (APAC hub, hot climate challenge)
7. Frankfurt, Germany (EU financial hub)
8. Zurich, Switzerland (stability + hydro)
9. Doha, Qatar (cheap energy, extreme heat)
10. Nairobi, Kenya (geothermal + emerging market)
11. Tasmania, Australia (cold + hydro + remote)
12. Montreal, Canada (cheap hydro + cold)
13. Johor Bahru, Malaysia (APAC growth)
14. Northern Norway (Arctic cooling + offshore wind)
15. Santiago, Chile (solar + copper for construction)

Each location must have ALL fields from the API contract data shape.

**Step 2:** Validate data — cross-check at least 5 locations against source data

**Step 3:** Commit `data/locations/earth.json`

---

### Task 2.2: Curate Moon + Mars + Orbit Dataset

**Step 1:** Create `data/locations/moon.json`

Research from NASA Artemis, ESA, and published lunar base studies:

1. Shackleton Crater Rim (south pole — near-constant sunlight)
2. Malapert Mountain (south pole — Earth line-of-sight)
3. Lava Tube (Mare Tranquillitatis — radiation shielding)
4. Aristarchus Plateau (resource-rich, near equator)
5. Lunar Far Side (no Earth radio interference, relay needed)

**Step 2:** Create `data/locations/mars.json`

1. Jezero Crater (Perseverance landing site, well-mapped)
2. Valles Marineris (canyon shielding, equatorial)
3. Olympus Mons Base (high altitude, thin atmosphere)

**Step 3:** Create `data/locations/orbit.json`

1. LEO Station (400km, ISS-style)
2. GEO Platform (35,786km, fixed position)

**Step 4:** Commit all location files

---

### Task 2.3: Claude Prompt Engineering — Scorecard

**Step 1:** Create `prompts/scorecard.md` — the system prompt for scorecard generation

```markdown
You are Orbital Atlas, an expert data center infrastructure consultant.

Given a location's data and the user's existing inventory, generate a feasibility scorecard.

## Output Format (JSON)
{
  "scores": { "cost": 0-100, "power": 0-100, "cooling": 0-100, "latency": 0-100, "carbon": 0-100, "risk": 0-100 },
  "overall_grade": "A/B/C/D/F",
  "summary": "2-3 sentence analysis",
  "estimated_cost_range": "$XXM - $XXM for 100MW facility",
  "estimated_timeline": "XX-XX months",
  "portfolio_impact": "How this changes the user's portfolio metrics"
}

## Scoring Guidelines
- cost: 100 = cheapest possible, 0 = prohibitively expensive. Consider construction + 10yr operational.
- power: 100 = abundant, cheap, reliable. 0 = scarce/unreliable.
- cooling: 100 = natural cooling, minimal cost. 0 = extreme cooling required.
- latency: 100 = <10ms to major markets. 0 = >1s (Moon/Mars).
- carbon: 100 = zero carbon. 0 = 100% fossil fuel.
- risk: 100 = minimal risk. 0 = extreme risk (political, natural disaster, operational).

## Context
You have access to the location data (energy, climate, costs, connectivity) and the user's current inventory. Factor both into your analysis.
```

**Step 2:** Test the prompt with 3 different locations via Claude API directly — iterate until quality is consistent

**Step 3:** Commit prompt file

---

### Task 2.4: Claude Prompt Engineering — Blueprint

**Step 1:** Create `prompts/blueprint.md`

```markdown
You are Orbital Atlas, an expert data center infrastructure consultant generating a detailed blueprint.

Given the location data, scorecard, and user inventory, generate a comprehensive feasibility blueprint.

## Output Format (JSON)
{
  "construction_plan": {
    "phases": [
      { "name": "Phase 1: Site Prep", "duration_months": X, "cost": "$XM", "description": "..." },
      ...
    ],
    "total_duration_months": X,
    "total_cost": "$XM"
  },
  "power_strategy": {
    "primary_source": "...",
    "backup": "...",
    "total_capacity_mw": X,
    "renewable_pct": X,
    "annual_cost": "$XM"
  },
  "cooling_design": {
    "method": "...",
    "pue_target": X.XX,
    "annual_cost": "$XM",
    "description": "..."
  },
  "network_topology": {
    "connections": ["..."],
    "latency_targets": { "eu": X, "us": X, "apac": X },
    "redundancy": "..."
  },
  "staffing": {
    "construction_crew": X,
    "operations_staff": X,
    "annual_labor_cost": "$XM"
  },
  "portfolio_impact": {
    "carbon_change_pct": X,
    "coverage_improvement": "...",
    "redundancy_score_before": X,
    "redundancy_score_after": X
  }
}
```

**Step 2:** Test with Earth + Moon location — ensure Moon blueprints are creative but plausible

**Step 3:** Commit

---

### Task 2.5: Claude Prompt Engineering — Chat Advisor

**Step 1:** Create `prompts/advisor.md`

```markdown
You are Orbital Atlas, an AI data center infrastructure advisor.

You help users plan their global (and extraterrestrial) data center portfolio. You have access to:
- A curated dataset of locations (Earth, Moon, Mars, Orbit)
- The user's current inventory of data centers
- Real energy prices, climate data, and connectivity information

When the user asks about a specific location, reference the data. When they ask for recommendations, analyze their inventory gaps and suggest optimal locations. Always explain your reasoning.

Be concise but insightful. Think like a senior infrastructure consultant with expertise in both traditional and frontier (space) data center design.

If the user asks about Moon or Mars, be genuinely analytical — these are speculative but based on real NASA/ESA research. Discuss the real engineering challenges (radiation, transport costs, communication delay) alongside the benefits (free cooling, constant solar, zero weather risk).
```

**Step 2:** Create `prompts/recommend.md` — for the recommendation endpoint

```markdown
Given the user's requirements and current inventory, recommend the top 3 locations from the dataset.

## Output Format (JSON)
{
  "recommendations": [
    {
      "location_id": "...",
      "rank": 1,
      "match_score": 95,
      "reasoning": "2-3 sentences why this is the best match",
      "trade_offs": "1 sentence on what you sacrifice"
    },
    ...
  ]
}
```

**Step 3:** Test chat flow — ensure advisor references real data and inventory

**Step 4:** Commit all prompts

---

### Task 2.6: Seed Demo Inventory

**Step 1:** Create `data/demo-inventory.json`

Pre-seeded inventory for "AcmeCorp" demo:

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
    "location_id": "dublin-ireland",
    "name": "AcmeCorp EU-West-1",
    "capacity_mw": 80,
    "workload_types": ["cloud services", "GDPR-compliant storage"],
    "utilization_pct": 72,
    "carbon_footprint_tons": 8500,
    "power_source": "grid (60% wind)",
    "monthly_cost": 1200000
  },
  {
    "location_id": "singapore",
    "name": "AcmeCorp APAC-1",
    "capacity_mw": 120,
    "workload_types": ["AI inference", "CDN edge"],
    "utilization_pct": 90,
    "carbon_footprint_tons": 35000,
    "power_source": "grid (95% natural gas)",
    "monthly_cost": 2100000
  },
  {
    "location_id": "reykjavik-iceland",
    "name": "AcmeCorp Green-1",
    "capacity_mw": 50,
    "workload_types": ["AI training", "batch processing"],
    "utilization_pct": 65,
    "carbon_footprint_tons": 120,
    "power_source": "geothermal",
    "monthly_cost": 450000
  },
  {
    "location_id": "sao-paulo-brazil",
    "name": "AcmeCorp LATAM-1",
    "capacity_mw": 60,
    "workload_types": ["CDN edge", "cloud services"],
    "utilization_pct": 55,
    "carbon_footprint_tons": 5200,
    "power_source": "grid (75% hydro)",
    "monthly_cost": 680000
  }
]
```

**Step 2:** Commit

---

## WORKSTREAM 3: Backend (Rails) — Person 3

### Task 3.1: Scaffold Rails API

**Step 1:** Create Rails app

```bash
rails new orbital-atlas-api --api --database=postgresql -T
cd orbital-atlas-api
```

**Step 2:** Add gems to Gemfile

```ruby
gem 'rack-cors'
gem 'anthropic' # or use net/http for Claude API
gem 'stripe'
gem 'dotenv-rails'
```

```bash
bundle install
```

**Step 3:** Configure CORS in `config/initializers/cors.rb`

```ruby
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins '*'  # Lock down for production
    resource '*', headers: :any, methods: [:get, :post, :put, :patch, :delete, :options, :head]
  end
end
```

**Step 4:** Set up `.env` with placeholder keys

```
CLAUDE_API_KEY=sk-ant-...
CRUSOE_INFERENCE_URL=https://...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SOLANA_RPC_URL=https://api.devnet.solana.com
PAID_API_KEY=...
```

**Step 5:** Commit scaffold

---

### Task 3.2: Location Model + API

**Step 1:** Locations are static data — no DB table needed, load from JSON files

Create `app/services/location_service.rb`:

```ruby
class LocationService
  LOCATIONS_DIR = Rails.root.join('data', 'locations')

  def self.all
    @all ||= Dir.glob(LOCATIONS_DIR.join('*.json')).flat_map do |file|
      JSON.parse(File.read(file), symbolize_names: true)
    end
  end

  def self.find(id)
    all.find { |loc| loc[:id] == id }
  end

  def self.by_body(body)
    all.select { |loc| loc[:body] == body }
  end
end
```

**Step 2:** Create `app/controllers/api/locations_controller.rb`:

```ruby
module Api
  class LocationsController < ApplicationController
    def index
      locations = LocationService.all
      locations = LocationService.by_body(params[:body]) if params[:body]
      render json: locations
    end

    def show
      location = LocationService.find(params[:id])
      if location
        render json: location
      else
        render json: { error: 'Not found' }, status: :not_found
      end
    end
  end
end
```

**Step 3:** Add routes in `config/routes.rb`:

```ruby
Rails.application.routes.draw do
  namespace :api do
    resources :locations, only: [:index, :show]
  end
end
```

**Step 4:** Copy location JSON files from P2 into `data/locations/`

**Step 5:** Test: `curl localhost:3000/api/locations` returns location list

**Step 6:** Commit

---

### Task 3.3: Inventory Model + API

**Step 1:** Generate inventory model

```bash
rails generate model Inventory location_id:string name:string capacity_mw:float workload_types:text utilization_pct:float carbon_footprint_tons:float power_source:string solana_tx_hash:string monthly_cost:float
rails db:migrate
```

**Step 2:** Create `app/controllers/api/inventories_controller.rb`:

```ruby
module Api
  class InventoriesController < ApplicationController
    def index
      render json: Inventory.all
    end

    def create
      inventory = Inventory.new(inventory_params)
      if inventory.save
        render json: inventory, status: :created
      else
        render json: { errors: inventory.errors }, status: :unprocessable_entity
      end
    end

    def destroy
      Inventory.find(params[:id]).destroy
      head :no_content
    end

    private

    def inventory_params
      params.permit(:location_id, :name, :capacity_mw, :utilization_pct,
                     :carbon_footprint_tons, :power_source, :monthly_cost,
                     workload_types: [])
    end
  end
end
```

**Step 3:** Add routes:

```ruby
namespace :api do
  resources :locations, only: [:index, :show]
  resources :inventories, only: [:index, :create, :destroy]
end
```

**Step 4:** Seed demo data: create `db/seeds.rb` that loads `data/demo-inventory.json`

```ruby
demo_data = JSON.parse(File.read(Rails.root.join('data', 'demo-inventory.json')))
demo_data.each { |item| Inventory.create!(item) }
```

```bash
rails db:seed
```

**Step 5:** Test: `curl localhost:3000/api/inventories` returns seeded data

**Step 6:** Commit

---

### Task 3.4: Claude Report Generation Service

**Step 1:** Create `app/services/claude_service.rb`:

```ruby
class ClaudeService
  CRUSOE_URL = ENV.fetch('CRUSOE_INFERENCE_URL', 'https://api.anthropic.com/v1/messages')
  API_KEY = ENV.fetch('CLAUDE_API_KEY')

  def self.generate_scorecard(location, inventory)
    system_prompt = File.read(Rails.root.join('prompts', 'scorecard.md'))
    user_message = build_scorecard_prompt(location, inventory)
    call_claude(system_prompt, user_message)
  end

  def self.generate_blueprint(location, scorecard, inventory)
    system_prompt = File.read(Rails.root.join('prompts', 'blueprint.md'))
    user_message = build_blueprint_prompt(location, scorecard, inventory)
    call_claude(system_prompt, user_message)
  end

  def self.chat(message, inventory, history: [])
    system_prompt = File.read(Rails.root.join('prompts', 'advisor.md'))
    locations_context = LocationService.all.map { |l| "#{l[:name]} (#{l[:body]}): #{l[:id]}" }.join("\n")
    full_system = "#{system_prompt}\n\n## Available Locations\n#{locations_context}\n\n## User Inventory\n#{inventory.to_json}"
    call_claude_stream(full_system, message, history)
  end

  def self.recommend(requirements, inventory)
    system_prompt = File.read(Rails.root.join('prompts', 'recommend.md'))
    locations_json = LocationService.all.to_json
    user_message = "Requirements: #{requirements}\n\nAvailable locations:\n#{locations_json}\n\nCurrent inventory:\n#{inventory.to_json}"
    call_claude(system_prompt, user_message)
  end

  private

  def self.call_claude(system, user_message)
    # Use net/http or anthropic gem to call Claude API via Crusoe
    uri = URI(CRUSOE_URL)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true

    request = Net::HTTP::Post.new(uri)
    request['Content-Type'] = 'application/json'
    request['x-api-key'] = API_KEY
    request['anthropic-version'] = '2023-06-01'
    request.body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: system,
      messages: [{ role: 'user', content: user_message }]
    }.to_json

    response = http.request(request)
    JSON.parse(response.body)
  end

  def self.call_claude_stream(system, user_message, history)
    # Returns an Enumerator for SSE streaming
    # Implementation depends on whether using Crusoe or direct Anthropic
    # For hackathon: can start with non-streaming and add streaming later
    call_claude(system, user_message)
  end

  def self.build_scorecard_prompt(location, inventory)
    "Generate a feasibility scorecard for building a data center at:\n\n" \
    "Location: #{location.to_json}\n\n" \
    "User's existing inventory:\n#{inventory.to_json}"
  end

  def self.build_blueprint_prompt(location, scorecard, inventory)
    "Generate a detailed blueprint for building a data center at:\n\n" \
    "Location: #{location.to_json}\n\n" \
    "Scorecard: #{scorecard.to_json}\n\n" \
    "User's existing inventory:\n#{inventory.to_json}"
  end
end
```

**Step 2:** Create `app/controllers/api/reports_controller.rb`:

```ruby
module Api
  class ReportsController < ApplicationController
    def scorecard
      location = LocationService.find(params[:location_id])
      return render json: { error: 'Location not found' }, status: :not_found unless location

      inventory = Inventory.all.as_json
      result = ClaudeService.generate_scorecard(location, inventory)
      render json: result
    end

    def blueprint
      location = LocationService.find(params[:location_id])
      return render json: { error: 'Location not found' }, status: :not_found unless location

      inventory = Inventory.all.as_json
      scorecard = params[:scorecard] || {}
      result = ClaudeService.generate_blueprint(location, scorecard, inventory)
      render json: result
    end
  end
end
```

**Step 3:** Create `app/controllers/api/advisor_controller.rb`:

```ruby
module Api
  class AdvisorController < ApplicationController
    def chat
      inventory = Inventory.all.as_json
      result = ClaudeService.chat(params[:message], inventory, history: params[:history] || [])
      render json: result
    end

    def recommend
      inventory = Inventory.all.as_json
      result = ClaudeService.recommend(params[:requirements], inventory)
      render json: result
    end
  end
end
```

**Step 4:** Add routes:

```ruby
namespace :api do
  resources :locations, only: [:index, :show]
  resources :inventories, only: [:index, :create, :destroy]

  post 'reports/scorecard', to: 'reports#scorecard'
  post 'reports/blueprint', to: 'reports#blueprint'
  post 'advisor/chat', to: 'advisor#chat'
  post 'advisor/recommend', to: 'advisor#recommend'
end
```

**Step 5:** Test: `curl -X POST localhost:3000/api/reports/scorecard -d '{"location_id":"iceland-reykjavik"}'`

**Step 6:** Commit

---

### Task 3.5: Stripe Integration

**Step 1:** Create `app/controllers/api/payments_controller.rb`:

```ruby
module Api
  class PaymentsController < ApplicationController
    def checkout
      session = Stripe::Checkout::Session.create(
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: { name: "Orbital Atlas Blueprint: #{params[:location_name]}" },
            unit_amount: 4999  # €49.99 per blueprint
          },
          quantity: 1
        }],
        mode: 'payment',
        success_url: "#{params[:success_url]}?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: params[:cancel_url],
        metadata: { location_id: params[:location_id] }
      )
      render json: { checkout_url: session.url, session_id: session.id }
    end
  end
end
```

**Step 2:** Add route:

```ruby
post 'payments/checkout', to: 'payments#checkout'
```

**Step 3:** Test with Stripe test keys

**Step 4:** Commit

---

### Task 3.6: Portfolio Stats Endpoint

**Step 1:** Create `app/controllers/api/portfolio_controller.rb`:

```ruby
module Api
  class PortfolioController < ApplicationController
    def stats
      inventory = Inventory.all
      render json: {
        total_capacity_mw: inventory.sum(:capacity_mw),
        total_carbon_tons: inventory.sum(:carbon_footprint_tons),
        total_monthly_cost: inventory.sum(:monthly_cost),
        avg_utilization: inventory.average(:utilization_pct)&.round(1) || 0,
        site_count: inventory.count,
        bodies: inventory.map { |i| LocationService.find(i.location_id)&.dig(:body) }.compact.tally,
        coverage: calculate_coverage(inventory)
      }
    end

    private

    def calculate_coverage(inventory)
      regions = { eu: false, us: false, apac: false, latam: false }
      inventory.each do |item|
        loc = LocationService.find(item.location_id)
        next unless loc
        latency = loc[:latency_ms] || {}
        regions[:eu] = true if (latency[:eu] || 999) < 50
        regions[:us] = true if (latency[:us] || 999) < 50
        regions[:apac] = true if (latency[:apac] || 999) < 50
      end
      regions
    end
  end
end
```

**Step 2:** Add route: `get 'portfolio/stats', to: 'portfolio#stats'`

**Step 3:** Commit

---

### Task 3.7: Paid.ai Metering (Stretch)

**Step 1:** Add Paid.ai tracking to report generation

After every scorecard or blueprint generation, log usage to Paid:
- Event: "report_generated"
- Metadata: location_id, report_type (scorecard/blueprint), token_count

**Step 2:** Commit

---

## WORKSTREAM 4: Blockchain + Integrations — Person 4

### Task 4.1: Solana Setup

**Step 1:** Install Solana CLI tools + set up devnet wallet

```bash
# If on WSL or Linux
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
solana config set --url devnet
solana-keygen new --outfile ~/.config/solana/devnet-wallet.json
solana airdrop 2  # Get devnet SOL
```

**Step 2:** Decide on minting approach:
- **Option A (simple):** Store data as a Solana memo transaction (just a JSON string on-chain)
- **Option B (better):** Mint an NFT using Metaplex for each approved data center plan

For hackathon speed, **go with Option A** (memo) and upgrade to NFT if time permits.

**Step 3:** Commit setup scripts

---

### Task 4.2: Solana Mint Service (Backend)

**Step 1:** Create a small Node.js microservice or Ruby script that:

```javascript
// solana/mint.js (Node.js script called from Rails)
const { Connection, Keypair, Transaction, SystemProgram } = require('@solana/web3.js');

async function mintRecord(data) {
  const connection = new Connection(process.env.SOLANA_RPC_URL);
  const payer = Keypair.fromSecretKey(/* load from env */);

  // Create memo transaction with data center record
  const memo = JSON.stringify({
    type: 'orbital-atlas-dc-record',
    location_id: data.location_id,
    capacity_mw: data.capacity_mw,
    feasibility_grade: data.grade,
    timestamp: new Date().toISOString(),
    report_hash: data.report_hash  // SHA256 of the full report
  });

  // Use Memo program
  const transaction = new Transaction().add(
    // Memo instruction
    {
      keys: [],
      programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      data: Buffer.from(memo)
    }
  );

  const signature = await connection.sendTransaction(transaction, [payer]);
  await connection.confirmTransaction(signature);
  return signature;
}
```

**Step 2:** Create `app/controllers/api/solana_controller.rb` in Rails:

```ruby
module Api
  class SolanaController < ApplicationController
    def mint
      # Call Node.js script or use HTTP to a small Solana service
      result = `node #{Rails.root.join('solana', 'mint.js')} '#{params.to_json}'`
      parsed = JSON.parse(result)

      # Update inventory item with tx hash
      if params[:inventory_id]
        inventory = Inventory.find(params[:inventory_id])
        inventory.update(solana_tx_hash: parsed['signature'])
      end

      render json: { tx_hash: parsed['signature'], explorer_url: "https://explorer.solana.com/tx/#{parsed['signature']}?cluster=devnet" }
    end
  end
end
```

**Step 3:** Add route: `post 'solana/mint', to: 'solana#mint'`

**Step 4:** Test: mint a test record on devnet, verify on Solana Explorer

**Step 5:** Commit

---

### Task 4.3: Phantom Wallet Integration (Frontend)

**Step 1:** Help P1 add Phantom wallet connect button

```javascript
// Detect Phantom wallet
const getProvider = () => {
  if ('phantom' in window) {
    return window.phantom?.solana;
  }
  window.open('https://phantom.app/', '_blank');
};

// Connect wallet
const connectWallet = async () => {
  const provider = getProvider();
  const resp = await provider.connect();
  return resp.publicKey.toString();
};
```

**Step 2:** When user "approves" a site, their wallet signs the transaction (or backend signs with service wallet for demo simplicity)

**Step 3:** Show Solana Explorer link after successful mint

**Step 4:** Commit

---

### Task 4.4: Integration Testing

**Step 1:** Test full flow end-to-end:
1. Frontend loads locations from backend ✓
2. Click location → scorecard generated via Claude ✓
3. "Add to inventory" → saved in DB ✓
4. "Mint on Solana" → transaction on devnet ✓
5. "Full Blueprint" → Stripe checkout → report generated ✓
6. Chat advisor → streaming response ✓
7. Recommendations → based on inventory gaps ✓

**Step 2:** Fix any integration issues

**Step 3:** Commit fixes

---

### Task 4.5: Help Other Workstreams

After Solana is done, P4 helps wherever needed most:
- Help P1 wire frontend to backend APIs
- Help P3 debug Rails issues
- Help P2 test Claude prompt quality
- Set up deployment (Fly.io / Railway for Rails, Vercel/Netlify for frontend)

---

## Integration Checkpoints

### Checkpoint 1 (Hour 8): "Does it connect?"
- [ ] Frontend shows 3D globe with markers (P1)
- [ ] Backend serves location data (P3)
- [ ] Frontend fetches locations from backend
- [ ] At least 10 locations in dataset (P2)

### Checkpoint 2 (Hour 16): "Does it think?"
- [ ] Click location → Claude generates scorecard (P2 + P3)
- [ ] Scorecard displays in frontend panel (P1)
- [ ] Inventory CRUD works (P1 + P3)
- [ ] Solana mint works on devnet (P4)

### Checkpoint 3 (Hour 24): "Is it demo-ready?"
- [ ] Chat advisor works (P2 + P3 + P1)
- [ ] Stripe checkout flow works (P3 + P1)
- [ ] Moon/Mars locations show (P1 + P2)
- [ ] Demo inventory pre-seeded (P2)

### Checkpoint 4 (Hour 36): "Is it polished?"
- [ ] Full demo script rehearsed
- [ ] Landing page done (P1)
- [ ] Edge cases handled (loading states, errors)
- [ ] Portfolio stats dashboard works

### Checkpoint 5 (Hour 44): "Ship it"
- [ ] Deployed and accessible via URL
- [ ] Demo recorded as backup
- [ ] Submission form filled out

---

## Quick Reference: Who Needs What From Whom

```
P2 (Data) ──JSON files──> P3 (Backend) ──API──> P1 (Frontend)
                               │
P2 (Prompts) ─────────────────┘
                               │
P4 (Solana) ──service──> P3 (Backend) ──API──> P1 (Frontend)
```

- **P1 needs from P3:** API running with CORS enabled (hour 2)
- **P3 needs from P2:** Location JSON files (hour 4) + Claude prompts (hour 6)
- **P3 needs from P4:** Solana mint endpoint (hour 10)
- **P1 needs from P4:** Wallet connect code snippet (hour 12)
- **Everyone:** Agree on API contract before starting (hour 0)
