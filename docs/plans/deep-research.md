# Deep Research — February 21, 2026

## CRITICAL FINDINGS

### 1. Solana Confidential Transfers are DISABLED
- ZK ElGamal Proof Program disabled on mainnet AND devnet since June 2025
- Two bugs found (arbitrary proof construction + phantom challenge soundness)
- Code4rena audit completed ($203k pool), re-enablement "at least a few months"
- NO JS/TS SDK — Rust only
- Each transfer requires ~7 transactions
- **HOWEVER**: Arcium CSPL is an alternative (mainnet alpha live, MPC-based, supports smart contracts)
- Privacy Hack 2026 winners (Jan 12-30) built: Privacy Cash, Veil, StealthPay, etc.
- **ecoToken** works on Solana for carbon credit retirement → NFT proof (used by Solana Foundation itself)

### 2. Self-Offsetting AI Agent = GENUINELY NOVEL
- Offset AI (browser extension) and OffsetMy.ai exist but are user-driven, off-chain
- OpenAI + CNaught integration offsets user activities, NOT agent's own inference
- **No published paper or product** describes a fully autonomous self-offsetting agent
- Building blocks all exist: CodeCarbon + Climatiq + ecoToken/Carbonmark + Solana

### 3. Carbon-Aware MCP Server DOESN'T EXIST
- Climatiq MCP exists but does emission calculations, NOT real-time grid intensity
- ClimateTriage MCP = just GitHub issue search for climate projects
- EnergyPlus-MCP = building energy simulation (LBNL)
- **NO MCP exposes WattTime or Electricity Maps real-time carbon data**
- Building one = ~6 lines of Python with FastMCP

### 4. Carbon-Aware AI Router — No Commercial Product
- Microsoft EcoServe: paper only, no code (47% reduction)
- NeurIPS 2025: paper only (40% reduction via data transfer routing)
- DynamoLLM: paper only (52% energy savings, 38% carbon reduction)
- GSF Carbon-Aware SDK: REAL, open-source, MIT, v1.8.0 — 8 REST endpoints
- WattTime: free tier = CAISO_NORTH + percentile index for all regions
- Electricity Maps: free tier = 1 zone, 50 req/hr
- **Arrcus AINF** (Feb 2026): closest commercial product but carbon is one policy among many
- MVP buildable in ~10 hours

### 5. EU AI Act Compliance for Autonomous Agents = MASSIVE GAP
- Art 50 enforcement: August 2, 2026 (5 months away)
- Penalties: up to €35M or 7% global revenue
- 80% of Fortune 500 use active AI agents (Microsoft, Feb 2026)
- AI governance market: $492M in 2026 spending, 28%+ CAGR
- **NO tool handles runtime agent transaction labeling**
- **NO standard for agent self-identification in HTTP requests/payments**
- **NO real-time compliance monitoring for autonomous agent actions**
- "Agentic Tool Sovereignty" = unsolved legal concept
- GovAI paper says agent actions likely DO fall under Art 50 but no official guidance

### 6. ACP ↔ x402 Bridge — Converging Already
- Stripe integrated x402 for USDC on Base (Feb 2026)
- Google AP2 = payment-agnostic (cards + stablecoins + bank transfers)
- Still a gap in unified MCP wrapper exposing both protocols as tools

## KEY APIS & TOOLS FOR HACKATHON

### Carbon Data
| API | Free tier | What it gives |
|-----|-----------|---------------|
| WattTime | CAISO_NORTH real data + percentile for all regions | Marginal emissions (gCO2/MWh), 5-min, forecasts |
| Electricity Maps | 1 zone, 50 req/hr | Carbon intensity (gCO2/kWh), grid mix |
| GSF Carbon-Aware SDK | MIT open source | REST API wrapping WattTime/ElecMaps, 8 endpoints |
| Climatiq | Free tier | Energy → CO2e conversion, 80+ emission factor datasets |
| CodeCarbon | Open source Python | GPU/CPU/RAM energy tracking per inference |

### Carbon Offsets
| API | Chain | Min purchase | Speed |
|-----|-------|-------------|-------|
| ecoToken | Solana (via Regen) | Variable | NFT proof on Solana |
| Carbonmark | Polygon | 0.001 tCO2 | 0.5-3 seconds |
| CNaught | Off-chain | Per kg | Instant |
| Stripe Climate | Off-chain | Per metric ton | Instant purchase, future delivery |
| Cloverly | Off-chain | Per transaction | Real-time matching |

### MCP Building
| Tool | Effort |
|------|--------|
| FastMCP (Python) | ~6 lines for basic server |
| Official MCP SDK | More verbose but more control |
| Transport: stdio (local) or SSE (remote) |

### Per-Query Energy Estimates
| Model | Energy/query |
|-------|-------------|
| GPT-4o | ~0.42 Wh |
| Claude (estimated) | ~0.3-0.5 Wh |
| Small model (8B) | ~0.05 Wh |
| Rule of thumb | ~0.0004 kWh per ~1000 tokens |
