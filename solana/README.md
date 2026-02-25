# Skyly — Solana Service

Rust microservice for minting data center portfolio records as **memo transactions** on **Solana devnet**.

## Tech Stack

- **Rust** (2021 edition)
- **Axum 0.8** — Async web framework
- **Tokio** — Async runtime
- **Solana SDK v2.2** — Keypair, transaction, instruction, signing
- **reqwest** — HTTP client for RPC calls

## Endpoints

```
GET  /health    # Health check
POST /mint      # Mint a memo transaction on Solana devnet
```

### POST /mint

Mints a memo transaction containing portfolio record data.

**Request:**
```json
{
  "location_id": "reykjavik-01",
  "location_name": "Reykjavik, Iceland",
  "capacity_mw": 50,
  "feasibility_score": 94,
  "report_hash": "sha256:abc123..."
}
```

**Response:**
```json
{
  "success": true,
  "tx_hash": "5xK9...",
  "explorer_url": "https://explorer.solana.com/tx/5xK9...?cluster=devnet"
}
```

## How It Works

1. Receives portfolio record data from the Rails backend
2. Serializes the data into a memo string
3. Creates a Solana memo instruction with the SPL Memo program
4. Signs and submits the transaction to Solana devnet
5. Returns the transaction hash for on-chain verification

## Setup

```bash
# Generate a devnet wallet (first time only)
cargo run --bin keygen

# Fund the wallet with devnet SOL
solana airdrop 2 <PUBKEY> --url devnet

# Start the server
cargo run --bin server    # → http://localhost:3001
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` | Solana RPC endpoint |
| `WALLET_PATH` | `./wallet.json` | Path to keypair file |
| `PORT` | `3001` | Server port |

## Binaries

| Binary | Description |
|--------|-------------|
| `server` | HTTP server with /health and /mint endpoints |
| `keygen` | Generates a new Solana keypair and saves to file |
