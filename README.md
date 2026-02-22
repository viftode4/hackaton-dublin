# Skyly — Orbital Atlas

Datacenter location intelligence powered by real-time carbon data, AI analysis, and blockchain verification.

## Quick Start

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) + Docker Compose
- [Bun](https://bun.sh/) (`npm install -g bun`)

---

### 1. Backend (Rails API)

```bash
cd backend

# Copy and fill in your keys
cp .env.example .env
# Required: CLAUDE_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

# Start with Docker (exposes port 3002)
docker compose up --build -d
```

Check it's running:
```bash
curl http://localhost:3002/health  # → OK
```

---

### 2. Frontend (React + Vite)

```bash
cd frontend

# Set API URL (already correct if you cloned fresh)
echo "VITE_API_URL=http://localhost:3002" > .env

# Install and run
bun install
bun run dev
```

Open **http://localhost:5173**

---

### 3. Solana Service (optional)

Only needed for on-chain minting. Set `SOLANA_MOCK=true` in `backend/.env` to skip it.

```bash
cd solana
cargo run
# Runs on port 3001
```

---

## Architecture

```
frontend/   React + Vite + Three.js globe          (port 5173)
backend/    Rails API + SQLite + Claude AI          (port 3002 via Docker)
solana/     Rust mint service for Solana devnet     (port 3001)
maps/       ML model output HTML files (Plotly)
```

## Features

- **Globe** — Real-time CO₂ intensity by country, power plants, datacenter locations
- **AI Scorecard** — Claude-generated feasibility reports per location
- **Compare** — ML regression projections to 2030 across climate scenarios
- **Inventory** — Portfolio management with Solana NFT minting
- **Data Analysis** — Interactive ML model maps (opens in new tab)

## Environment Variables

| Variable | Description |
|---|---|
| `CLAUDE_API_KEY` | Anthropic API key for AI reports |
| `STRIPE_SECRET_KEY` | Stripe secret for payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `SOLANA_MOCK` | Set `true` to skip Solana service |
| `VITE_API_URL` | Backend URL (default: `http://localhost:3002`) |
