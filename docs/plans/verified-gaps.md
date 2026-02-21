# Verified White Space — Things That Don't Exist (Feb 21, 2026)

## GAP 1: Carbon-Aware MCP Server
- **Status**: Does NOT exist. Climatiq MCP does emission calculations but NO MCP exposes real-time grid carbon intensity.
- **Effort**: ~6 lines of Python with FastMCP
- **Data sources**: WattTime (free: percentile for all regions), Electricity Maps (free: 1 zone), GSF Carbon-Aware SDK (MIT, wraps both)
- **Impact**: Any MCP-compatible AI tool (Claude Code, Cursor, Copilot, Replit, Gemini CLI) could become carbon-aware instantly

## GAP 2: Self-Offsetting AI Agent
- **Status**: Does NOT exist. Offset AI = browser extension (user-driven, off-chain). OpenAI+CNaught = offsets user activities, not agent's own inference.
- **No paper, no product, no prototype** does this autonomously with on-chain proof.
- **Building blocks ready**: CodeCarbon/Climatiq (measure) → ecoToken (Solana-native offset, NFT proof) or Carbonmark (Polygon, 0.5-3s)
- **ecoToken used by Solana Foundation itself** for carbon neutrality

## GAP 3: Carbon-Aware AI Inference Router (Commercial Product)
- **Status**: Research only. EcoServe (47% reduction), DynamoLLM (52% energy savings), NeurIPS (40% reduction) — all papers, no code, no product.
- **Arrcus AINF** (Feb 2026) is closest but carbon is one policy among many, not core value prop.
- **GSF Carbon-Aware SDK** is the building block (MIT, 8 REST endpoints, production-grade)
- **MVP**: ~10 hours. Python FastAPI, poll carbon data, route to lowest-carbon inference endpoint.

## GAP 4: EU AI Act Compliance for Autonomous Agents
- **Status**: MASSIVE gap. $492M market in 2026, 28%+ CAGR. Aug 2, 2026 enforcement (5 months).
- **80% of Fortune 500** use active AI agents (Microsoft, Feb 2026)
- **No tool** handles runtime agent transaction labeling
- **No standard** for agent self-identification in HTTP requests/payments
- **No real-time compliance monitoring** for autonomous agent actions
- Art 50 likely requires agents to self-identify but no official guidance yet
- Penalties: up to €35M or 7% global revenue

## GAP 5: Adaptive AI Behavior Based on Environmental Conditions
- **Status**: Does NOT exist. No AI agent changes its model selection, verbosity, or behavior based on real-time grid carbon intensity.
- **Research supports**: Sprout (EMNLP 2024) showed >40% reduction via "generation directives" controlling autoregressive generation. GAR showed multi-model routing based on carbon constraints.
- **Nobody has productized this** or made it user-facing.

## GAP 6: AI Carbon Receipts on Blockchain
- **Status**: Does NOT exist. No system mints per-inference carbon receipts on-chain.
- Climate TRACE has data but no blockchain. GainForest has blockchain but no per-inference tracking.
- **Closest**: ecoToken mints NFT Impact Certificates for carbon retirements on Solana.
- **Nobody combines**: inference measurement + automatic offset + on-chain proof in one flow.

## GAP 7: Voice AI That Adapts to Environmental Context
- **Status**: Does NOT exist. ElevenLabs v3 supports emotion tags ([excited], [whispers]) and 70+ languages.
- **Nobody has connected** voice synthesis parameters to external environmental data (grid carbon, weather, etc.)
- Text-to-Dialogue API enables structured multi-speaker audio — could have "clean grid voice" vs "dirty grid voice"

## GAP 8: Cross-Protocol Agent Payment Bridge (MCP wrapper)
- **Status**: Converging but no unified tool. Stripe integrated x402 on Base (Feb 2026).
- **No MCP server** wraps both Stripe ACP and Coinbase x402 as tools for AI agents.
- **Feasible**: x402 TS SDK = ~50 lines. ACP has example implementations. Unified MCP wrapper = strong hackathon scope.

---

## VERIFIED BUILDING BLOCKS (ready to use)

| Building Block | Status | Access |
|---|---|---|
| WattTime API | Production | Free: percentile all regions + CAISO_NORTH real data |
| Electricity Maps API | Production | Free: 1 zone, 50 req/hr |
| GSF Carbon-Aware SDK | Production, MIT | 8 REST endpoints, Docker |
| CodeCarbon | Production, open source | pip install codecarbon |
| Climatiq API | Production | Free tier, energy→CO2e |
| ecoToken | Production, Solana | Carbon credit retirement → NFT proof |
| Carbonmark API | Production, Polygon | 0.001 tCO2 min, 0.5-3s settlement |
| Stripe Climate API | Production | ~$56/ton, future delivery |
| CNaught API | Production | Per-kg purchase |
| FastMCP | Production, open source | MCP server in ~6 lines Python |
| ElevenLabs v3 | Production | 70+ langs, emotion tags, multi-speaker |
| Miro MCP Server | Production | Read/write boards from AI agents |
| Stripe Agent Toolkit | Production | Agents with payment capabilities |
| Claude API | Production | 200k context, tool use |
| Crusoe Inference API | Production | Clean-energy inference |
