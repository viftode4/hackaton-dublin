# Orbital Atlas — Backend Implementation Plan

**Role:** Person 3 (Backend Engineer)  
**Tech Stack:** Ruby on Rails 7, PostgreSQL, Claude API (via Anthropic), Stripe, Solana web3, Paid.ai  
**Duration:** 48 hours (hackathon)  
**Goal:** Build REST API that powers frontend and integrates AI, payments, blockchain

---

## Project Structure

```
orbital-atlas-api/
├── app/
│   ├── controllers/
│   │   └── api/
│   │       ├── locations_controller.rb
│   │       ├── inventories_controller.rb
│   │       ├── reports_controller.rb
│   │       ├── advisor_controller.rb
│   │       ├── payments_controller.rb
│   │       ├── portfolio_controller.rb
│   │       └── solana_controller.rb
│   ├── models/
│   │   └── inventory.rb
│   └── services/
│       ├── location_service.rb
│       ├── claude_service.rb
│       └── solana_service.rb (optional)
│
├── config/
│   ├── routes.rb (updated)
│   ├── initializers/
│   │   ├── cors.rb (new)
│   │   └── anthropic.rb (new)
│   └── database.yml
│
├── db/
│   ├── migrate/
│   │   └── XXXXXX_create_inventories.rb
│   └── seeds.rb
│
├── data/
│   ├── locations/
│   │   ├── earth.json (from P2)
│   │   ├── moon.json (from P2)
│   │   ├── mars.json (from P2)
│   │   └── orbit.json (from P2)
│   └── demo-inventory.json (from P2)
│
├── prompts/
│   ├── scorecard.md (from P2)
│   ├── blueprint.md (from P2)
│   ├── advisor.md (from P2)
│   └── recommend.md (from P2)
│
├── spec/ (optional, low priority)
│
├── .env (local, not committed)
├── .env.example
├── Gemfile
├── Gemfile.lock
├── README.md
└── config.ru
```

---

## Phase 1: Foundation & Setup (Hours 0-4)

### Task 1.1: Create Rails API Scaffold

**Time:** 30 minutes  
**Steps:**

```bash
# 1. Create new Rails app (no Webpack, no JavaScript assets, API-only)
rails new orbital-atlas-api \
  --api \
  --database=postgresql \
  -T \
  --skip-bundle

cd orbital-atlas-api

# 2. Add to Gemfile (paste below)
```

**Gemfile additions:**

```ruby
# In the main Gemfile, ensure these gems are present:

# CORS support
gem 'rack-cors'

# Claude AI via Anthropic SDK
gem 'anthropic-sdk', '~> 0.7'  # or use net/http + json (no external gem)

# Stripe for payments
gem 'stripe'

# Environment variables
gem 'dotenv-rails', groups: [:development, :test]

# Optional: Better JSON serialization
gem 'active_model_serializers'

# Optional: Request logging
gem 'rails_semantic_logger'

# Development/Testing
group :development, :test do
  gem 'pry-rails'
  gem 'rspec-rails'
end
```

```bash
# 3. Install gems
bundle install

# 4. Create database
rails db:create

# 5. Commit
git add .
git commit -m "chore: scaffold Rails API project"
```

**Outputs:**
- ✓ Rails app running on `localhost:3000`
- ✓ `/api` namespace ready for routes

---

### Task 1.2: Configure CORS & Environment

**Time:** 20 minutes

**File 1:** `config/initializers/cors.rb` (create new)

```ruby
# Allow requests from frontend (Lovable) and local dev
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins '*'  # For hackathon (LOCK DOWN for production)
    resource '*', 
      headers: :any, 
      methods: [:get, :post, :put, :patch, :delete, :options, :head]
  end
end
```

**File 2:** `.env.example` (create new)

```
# API Keys
CLAUDE_API_KEY=sk-ant-YOUR_KEY_HERE
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE
SOLANA_RPC_URL=https://api.devnet.solana.com
PAID_API_KEY=YOUR_PAID_KEY_HERE

# Database
DATABASE_URL=postgres://user:password@localhost/orbital_atlas_api_development

# Environment
RAILS_ENV=development
RACK_ENV=development

# Frontend (for Stripe redirect)
FRONTEND_URL=http://localhost:3000
```

**File 3:** `.env` (create, add to .gitignore)

```
CLAUDE_API_KEY=sk-ant-YOUR_KEY_HERE
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
SOLANA_RPC_URL=https://api.devnet.solana.com
FRONTEND_URL=http://localhost:5173
```

**File 4:** Update `config/initializers/anthropic.rb` (create new)

```ruby
if ENV['CLAUDE_API_KEY'].present?
  Anthropic.configure do |config|
    config.access_token = ENV['CLAUDE_API_KEY']
  end
end
```

```bash
# Commit
git add .
git commit -m "chore: configure CORS and environment variables"
```

**Outputs:**
- ✓ CORS middleware active
- ✓ `.env` setup for local development
- ✓ API ready to accept cross-origin requests

---

### Task 1.3: Build LocationService (Static Data Loader)

**Time:** 25 minutes

**File:** `app/services/location_service.rb` (create new)

```ruby
# frozen_string_literal: true

class LocationService
  LOCATIONS_DIR = Rails.root.join('data', 'locations')

  class << self
    # Load all locations from JSON files
    def all
      @all ||= Dir.glob(LOCATIONS_DIR.join('*.json'))
                    .sort
                    .flat_map { |file| load_locations_from_file(file) }
    end

    # Find a single location by ID
    def find(id)
      all.find { |loc| loc[:id].to_s == id.to_s }
    end

    # Filter locations by celestial body
    def by_body(body)
      all.select { |loc| loc[:body].to_s.downcase == body.to_s.downcase }
    end

    # Get locations by workload type
    def by_workload(workload_type)
      all.select do |loc|
        loc.dig(:special_factors, []).any? do |factor|
          factor.downcase.include?(workload_type.downcase)
        end
      end
    end

    # Search locations by name
    def search(query)
      q = query.downcase
      all.select do |loc|
        loc[:name].downcase.include?(q) ||
          loc[:id].downcase.include?(q) ||
          loc[:regulatory]&.downcase&.include?(q)
      end
    end

    private

    def load_locations_from_file(file)
      content = File.read(file)
      data = JSON.parse(content, symbolize_names: true)
      Array(data)  # Ensure it's an array, even if single location
    rescue JSON::ParserError => e
      Rails.logger.error("Error parsing #{file}: #{e.message}")
      []
    end
  end
end
```

**Outputs:**
- ✓ Service loads JSON files dynamically
- ✓ Multiple query methods (find, filter, search)
- ✓ Error handling for malformed JSON
- ✓ Ready to work before P2 delivers JSON (can fake data)

---

### Task 1.4: Create Locations API Endpoints

**Time:** 20 minutes

**File 1:** `app/controllers/api/locations_controller.rb` (create new)

```ruby
# frozen_string_literal: true

module Api
  class LocationsController < ApplicationController
    # GET /api/locations
    # GET /api/locations?body=earth
    # GET /api/locations?search=iceland
    def index
      @locations = LocationService.all

      if params[:body].present?
        @locations = LocationService.by_body(params[:body])
      elsif params[:search].present?
        @locations = LocationService.search(params[:search])
      end

      render json: @locations
    end

    # GET /api/locations/:id
    def show
      @location = LocationService.find(params[:id])

      if @location.present?
        render json: @location
      else
        render json: { error: "Location '#{params[:id]}' not found" }, status: :not_found
      end
    end
  end
end
```

**File 2:** Update `config/routes.rb`

```ruby
Rails.application.routes.draw do
  namespace :api do
    resources :locations, only: [:index, :show]
  end

  # For health checks
  get 'health', to: proc { [200, {}, ['OK']] }
end
```

**Test the endpoint manually:**

```bash
# Terminal 1: Start Rails
rails s

# Terminal 2: Test
curl http://localhost:3000/api/locations
curl http://localhost:3000/api/locations?body=earth
curl http://localhost:3000/api/locations/iceland-reykjavik
```

```bash
# Commit
git add .
git commit -m "feat: add LocationService and Locations API endpoints"
```

**Outputs:**
- ✓ `/api/locations` returns all locations
- ✓ Filtering by `body` parameter works
- ✓ Individual location detail view works
- ✓ 404 errors handled gracefully

---

### Task 1.5: Create Mock Location Data (Until P2 Delivers)

**Time:** 15 minutes

**File:** `data/locations/earth.json` (temporary mock)

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
  },
  {
    "id": "ashburn-virginia",
    "name": "Ashburn, Virginia",
    "body": "earth",
    "coordinates": { "lat": 39.04, "lng": -77.53 },
    "energy_cost_kwh": 0.08,
    "energy_sources": ["grid (mixed)"],
    "carbon_intensity_gco2": 280,
    "avg_temperature_c": 12,
    "cooling_method": "mechanical",
    "cooling_cost_factor": 0.6,
    "land_cost_sqm": 800,
    "construction_cost_mw": 12000000,
    "latency_ms": { "eu": 80, "us": 5, "apac": 150 },
    "disaster_risk": 40,
    "political_stability": 98,
    "regulatory": "US, well-established data center policies",
    "connectivity": ["Multiple Tier-1 ISPs", "Equinix backbone"],
    "special_factors": ["Hyperscaler hub", "abundant real estate", "mature market"]
  },
  {
    "id": "moon-shackleton",
    "name": "Shackleton Crater Rim, Moon",
    "body": "moon",
    "coordinates": { "lat": -89.9, "lng": 0 },
    "energy_cost_kwh": 5000,
    "energy_sources": ["solar", "nuclear (future)"],
    "carbon_intensity_gco2": 0,
    "avg_temperature_c": -50,
    "cooling_method": "passive radiative",
    "cooling_cost_factor": 0,
    "land_cost_sqm": 0,
    "construction_cost_mw": 500000000,
    "latency_ms": { "earth": 1300 },
    "disaster_risk": 15,
    "political_stability": 90,
    "regulatory": "Outer Space Treaty, international cooperation",
    "connectivity": ["Earth relay satellite"],
    "special_factors": ["Near-permanent sunlight", "extreme cold", "remote", "R&D only"]
  }
]
```

```bash
# Create empty directories for other bodies
mkdir -p data/locations
touch data/locations/moon.json data/locations/mars.json data/locations/orbit.json

# Test endpoint
curl http://localhost:3000/api/locations | jq

# Commit
git add data/
git commit -m "refactor: add mock location data for development"
```

**Outputs:**
- ✓ API returns realistic data
- ✓ Can test frontend immediately
- ✓ Ready to swap with P2's real data seamlessly

---

## Phase 1 Checkpoint ✓ (Hour 4)

**Verification:**
- [ ] Rails server runs without errors
- [ ] `curl http://localhost:3000/api/locations` returns JSON
- [ ] CORS headers present on response
- [ ] `.env` configured locally
- [ ] Git repository clean with initial commits

**If blocked:** Reach out to P1 (frontend) to confirm they can fetch data.

---

## Phase 2: Core Data Model (Hours 4-8)

### Task 2.1: Generate Inventory Model

**Time:** 15 minutes

```bash
# Generate model with all fields
rails generate model Inventory \
  location_id:string \
  name:string \
  capacity_mw:float \
  workload_types:text \
  utilization_pct:float \
  carbon_footprint_tons:float \
  power_source:string \
  solana_tx_hash:string \
  monthly_cost:float \
  --migration

# This creates:
# - app/models/inventory.rb
# - db/migrate/XXXXX_create_inventories.rb
```

**File:** `app/models/inventory.rb` (update generated file)

```ruby
# frozen_string_literal: true

class Inventory < ApplicationRecord
  # Validations
  validates :location_id, :name, :capacity_mw, presence: true
  validates :capacity_mw, :utilization_pct, :monthly_cost, numericality: { greater_than: 0 }
  validates :workload_types, presence: true, if: :workload_types_required?

  # Associations (optional, for future joins)
  has_one :location, foreign_key: 'id', primary_key: 'location_id'

  # Store workload_types as array in text column
  before_save :serialize_workload_types
  after_initialize :deserialize_workload_types

  # Scopes
  scope :by_body, ->(body) {
    joins("LEFT JOIN #{location_ids} ON inventories.location_id = locations.id")
      .where(locations: { body: body })
  }

  scope :low_carbon, -> { where('carbon_footprint_tons < 10000') }

  private

  def serialize_workload_types
    self.workload_types = Array(workload_types).to_json if workload_types.is_a?(Array)
  end

  def deserialize_workload_types
    if workload_types.is_a?(String) && workload_types.start_with?('[')
      self.workload_types = JSON.parse(workload_types)
    end
  end

  def workload_types_required?
    true  # Always require at least one workload type
  end
end
```

**File:** `db/migrate/XXXXX_create_inventories.rb` (verify/update)

```ruby
class CreateInventories < ActiveRecord::Migration[7.0]
  def change
    create_table :inventories do |t|
      t.string :location_id, null: false
      t.string :name, null: false
      t.float :capacity_mw, null: false
      t.text :workload_types, default: '[]'
      t.float :utilization_pct, default: 0
      t.float :carbon_footprint_tons, default: 0
      t.string :power_source
      t.string :solana_tx_hash
      t.float :monthly_cost, null: false

      t.timestamps
    end

    add_index :inventories, :location_id
    add_index :inventories, :solana_tx_hash, unique: true
  end
end
```

```bash
# Run migration
rails db:migrate

# Commit
git add .
git commit -m "feat: add Inventory model and database migration"
```

**Outputs:**
- ✓ `inventories` table created
- ✓ Model with validations & scopes
- ✓ Ready for CRUD operations

---

### Task 2.2: Create Inventory API Controllers & Routes

**Time:** 25 minutes

**File 1:** `app/controllers/api/inventories_controller.rb` (create new)

```ruby
# frozen_string_literal: true

module Api
  class InventoriesController < ApplicationController
    before_action :set_inventory, only: [:show, :update, :destroy]

    # GET /api/inventories
    def index
      @inventories = Inventory.all
      @inventories = @inventories.by_body(params[:body]) if params[:body].present?
      
      render json: @inventories, include: [:location_details]
    end

    # GET /api/inventories/:id
    def show
      render json: @inventory
    end

    # POST /api/inventories
    def create
      @inventory = Inventory.new(inventory_params)

      if @inventory.save
        render json: @inventory, status: :created, location: api_inventory_url(@inventory)
      else
        render json: { errors: @inventory.errors.full_messages }, status: :unprocessable_entity
      end
    end

    # PATCH /api/inventories/:id
    def update
      if @inventory.update(inventory_params)
        render json: @inventory
      else
        render json: { errors: @inventory.errors.full_messages }, status: :unprocessable_entity
      end
    end

    # DELETE /api/inventories/:id
    def destroy
      @inventory.destroy
      head :no_content
    end

    private

    def set_inventory
      @inventory = Inventory.find(params[:id])
    rescue ActiveRecord::RecordNotFound
      render json: { error: 'Inventory item not found' }, status: :not_found
    end

    def inventory_params
      params.require(:inventory).permit(
        :location_id, :name, :capacity_mw, :utilization_pct,
        :carbon_footprint_tons, :power_source, :monthly_cost, :solana_tx_hash,
        workload_types: []
      )
    end
  end
end
```

**File 2:** Update `config/routes.rb`

```ruby
Rails.application.routes.draw do
  namespace :api do
    resources :locations, only: [:index, :show]
    resources :inventories, only: [:index, :show, :create, :update, :destroy]
  end

  get 'health', to: proc { [200, {}, ['OK']] }
end
```

**Test manually:**

```bash
# Start server
rails s

# In another terminal:

# Create inventory item
curl -X POST http://localhost:3000/api/inventories \
  -H "Content-Type: application/json" \
  -d '{
    "inventory": {
      "location_id": "iceland-reykjavik",
      "name": "AcmeCorp Iceland DC-1",
      "capacity_mw": 50,
      "workload_types": ["AI training", "batch processing"],
      "utilization_pct": 72,
      "carbon_footprint_tons": 120,
      "power_source": "geothermal",
      "monthly_cost": 450000
    }
  }'

# Get all inventories
curl http://localhost:3000/api/inventories

# Get one
curl http://localhost:3000/api/inventories/1

# Delete
curl -X DELETE http://localhost:3000/api/inventories/1
```

```bash
# Commit
git add .
git commit -m "feat: add Inventory API (CRUD endpoints)"
```

**Outputs:**
- ✓ Full CRUD for inventory items
- ✓ Validations prevent bad data
- ✓ Ready for frontend integration

---

### Task 2.3: Seed Demo Inventory

**Time:** 10 minutes

**File:** `data/demo-inventory.json` (create)

This should come from P2, but here's a template:

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
    "workload_types": ["AI training", "batch processing"],
    "utilization_pct": 65,
    "carbon_footprint_tons": 120,
    "power_source": "geothermal",
    "monthly_cost": 450000
  }
]
```

**File:** `db/seeds.rb` (create/update)

```ruby
# frozen_string_literal: true

# Load demo inventory from JSON file
demo_file = Rails.root.join('data', 'demo-inventory.json')

if File.exist?(demo_file)
  demo_data = JSON.parse(File.read(demo_file), symbolize_names: true)
  
  # Clear existing data (optional)
  # Inventory.delete_all

  demo_data.each do |item|
    Inventory.create!(item)
    puts "✓ Created: #{item[:name]}"
  end
  
  puts "\n✓ Seeded #{Inventory.count} inventory items"
else
  puts "⚠ Demo inventory file not found at #{demo_file}"
end
```

```bash
# Run seed
rails db:seed

# Verify
rails c
> Inventory.count
# => 2 (or however many you seeded)

# Exit
> exit

# Commit
git add .
git commit -m "refactor: add demo inventory seed data"
```

**Outputs:**
- ✓ Database pre-loaded with 5 sample data centers
- ✓ Frontend can immediately display realistic data
- ✓ Seed file updates when P2 provides real data

---

## Phase 2 Checkpoint ✓ (Hour 8)

**Verification:**
- [ ] `Inventory` model created with all fields
- [ ] CRUD API working (test all 4 verbs)
- [ ] Demo data seeded successfully
- [ ] `/api/inventories` returns array of objects
- [ ] P1 (frontend) can fetch both locations and inventory

**If blocked:** Check database connection, verify migrations ran.

---

## Phase 3: AI Intelligence (Hours 8-20)

### Task 3.1: Build ClaudeService — Scorecard

**Time:** 35 minutes

**File:** `app/services/claude_service.rb` (create new)

```ruby
# frozen_string_literal: true

class ClaudeService
  # Configuration
  API_VERSION = '2023-06-01'
  MODEL = 'claude-3-5-sonnet-20241022'
  MAX_TOKENS = 4096

  class << self
    # Generate scorecard for a location
    def generate_scorecard(location, inventory = [])
      system_prompt = load_prompt('scorecard')
      user_message = build_scorecard_message(location, inventory)
      
      response = call_claude(system_prompt, user_message)
      parse_json_response(response)
    rescue StandardError => e
      Rails.logger.error("Claude scorecard error: #{e.message}")
      error_response("Failed to generate scorecard: #{e.message}")
    end

    # Generate detailed blueprint
    def generate_blueprint(location, scorecard = {}, inventory = [])
      system_prompt = load_prompt('blueprint')
      user_message = build_blueprint_message(location, scorecard, inventory)
      
      response = call_claude(system_prompt, user_message)
      parse_json_response(response)
    rescue StandardError => e
      Rails.logger.error("Claude blueprint error: #{e.message}")
      error_response("Failed to generate blueprint: #{e.message}")
    end

    # Chat with AI advisor
    def chat(message, inventory = [], history = [])
      system_prompt = build_advisor_system_prompt(inventory)
      
      messages = history.map { |h| { role: h['role'], content: h['content'] } }
      messages << { role: 'user', content: message }
      
      response = call_claude_with_messages(system_prompt, messages)
      response.dig('content', 0, 'text') || "I couldn't generate a response."
    rescue StandardError => e
      Rails.logger.error("Claude chat error: #{e.message}")
      "Sorry, I encountered an error: #{e.message}"
    end

    # Get recommendations based on requirements
    def recommend(requirements, inventory = [])
      system_prompt = load_prompt('recommend')
      locations = LocationService.all
      
      user_message = <<~TEXT
        Requirements: #{requirements}
        
        Available locations:
        #{locations.to_json}
        
        Current inventory:
        #{inventory.to_json}
      TEXT
      
      response = call_claude(system_prompt, user_message)
      parse_json_response(response)
    rescue StandardError => e
      Rails.logger.error("Claude recommend error: #{e.message}")
      error_response("Failed to generate recommendations: #{e.message}")
    end

    private

    # Load prompt template from file
    def load_prompt(name)
      path = Rails.root.join('prompts', "#{name}.md")
      if File.exist?(path)
        File.read(path)
      else
        Rails.logger.warn("Prompt file not found: #{path}, using default")
        default_prompt(name)
      end
    end

    # Build message for scorecard generation
    def build_scorecard_message(location, inventory)
      <<~TEXT
        ## Location Data
        ```json
        #{location.to_json}
        ```
        
        ## Current Inventory (Portfolio Context)
        ```json
        #{inventory.to_json}
        ```
        
        Please generate a feasibility scorecard for this location.
      TEXT
    end

    # Build message for blueprint generation
    def build_blueprint_message(location, scorecard, inventory)
      <<~TEXT
        ## Location Data
        ```json
        #{location.to_json}
        ```
        
        ## Scorecard
        ```json
        #{scorecard.to_json}
        ```
        
        ## Current Inventory
        ```json
        #{inventory.to_json}
        ```
        
        Please generate a detailed feasibility blueprint for building a data center here.
      TEXT
    end

    # Build system prompt for advisor with context
    def build_advisor_system_prompt(inventory)
      locations = LocationService.all
      locations_list = locations.map { |l| "#{l[:name]} (#{l[:body]}): #{l[:id]}" }.join("\n")
      
      base_prompt = load_prompt('advisor')
      
      <<~TEXT
        #{base_prompt}
        
        ## Available Locations
        #{locations_list}
        
        ## User's Current Portfolio
        ```json
        #{inventory.to_json}
        ```
      TEXT
    end

    # Call Claude API with system + user message
    def call_claude(system_prompt, user_message)
      client = Anthropic::Client.new(api_key: ENV['CLAUDE_API_KEY'])
      
      client.messages(
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: system_prompt,
        messages: [
          { role: 'user', content: user_message }
        ]
      )
    end

    # Call Claude with full message history
    def call_claude_with_messages(system_prompt, messages)
      client = Anthropic::Client.new(api_key: ENV['CLAUDE_API_KEY'])
      
      client.messages(
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: system_prompt,
        messages: messages
      )
    end

    # Parse JSON from Claude response (may be wrapped in markdown code blocks)
    def parse_json_response(response)
      text = response.dig('content', 0, 'text') || ''
      
      # Try to extract JSON from markdown code blocks
      if text.include?('```json')
        json_match = text.match(/```json\n(.*?)\n```/m)
        text = json_match[1] if json_match
      elsif text.include?('```')
        json_match = text.match(/```\n(.*?)\n```/m)
        text = json_match[1] if json_match
      end
      
      JSON.parse(text)
    rescue JSON::ParserError => e
      Rails.logger.warn("Response was not valid JSON: #{e.message}")
      { 'raw_response' => text }
    end

    # Build default prompt if file not found
    def default_prompt(name)
      case name
      when 'scorecard'
        "You are a data center infrastructure expert. Generate a JSON scorecard with scores for cost, power, cooling, latency, carbon, and risk (0-100 each)."
      when 'blueprint'
        "You are a data center infrastructure expert. Generate a detailed JSON blueprint for building a data center."
      when 'advisor'
        "You are an expert data center consultant. Help users plan their global data center portfolio."
      when 'recommend'
        "You are a data center planning expert. Recommend the best locations from the available options."
      else
        "You are a helpful assistant."
      end
    end

    # Format error response
    def error_response(message)
      { 'error' => message }
    end
  end
end
```

**Add to Gemfile:**

```ruby
gem 'anthropic-sdk', '~> 0.7'
# OR if using net/http manually:
# (no extra gem needed, just use net/http + json)
```

```bash
bundle install

# Commit
git add .
git commit -m "feat: add ClaudeService for scorecard/blueprint/chat generation"
```

**Outputs:**
- ✓ Service encapsulates all Claude API calls
- ✓ Handles errors gracefully
- ✓ Parses JSON responses even if wrapped in markdown
- ✓ Loads prompts from files dynamically

---

### Task 3.2: Create Reports Controller

**Time:** 20 minutes

**File:** `app/controllers/api/reports_controller.rb` (create new)

```ruby
# frozen_string_literal: true

module Api
  class ReportsController < ApplicationController
    # POST /api/reports/scorecard
    def scorecard
      location = LocationService.find(params[:location_id])
      
      unless location
        return render json: { error: "Location not found: #{params[:location_id]}" }, 
                      status: :not_found
      end

      inventory = Inventory.all.as_json
      result = ClaudeService.generate_scorecard(location, inventory)
      
      render json: result
    end

    # POST /api/reports/blueprint
    def blueprint
      location = LocationService.find(params[:location_id])
      
      unless location
        return render json: { error: "Location not found: #{params[:location_id]}" }, 
                      status: :not_found
      end

      inventory = Inventory.all.as_json
      scorecard = params[:scorecard] || {}
      
      result = ClaudeService.generate_blueprint(location, scorecard, inventory)
      
      render json: result
    end
  end
end
```

**File:** Update `config/routes.rb`

```ruby
Rails.application.routes.draw do
  namespace :api do
    resources :locations, only: [:index, :show]
    resources :inventories, only: [:index, :show, :create, :update, :destroy]
    
    # Reports
    post 'reports/scorecard', to: 'reports#scorecard'
    post 'reports/blueprint', to: 'reports#blueprint'
  end

  get 'health', to: proc { [200, {}, ['OK']] }
end
```

**Test:**

```bash
# Make sure you have CLAUDE_API_KEY in .env
curl -X POST http://localhost:3000/api/reports/scorecard \
  -H "Content-Type: application/json" \
  -d '{"location_id": "iceland-reykjavik"}' | jq
```

```bash
# Commit
git add .
git commit -m "feat: add Reports controller for scorecard/blueprint generation"
```

**Outputs:**
- ✓ Endpoints callable from frontend
- ✓ Claude responses returned as JSON
- ✓ Error handling for missing locations

---

### Task 3.3: Create Advisor Controller

**Time:** 20 minutes

**File:** `app/controllers/api/advisor_controller.rb` (create new)

```ruby
# frozen_string_literal: true

module Api
  class AdvisorController < ApplicationController
    # POST /api/advisor/chat
    def chat
      unless params[:message].present?
        return render json: { error: 'message parameter required' }, status: :bad_request
      end

      inventory = Inventory.all.as_json
      history = params[:history] || []
      
      result = ClaudeService.chat(params[:message], inventory, history: history)
      
      render json: { 
        message: result,
        role: 'assistant'
      }
    end

    # POST /api/advisor/recommend
    def recommend
      unless params[:requirements].present?
        return render json: { error: 'requirements parameter required' }, status: :bad_request
      end

      inventory = Inventory.all.as_json
      result = ClaudeService.recommend(params[:requirements], inventory)
      
      render json: result
    end
  end
end
```

**File:** Update `config/routes.rb`

```ruby
Rails.application.routes.draw do
  namespace :api do
    resources :locations, only: [:index, :show]
    resources :inventories, only: [:index, :show, :create, :update, :destroy]
    
    post 'reports/scorecard', to: 'reports#scorecard'
    post 'reports/blueprint', to: 'reports#blueprint'
    
    post 'advisor/chat', to: 'advisor#chat'
    post 'advisor/recommend', to: 'advisor#recommend'
  end

  get 'health', to: proc { [200, {}, ['OK']] }
end
```

**Test:**

```bash
curl -X POST http://localhost:3000/api/advisor/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What location should I expand to?",
    "history": []
  }' | jq
```

```bash
# Commit
git add .
git commit -m "feat: add Advisor controller for chat and recommendations"
```

**Outputs:**
- ✓ Chat endpoint accepts messages + history
- ✓ Recommendation endpoint analyzes portfolio
- ✓ Both call Claude with full context

---

### Task 3.4: Create Prompt Templates

**Time:** 30 minutes (wait for P2 to provide these)

Create placeholder files in `prompts/` directory:

**File 1:** `prompts/scorecard.md`

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
  "portfolio_impact": "Description of how this affects existing portfolio"
}

## Scoring Guidelines
- cost: 100 = cheapest, 0 = prohibitively expensive
- power: 100 = abundant & cheap, 0 = scarce
- cooling: 100 = natural cooling, 0 = extreme requirements
- latency: 100 = <10ms to major markets, 0 = >1s
- carbon: 100 = zero carbon, 0 = 100% fossil
- risk: 100 = minimal risk, 0 = extreme risk
```

**File 2:** `prompts/blueprint.md`

```markdown
You are Orbital Atlas, an expert data center infrastructure consultant.

Generate a comprehensive feasibility blueprint as valid JSON.

## Output Format
{
  "construction_plan": {
    "phases": [
      {
        "name": "Phase 1: Name",
        "duration_months": 6,
        "cost": "$150M",
        "description": "Details here"
      }
    ],
    "total_duration_months": 24,
    "total_cost": "$450M"
  },
  "power_strategy": {
    "primary": "geothermal",
    "backup": "grid",
    "capacity_mw": 100,
    "renewable_pct": 95,
    "annual_cost": "$10M"
  },
  "cooling_design": {
    "method": "ambient + mechanical",
    "pue_target": 1.1,
    "annual_cost": "$2M"
  },
  "network_topology": {
    "connections": ["Cable 1", "Cable 2"],
    "latency_targets": {"eu": 30, "us": 80},
    "redundancy": "N+2"
  }
}
```

**File 3:** `prompts/advisor.md`

```markdown
You are Orbital Atlas, an AI data center infrastructure advisor.

You help users plan their global (and space-based) data center portfolio. You have access to real energy prices, climate data, and connectivity information.

When discussing locations, reference the data. When recommending sites, analyze portfolio gaps. Be concise but insightful—think like a senior infrastructure consultant.

For Moon/Mars, be analytically grounded. These are speculative but based on NASA/ESA research. Discuss real challenges (radiation, transport, latency) alongside benefits.
```

**File 4:** `prompts/recommend.md`

```markdown
You are an expert data center location analyst.

Analyze the user's requirements and portfolio, then recommend top 3 locations from the available dataset.

Output as JSON:
{
  "recommendations": [
    {
      "location_id": "...",
      "rank": 1,
      "match_score": 95,
      "reasoning": "Why this is best",
      "tradeoffs": "What you sacrifice"
    }
  ]
}
```

```bash
# Create directory and files
mkdir -p prompts
touch prompts/{scorecard,blueprint,advisor,recommend}.md

# Commit
git add prompts/
git commit -m "docs: add Claude prompt templates (placeholder)"
```

**Outputs:**
- ✓ Prompt structure established
- ✓ P2 can update files directly
- ✓ Service loads them automatically

---

## Phase 3 Checkpoint ✓ (Hour 16)

**Verification:**
- [ ] ClaudeService defined and callable
- [ ] `POST /api/reports/scorecard` returns JSON scorecard
- [ ] `POST /api/advisor/chat` returns text response
- [ ] Prompts loaded from files without errors
- [ ] CLAUDE_API_KEY configured in `.env`
- [ ] P1 (frontend) can display Claude responses

**If blocked:**
- Verify API key is valid
- Check anthropic-sdk installed correctly
- Test directly: `ClaudeService.generate_scorecard(location, [])`

---

## Phase 4: Integrations & Polish (Hours 20-40)

### Task 4.1: Stripe Payment Integration

**Time:** 25 minutes

**File:** `app/controllers/api/payments_controller.rb` (create new)

```ruby
# frozen_string_literal: true

module Api
  class PaymentsController < ApplicationController
    # POST /api/payments/checkout
    def checkout
      unless params[:location_id].present? && params[:location_name].present?
        return render json: { 
          error: 'location_id and location_name required' 
        }, status: :bad_request
      end

      session = Stripe::Checkout::Session.create(
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: "Orbital Atlas Blueprint: #{params[:location_name]}"
            },
            unit_amount: 4999  # €49.99
          },
          quantity: 1
        }],
        mode: 'payment',
        success_url: "#{params[:success_url]}?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: params[:cancel_url],
        metadata: {
          location_id: params[:location_id]
        }
      )

      render json: {
        checkout_url: session.url,
        session_id: session.id
      }
    rescue Stripe::InvalidRequestError => e
      render json: { error: e.message }, status: :bad_request
    rescue StandardError => e
      render json: { error: "Payment error: #{e.message}" }, status: :internal_server_error
    end

    # GET /api/payments/session/:session_id
    def session_status
      session = Stripe::Checkout::Session.retrieve(params[:session_id])
      
      render json: {
        status: session.payment_status,
        customer_email: session.customer_details&.email,
        location_id: session.metadata&.fetch('location_id')
      }
    rescue Stripe::InvalidRequestError => e
      render json: { error: e.message }, status: :not_found
    end
  end
end
```

**File:** Update `config/routes.rb`

```ruby
namespace :api do
  # ... existing routes ...
  
  post 'payments/checkout', to: 'payments#checkout'
  get 'payments/session/:session_id', to: 'payments#session_status'
end
```

**Add to `.env`:**

```
STRIPE_SECRET_KEY=sk_test_YOUR_TEST_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE
```

**Test:**

```bash
curl -X POST http://localhost:3000/api/payments/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "location_id": "iceland-reykjavik",
    "location_name": "Reykjavik, Iceland",
    "success_url": "http://localhost:5173/success",
    "cancel_url": "http://localhost:5173/cancel"
  }' | jq
```

```bash
# Commit
git add .
git commit -m "feat: add Stripe payment integration"
```

**Outputs:**
- ✓ Frontend can initiate checkout
- ✓ Redirects to Stripe payment page
- ✓ Can verify payment status

---

### Task 4.2: Portfolio Stats Endpoint

**Time:** 20 minutes

**File:** `app/controllers/api/portfolio_controller.rb` (create new)

```ruby
# frozen_string_literal: true

module Api
  class PortfolioController < ApplicationController
    # GET /api/portfolio/stats
    def stats
      inventory = Inventory.all
      
      stats = {
        total_capacity_mw: inventory.sum(:capacity_mw),
        total_carbon_tons: inventory.sum(:carbon_footprint_tons),
        total_monthly_cost: inventory.sum(:monthly_cost),
        avg_utilization_pct: (inventory.average(:utilization_pct) || 0).round(1),
        site_count: inventory.count,
        bodies: calculate_body_distribution(inventory),
        coverage: calculate_regional_coverage(inventory),
        efficiency_metrics: calculate_efficiency(inventory)
      }
      
      render json: stats
    end

    private

    def calculate_body_distribution(inventory)
      bodies = {}
      inventory.each do |item|
        loc = LocationService.find(item.location_id)
        next unless loc
        body = loc[:body] || 'unknown'
        bodies[body] = (bodies[body] || 0) + 1
      end
      bodies
    end

    def calculate_regional_coverage(inventory)
      regions = {
        europe: false,
        north_america: false,
        asia_pacific: false,
        latam: false,
        africa: false,
        moon: false,
        mars: false
      }

      inventory.each do |item|
        loc = LocationService.find(item.location_id)
        next unless loc

        body = loc[:body]&.downcase
        case body
        when 'earth'
          latency = loc[:latency_ms] || {}
          regions[:europe] = true if (latency[:eu] || 999) < 50
          regions[:north_america] = true if (latency[:us] || 999) < 50
          regions[:asia_pacific] = true if (latency[:apac] || 999) < 50
        when 'moon'
          regions[:moon] = true
        when 'mars'
          regions[:mars] = true
        end
      end

      regions
    end

    def calculate_efficiency(inventory)
      return {} if inventory.empty?

      {
        avg_carbon_per_mw: (inventory.sum(:carbon_footprint_tons) / inventory.sum(:capacity_mw)).round(1),
        renewable_estimate: calculate_renewable_pct(inventory),
        cost_per_mw_monthly: (inventory.sum(:monthly_cost) / inventory.sum(:capacity_mw)).round(0)
      }
    end

    def calculate_renewable_pct(inventory)
      renewable_count = 0
      inventory.each do |item|
        source = item.power_source&.downcase
        renewable_count += 1 if source&.include?('renewable') || 
                               source&.include?('hydro') ||
                               source&.include?('geothermal') ||
                               source&.include?('wind') ||
                               source&.include?('solar')
      end
      
      ((renewable_count.to_f / inventory.count) * 100).round(1)
    end
  end
end
```

**File:** Update `config/routes.rb`

```ruby
namespace :api do
  # ... existing routes ...
  
  get 'portfolio/stats', to: 'portfolio#stats'
end
```

**Test:**

```bash
curl http://localhost:3000/api/portfolio/stats | jq
```

**Outputs:**
- ✓ Dashboard can show aggregate metrics
- ✓ Regional coverage visualization ready
- ✓ Carbon efficiency tracking enabled

---

### Task 4.3: Solana Mint Endpoint

**Time:** 30 minutes (coordinate with P4)

**File:** `app/controllers/api/solana_controller.rb` (create new)

```ruby
# frozen_string_literal: true

module Api
  class SolanaController < ApplicationController
    # POST /api/solana/mint
    # Mints a data center record on Solana blockchain
    def mint
      unless params[:location_id].present? && params[:inventory_id].present?
        return render json: {
          error: 'location_id and inventory_id required'
        }, status: :bad_request
      end

      inventory = Inventory.find(params[:inventory_id])
      location = LocationService.find(params[:location_id])

      unless inventory && location
        return render json: {
          error: 'Inventory or location not found'
        }, status: :not_found
      end

      # Call Solana service (from P4) or Node.js microservice
      tx_hash = mint_on_solana(location, inventory)
      
      # Update inventory with tx hash
      inventory.update(solana_tx_hash: tx_hash)

      render json: {
        tx_hash: tx_hash,
        explorer_url: "https://explorer.solana.com/tx/#{tx_hash}?cluster=devnet"
      }, status: :created
    rescue StandardError => e
      Rails.logger.error("Solana mint error: #{e.message}")
      render json: { error: "Mint failed: #{e.message}" }, status: :internal_server_error
    end

    private

    def mint_on_solana(location, inventory)
      # Option 1: Call external Node.js service
      # response = HTTParty.post('http://localhost:4000/mint', ...)

      # Option 2: Inline (if using solana-rb gem)
      # signature = SolanaService.mint_record(location, inventory)

      # For MVP: return mock tx hash
      # Replace with real implementation when available
      
      if ENV['SOLANA_MOCK'].present?
        mock_tx_hash
      else
        call_solana_service(location, inventory)
      end
    end

    def call_solana_service(location, inventory)
      # This will be implemented by P4
      # Expected to return a Solana transaction hash
      mock_tx_hash
    end

    def mock_tx_hash
      # Generate a mock Solana tx hash for development
      "5K4v#{SecureRandom.hex(30)}"
    end
  end
end
```

**File:** Update `config/routes.rb`

```ruby
namespace :api do
  # ... existing routes ...
  
  post 'solana/mint', to: 'solana#mint'
end
```

```bash
# Commit
git add .
git commit -m "feat: add Solana mint endpoint (awaiting P4 implementation)"
```

**Outputs:**
- ✓ Endpoint ready for P4 to connect to
- ✓ Mock implementation allows testing
- ✓ Inventory records tx_hash automatically

---

### Task 4.4: Error Handling & Validation

**Time:** 20 minutes

**File:** `app/controllers/application_controller.rb` (update)

```ruby
class ApplicationController < ActionController::API
  include ActionController::Serialization

  rescue_from ActionController::ParameterMissing, with: :render_missing_parameter
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from StandardError, with: :render_internal_error

  before_action :log_request

  private

  def render_missing_parameter(exception)
    render json: { 
      error: "Missing required parameter: #{exception.param}" 
    }, status: :bad_request
  end

  def render_not_found(exception)
    render json: { 
      error: "Record not found: #{exception.model}" 
    }, status: :not_found
  end

  def render_internal_error(exception)
    Rails.logger.error(exception)
    render json: { 
      error: "Internal server error" 
    }, status: :internal_server_error
  end

  def log_request
    Rails.logger.info("#{request.method} #{request.path}")
  end
end
```

**File:** Create `app/exceptions/api_error.rb`

```ruby
class ApiError < StandardError
  attr_reader :status, :error_code

  def initialize(message, status = :internal_server_error, error_code = 'INTERNAL_ERROR')
    super(message)
    @status = status
    @error_code = error_code
  end
end
```

```bash
# Commit
git add .
git commit -m "refactor: add error handling and request logging"
```

---

### Task 4.5: Deploy Backend

**Time:** 30 minutes (coordinate with team)

**Option 1: Fly.io (recommended for Rails)**

```bash
# Install fly CLI
# https://fly.io/docs/hands-on/install-flyctl/

# Login
flyctl auth login

# Create app
flyctl apps create orbital-atlas-api

# Generate fly.toml
flyctl launch --now

# Set environment variables
flyctl secrets set CLAUDE_API_KEY=sk-ant-...
flyctl secrets set STRIPE_SECRET_KEY=sk_test_...
flyctl secrets set SOLANA_RPC_URL=https://api.devnet.solana.com

# Deploy
flyctl deploy

# Check logs
flyctl logs -a orbital-atlas-api

# Get URL
flyctl open
```

**Option 2: Railway.app (simpler)**

1. Push code to GitHub
2. Go to railway.app
3. "New Project" → "Deploy from GitHub repo"
4. Add PostgreSQL plugin
5. Add environment variables in dashboard
6. Auto-deploys on push

**File:** `fly.toml` (example)

```toml
[env]
rack_env = "production"
rails_env = "production"

[build]
builder = "heroku"

[[services]]
protocol = "tcp"
internal_port = 3000
processes = ["app"]

  [services.concurrency]
  type = "connections"
  hard_limit = 25
  soft_limit = 20

[checks]
  [checks.release]
    type = "release"
    grace_period = "5s"
    timeout = "30s"

  [checks.http]
    type = "http"
    grace_period = "10s"
    timeout = "5s"
    interval = "10s"
    method = "get"
    path = "/health"
```

**File:** `Procfile` (for deployments)

```
release: rails db:migrate && rails db:seed
web: bundle exec rails server -p 3000 -e production
```

```bash
# Test locally
RAILS_ENV=production rails db:migrate db:seed
RAILS_ENV=production rails s

# Then deploy
# (follow option 1 or 2 above)

# Commit
git add Procfile fly.toml .env.example
git commit -m "ops: add deployment configuration (Fly.io)"
```

**Verification after deploy:**
- ✓ `/health` endpoint returns 200
- ✓ `GET /api/locations` returns data
- ✓ `POST /api/reports/scorecard` accepts requests
- ✓ Database migrations ran successfully

---

## Phase 4 Checkpoint ✓ (Hour 24)

**Verification:**
- [ ] Stripe checkout works end-to-end
- [ ] Portfolio stats endpoint returns realistic data
- [ ] Solana endpoint structure ready (awaiting P4)
- [ ] All errors handled gracefully
- [ ] Backend deployed and accessible via URL
- [ ] Frontend can reach deployed API

**URL structure (example with Fly.io):**
```
https://orbital-atlas-api.fly.dev/api/locations
https://orbital-atlas-api.fly.dev/api/reports/scorecard
https://orbital-atlas-api.fly.dev/api/payments/checkout
```

---

## Task Checklist

### Hour 0-2: Setup
- [ ] Rails scaffold created
- [ ] CORS configured
- [ ] .env setup
- [ ] Git initialized

### Hour 2-4: Locations API
- [ ] LocationService built
- [ ] Locations controller + routes
- [ ] Mock location data loaded
- [ ] Endpoints tested manually

### Hour 4-8: Inventory
- [ ] Inventory model created
- [ ] Database migrated
- [ ] Inventory controller + routes
- [ ] Demo data seeded
- [ ] **CHECKPOINT 1: P1 can fetch both data sources**

### Hour 8-16: Claude Intelligence
- [ ] ClaudeService built
- [ ] Reports controller created
- [ ] Advisor controller created
- [ ] Prompt files created
- [ ] Claude API tested
- [ ] **CHECKPOINT 2: Scorecards generate successfully**

### Hour 16-24: Integrations
- [ ] Stripe integrated
- [ ] Portfolio stats working
- [ ] Solana endpoint structure ready
- [ ] Error handling comprehensive
- [ ] Backend deployed
- [ ] **CHECKPOINT 3: Full demo flow works end-to-end**

### Hour 24-40: Polish & Bugs
- [ ] Performance optimization (N+1 queries, caching)
- [ ] Rate limiting on Claude API calls
- [ ] Comprehensive logging
- [ ] Edge case handling
- [ ] Demo script rehearsal

### Hour 40-48: Final Prep
- [ ] Deployment verified
- [ ] Recorded demo as backup
- [ ] README with setup instructions
- [ ] Submission completed

---

## Dependencies & Blockers

| Task | Depends On | Workaround |
|------|-----------|-----------|
| Scorecard endpoint | P2 prompt files | Use default prompts |
| Blueprint endpoint | P2 prompt files | Use default prompts |
| Demo inventory | P2 data file | Use mock data |
| Location dataset | P2 JSON files | Use mock locations |
| Solana mint | P4 implementation | Use mock tx hashes |
| Stripe checkout | Stripe account | Use test keys |
| Frontend integration | P1 ready | Expose at `.fly.dev` URL |

---

## Useful Commands During Development

```bash
# Start Rails dev server
rails s

# Run migrations
rails db:migrate

# Reset database
rails db:drop db:create db:migrate db:seed

# Access Rails console
rails c

# Run specific service
rails c
> ClaudeService.generate_scorecard(LocationService.find('iceland-reykjavik'), [])

# Check for N+1 queries
rails c
> Rack::MiniProfiler.enable_profiling

# See all routes
rails routes

# Deploy (Fly.io)
flyctl deploy

# View live logs
flyctl logs -a orbital-atlas-api

# SSH into production
flyctl ssh console -a orbital-atlas-api
```

---

## Success Criteria

✓ API running and accessible  
✓ All CRUD endpoints working  
✓ Claude integration functional  
✓ Payment flow testable  
✓ Blockchain endpoint ready  
✓ Full demo runnable  
✓ Code deployed  
✓ Team can build on top of it  

---

**Next Steps:**
1. Review this plan with team
2. Coordinate: get `.env` keys from P2 (Claude prompts) and P4 (Solana)
3. Start with Task 1.1 (Rails scaffold)
4. Meet P1 at Hour 4 for first integration
5. Keep checklist updated as you progress
