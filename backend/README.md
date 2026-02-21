# Orbital Atlas — Backend API

A modular Ruby on Rails API for an interactive solar system data center feasibility estimator.

## Project Structure

```
backend/
├── app/
│   ├── controllers/api/           # API controllers (7 modules)
│   │   ├── locations_controller.rb        # Read-only location data
│   │   ├── inventories_controller.rb      # User's data center portfolio (CRUD)
│   │   ├── reports_controller.rb          # Claude-generated reports
│   │   ├── advisor_controller.rb          # Chat & recommendations
│   │   ├── payments_controller.rb         # Stripe integration
│   │   ├── portfolio_controller.rb        # Analytics & stats
│   │   └── solana_controller.rb           # Blockchain minting
│   ├── models/
│   │   └── inventory.rb                   # User's data center records
│   └── services/
│       ├── location_service.rb            # Static location data loader
│       └── claude_service.rb              # Claude API integration (TODO)
│
├── config/
│   ├── routes.rb                      # API namespace with all endpoints
│   └── initializers/
│       ├── cors.rb                    # CORS middleware configuration
│       └── anthropic.rb               # Anthropic SDK setup
│
├── data/
│   ├── locations/                     # Location datasets (from P2)
│   │   ├── earth.json                 # Earth locations
│   │   ├── moon.json                  # Lunar bases
│   │   ├── mars.json                  # Mars locations
│   │   └── orbit.json                 # Orbital platforms
│   └── demo-inventory.json            # Sample data centers (from P2)
│
├── db/
│   ├── migrate/
│   │   └── 20260221000001_create_inventories.rb
│   └── seeds.rb                       # Database seeding script
│
├── prompts/                           # Claude system prompts (from P2)
│   ├── scorecard.md                   # Scorecard generation prompt
│   ├── blueprint.md                   # Blueprint generation prompt
│   ├── advisor.md                     # Advisor chat prompt
│   └── recommend.md                   # Recommendation prompt
│
├── .env.example                       # Environment variables template
├── .env                               # Local environment (not committed)
├── .gitignore
├── Gemfile                            # Ruby dependencies
├── README.md                          # This file
└── config.ru                          # Rack configuration
```

## Architecture

### Modular Design for Easy Integration

Each component is designed to work independently:

- **LocationService**: Loads JSON files dynamically, works before P2 delivers data
- **Controllers**: Each controller is self-contained, can be tested independently
- **ClaudeService**: Placeholder structure ready for P2's prompts
- **Routes**: Centralized in routes.rb for clear API contract

### Integration Points

1. **P2 (Data & Prompts):**
   - Replace `.placeholder` files in `data/locations/` with real JSON
   - Replace `.placeholder` files in `prompts/` with Claude system prompts
   - Add `demo-inventory.json` for seeding

2. **P1 (Frontend):**
   - All endpoints available at `/api/*`
   - CORS configured to accept requests from Lovable
   - Ready to fetch locations and manage inventory

3. **P4 (Blockchain):**
   - `POST /api/solana/mint` endpoint ready
   - Mock implementation available for testing
   - Call `mint_on_solana()` method from your Solana service

## Setup

### Prerequisites
- Ruby 3.3.0
- PostgreSQL 15+
- Rails 7.1

### Installation

```bash
# Clone and navigate
cd backend

# Install dependencies
bundle install

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Create database
rails db:create

# Run migrations
rails db:migrate

# Seed demo data (after P2 provides data)
rails db:seed

# Start server
rails s
# API available at http://localhost:3000
```

## API Endpoints

### Locations (Read-only)
- `GET /api/locations` — List all locations
- `GET /api/locations?body=earth` — Filter by celestial body
- `GET /api/locations/:id` — Get single location

### Inventory (CRUD)
- `GET /api/inventories` — List user's data centers
- `POST /api/inventories` — Add data center
- `GET /api/inventories/:id` — Get specific item
- `PATCH /api/inventories/:id` — Update item
- `DELETE /api/inventories/:id` — Remove item

### Reports (Claude-Generated)
- `POST /api/reports/scorecard` — Generate feasibility scorecard
- `POST /api/reports/blueprint` — Generate detailed blueprint

### Advisor (Chat & Recommendations)
- `POST /api/advisor/chat` — Chat with AI advisor
- `POST /api/advisor/recommend` — Get location recommendations

### Payments (Stripe)
- `POST /api/payments/checkout` — Create checkout session
- `GET /api/payments/session/:id` — Check payment status

### Analytics
- `GET /api/portfolio/stats` — Aggregate portfolio metrics

### Blockchain
- `POST /api/solana/mint` — Mint record on Solana

### Health
- `GET /health` — Health check for deployment

## Environment Variables

```
# Claude API
CLAUDE_API_KEY=sk-ant-...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_MOCK=true           # Use mock responses for development

# Frontend
FRONTEND_URL=http://localhost:5173

# Database
DATABASE_URL=postgres://...
```

## Development

### Start Development Server
```bash
rails s
```

### Access Console
```bash
rails c
> LocationService.all
> Inventory.count
> ClaudeService.generate_scorecard(location, [])
```

### Run Tests
```bash
rspec
```

### Reset Database
```bash
rails db:drop db:create db:migrate db:seed
```

## Integration Workflow

### Phase 1: Foundation (Done)
- [x] Project structure created
- [x] Controllers scaffolded
- [x] Services stubbed
- [x] Routes defined
- [x] Models created
- [x] Database migration ready

### Phase 2: P2 Integration
- [ ] Add location JSON files (replace `.placeholder` files)
- [ ] Add Claude prompts (replace `.placeholder` files)
- [ ] Add demo inventory
- [ ] Run `rails db:seed`
- [ ] Test `POST /api/reports/scorecard`

### Phase 3: P4 Integration
- [ ] Connect to Solana service
- [ ] Implement `call_solana_service()` in SolanaController
- [ ] Test `POST /api/solana/mint`

### Phase 4: Deployment
- [ ] Deploy to Fly.io or Railway
- [ ] Set production environment variables
- [ ] Update CORS for production domain

## Testing TODO

```bash
# Manual testing examples

# Get all locations
curl http://localhost:3000/api/locations

# Create inventory
curl -X POST http://localhost:3000/api/inventories \
  -H "Content-Type: application/json" \
  -d '{
    "inventory": {
      "location_id": "iceland-reykjavik",
      "name": "AcmeCorp Iceland DC-1",
      "capacity_mw": 50,
      "workload_types": ["AI training"],
      "utilization_pct": 72,
      "carbon_footprint_tons": 120,
      "power_source": "geothermal",
      "monthly_cost": 450000
    }
  }'

# Get scorecard (requires Claude API key)
curl -X POST http://localhost:3000/api/reports/scorecard \
  -H "Content-Type: application/json" \
  -d '{"location_id": "iceland-reykjavik"}'

# Get portfolio stats
curl http://localhost:3000/api/portfolio/stats
```

## Key Decisions

1. **Modular Controllers**: Each endpoint is self-contained for independent testing
2. **Service Layer**: Business logic in services (LocationService, ClaudeService)
3. **Static Location Data**: Loaded from JSON, not a database table
4. **Placeholder Structure**: All integration points clearly marked with TODO comments
5. **CORS-First**: Designed for frontend requests from the start

## Next Steps

1. Review structure with team
2. P2: Fill in location data and Claude prompts
3. P4: Connect Solana integration
4. P1: Begin frontend integration
5. Deploy and prepare for demo

## Support

- Check `.env.example` for all required environment variables
- Look for `TODO:` comments in code for integration points
- Each controller has clear input/output expectations
- All errors return JSON with status codes

---

**Backend Engineering**: Start here → Phase 1 complete ✓ → Await P2 data → Continue with Phase 2
