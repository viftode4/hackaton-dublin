# Skyly — Backend

REST API built with **Ruby on Rails 7.1** powering AI report generation, location data, payments, and blockchain integration.

## Tech Stack

- **Ruby on Rails 7.1** with Puma server
- **Anthropic SDK v1.23** — Claude API with tool_runner for agentic loops
- **Stripe** — Payment processing (Checkout sessions + webhooks)
- **Paid.ai** — AI usage metering and billing
- **SQLite** (development) / **PostgreSQL** (production)
- **Docker** for containerized deployment

## API Endpoints

### Locations
```
GET  /api/locations          # List all (filterable by body, search)
GET  /api/locations/:id      # Location detail
```

### AI Reports (Claude-powered)
```
POST /api/reports/scorecard  # Free 6-axis feasibility scorecard
POST /api/reports/blueprint  # Paid full construction blueprint ($299)
```

### AI Advisor (with tool use)
```
POST /api/advisor/chat       # Natural language infrastructure advice
POST /api/advisor/recommend  # Portfolio-aware location recommendations
```

### Inventory
```
GET    /api/inventory        # User's data centers
POST   /api/inventory        # Add data center
PATCH  /api/inventory/:id    # Update
DELETE /api/inventory/:id    # Remove
```

### Payments (Stripe)
```
POST /api/payments/checkout           # Create checkout session
GET  /api/payments/session/:id        # Check payment status
GET  /api/payments/blueprints         # List purchased blueprints
POST /api/webhooks/stripe             # Stripe webhook handler
```

### Other
```
POST /api/solana/mint                 # Mint on-chain portfolio record
POST /api/predict/co2                 # ML CO2 prediction
GET  /api/portfolio/stats             # Portfolio analytics
GET  /api/tle                         # Satellite TLE data (CelesTrak proxy)
GET  /api/planetary/:body/:dataset    # Moon/Mars region data
```

## Claude Tool Use

The AI advisor has access to 8 tools for agentic behavior:

| Tool | Purpose |
|------|---------|
| `LookupLocation` | Fetch detailed metrics for a location |
| `SearchLocations` | Filter by body, energy cost, carbon intensity |
| `CompareLocations` | Side-by-side comparison |
| `CalculateCosts` | Estimate build-out costs |
| `GetPortfolio` | Read user's current inventory |
| `RecommendLocations` | Analyze gaps, suggest optimal sites |
| `CreatePaymentLink` | Generate Stripe checkout URL |
| `CheckPaymentStatus` | Verify payment completion |

## Database Schema

**inventories** — User's data center portfolio entries
- location_id, name, capacity_mw, workload_types
- utilization_pct, carbon_footprint_tons, power_source
- monthly_cost, solana_tx_hash

**blueprint_payments** — Stripe payment + blueprint storage
- location_id, customer_id, stripe_session_id
- amount_cents, status, blueprint_content, solana_tx_hash

## Setup

```bash
bundle install
cp .env.example .env    # Fill in API keys (see below)
rails db:create db:migrate
rails server            # http://localhost:3000
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_API_KEY` | Yes | Anthropic API key |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `PAID_API_KEY` | Yes | Paid.ai API key |
| `FRONTEND_URL` | No | Frontend origin for CORS (default: `http://localhost:5173`) |
| `SOLANA_SERVICE_URL` | No | Solana service URL (default: `http://localhost:3001`) |
| `SOLANA_MOCK` | No | Set `true` to mock Solana calls |
| `DATABASE_URL` | No | PostgreSQL URL (uses SQLite if unset) |

## Docker

```bash
docker compose up --build    # http://localhost:3002
```
