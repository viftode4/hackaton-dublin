# Orbital Atlas

Global datacenter site selection platform with AI-powered feasibility analysis, 3D globe visualization, Stripe payments for detailed blueprints, and Solana blockchain certification.

## Architecture

```
frontend/     React 19 + Vite + Three.js (3D globe UI)        → localhost:5173
backend/      Ruby on Rails 7.1 API (Docker)                  → localhost:3002
solana/       Rust Axum microservice (Solana devnet minting)   → localhost:3001
```

## Prerequisites

| Tool           | Version    | Notes                          |
|----------------|------------|--------------------------------|
| Docker         | Latest     | Required for backend           |
| Docker Compose | v2+        | Comes with Docker Desktop      |
| Bun            | Latest     | Frontend package manager       |
| Rust           | Latest     | Solana service (`rustup.rs`)   |

## Quick Start

You need **3 terminals**. Start them in this order:

### 1. Backend (Rails API via Docker)

```bash
cd backend

# Create .env with your API keys (see below)
cp .env.example .env
# Edit .env with your keys

# Build and start
docker compose up --build
```

The backend runs on **http://localhost:3002**. It automatically runs migrations and seeds demo data on first start.

### 2. Solana Service (Rust)

```bash
cd solana

# Build (first time takes ~2 min)
cargo build --release

# Start the service
./target/release/server      # Linux/Mac
./target/release/server.exe  # Windows
```

Verify: **http://localhost:3001/health** should return wallet info and SOL balance.

A devnet wallet (`devnet-wallet.json`) is included. To generate a new one:
```bash
cargo run --bin keygen
```

### 3. Frontend (React + Vite)

```bash
cd frontend

# Install dependencies
bun install

# Start dev server
bun run dev
```

Open **http://localhost:5173** in your browser.

## Environment Variables

### Backend (`backend/.env`)

```env
# Required
CLAUDE_API_KEY=sk-ant-...          # Anthropic API key (for AI reports/chat)
STRIPE_SECRET_KEY=sk_test_...      # Stripe secret key (for payments)
STRIPE_WEBHOOK_SECRET=whsec_...    # Stripe webhook signing secret

# Optional
CLAUDE_MODEL=claude-haiku-4-5-20251001   # Claude model (default: claude-sonnet)
PAID_API_KEY=...                         # Paid.ai usage tracking key
SOLANA_MOCK=true                         # Set to skip real Solana minting
```

These are set in `docker-compose.yml` and loaded from `.env` automatically.

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:3002
```

Already configured. Only change if your backend runs on a different port.

### Solana Service

Configured via environment or defaults:

```env
SOLANA_RPC_URL=https://api.devnet.solana.com   # default
WALLET_PATH=devnet-wallet.json                  # default
PORT=3001                                       # default
```

## How It Works

### Core Flow

1. **Browse** locations on the 3D globe (Earth, Moon, Mars, orbital satellites)
2. **Click** a location to see its feasibility scorecard (AI-generated)
3. **Buy** a detailed blueprint via Stripe ($299)
4. Blueprint is **auto-generated** by Claude AI and stored in the database
5. Location is **auto-added** to your inventory
6. CO2 record is **auto-minted** on Solana devnet
7. View your inventory with Solana explorer links

### AI Features

- **Scorecard**: Quick feasibility assessment for any location
- **Blueprint**: Detailed construction plan, power strategy, cooling design, network topology, staffing, risk analysis
- **AI Chat Advisor**: Ask questions about locations, compare costs, get recommendations
- The AI advisor can also create Stripe payment links directly in chat

### Services Communication

```
Browser (5173) → Rails API (3002) → Claude API (AI reports)
                                   → Stripe API (payments)
                                   → Solana Service (3001) → Solana Devnet
```

## Database

SQLite in development (no setup needed). Tables:

- **inventories** — User's datacenter portfolio items + Solana tx hashes
- **blueprint_payments** — Stripe payment records + generated blueprint content

Reset everything:
```bash
cd backend
docker compose exec backend rails db:drop db:create db:migrate db:seed
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/locations` | List all datacenter locations |
| GET/POST | `/api/inventories` | CRUD for user's portfolio |
| POST | `/api/reports/scorecard` | Generate AI feasibility scorecard |
| POST | `/api/reports/blueprint` | Generate AI detailed blueprint |
| POST | `/api/advisor/chat` | Chat with AI advisor |
| POST | `/api/payments/checkout` | Create Stripe checkout session |
| GET | `/api/payments/session/:id` | Check payment status |
| GET | `/api/payments/blueprints` | List purchased blueprints |
| POST | `/api/solana/mint` | Mint record on Solana devnet |
| GET | `/health` | Health check |

## Troubleshooting

**Frontend shows empty inventory**: Check browser console. If you see network errors to `:3002`, make sure the backend Docker container is running.

**Solana mint fails**: Make sure `solana/target/release/server` is running on port 3001 and `SOLANA_MOCK` is NOT set in `docker-compose.yml`. Check wallet balance at http://localhost:3001/health (needs SOL for transaction fees).

**Stripe payments not detected**: The app polls for payment status. Make sure the backend can reach Stripe's API. Check `docker compose logs backend` for errors.

**AI reports return errors**: Verify `CLAUDE_API_KEY` is set correctly in `backend/.env`.
