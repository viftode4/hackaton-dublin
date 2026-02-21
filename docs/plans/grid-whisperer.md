# Grid Whisperer

**Pitch**: An AI agent that acts as a carbon-aware scheduler for your entire compute stack. It watches the grid in real-time and makes decisions about *when* and *where* your workloads run — not for cost, but for carbon.

---

## Three Modes of Operation

### 1. Shift (Batch jobs)
Batch jobs, training runs, CI/CD pipelines, backups — these don't need to run NOW. The agent watches WattTime/Electricity Maps forecasts and schedules them for the greenest window in the next 24h.

> "Your nightly training run now happens at 3am when wind is peaking."

### 2. Route (Real-time inference)
Real-time requests can't wait, but they CAN go somewhere cleaner. The agent polls carbon intensity across regions and routes to the lowest-carbon endpoint. Crusoe (clean energy by default) becomes the preferred backend, others are fallbacks.

> "This request went to Iowa instead of Virginia because Iowa's grid was 60% cleaner right now."

### 3. Shape (Adaptive — the novel part)
When the grid is dirty and the request is real-time, the agent adapts the *request itself*:
- Use a smaller model
- Generate shorter responses
- Skip image generation
- Lower sampling temperature
- Reduce token count

Research (Sprout, EMNLP 2024) showed >40% reduction through "generation directives" alone.

> "Grid is dirty — switching from Opus to Haiku for low-priority requests."

---

## Why This Doesn't Exist Yet

EcoServe (Microsoft), DynamoLLM, NeurIPS routing paper — all showed 40-52% reductions. **All are PDFs, not products.** No code, no API, nothing you can use.

Grid Whisperer makes them real:
- A running service with a dashboard
- An MCP server so any AI tool can be carbon-aware
- Provable on-chain (Solana receipts for carbon saved/offset)
- Priced via Paid (you pay per ton of CO2 avoided)

---

## Demo Script (3 minutes)

1. **Show the dashboard** — live grid carbon map, your workloads plotted on it
2. **Fire a batch job** — agent delays it, shows forecast, picks the green window
3. **Fire real-time requests** — watch them route to different regions live as carbon fluctuates
4. **Grid goes dirty** — agent automatically shapes down (Opus → Haiku), show carbon savings in real-time
5. **Show the Solana receipt** — every decision logged, offset purchased, NFT minted
6. **Show the Paid invoice** — "This agent saved you X kg CO2 today, cost: Y"

---

## Challenge Stacking (~€31,000+)

| Challenge | How it fits | Prize |
|-----------|------------|-------|
| Sustainability theme | Core value prop | €1,000 |
| Claude | Claude IS the scheduling brain | $10,000 credits |
| Crusoe Inference | Clean-energy inference as preferred routing target | $5,000 credits |
| Solana | Carbon receipts + offset proofs on-chain | €3,500 |
| Best Use of Data | Real-time grid data → predictions → decisions | €7,000 |
| Stripe | Payment for offsets, billing for the service | €3,000 |
| Paid | Outcome-based pricing — pay per CO2 avoided | Office + 2yr free |
| Adaptable Agent | Literally adapts behavior based on changing grid | Gift bags |
| Consulting Agent | Autonomous sustainability consultant for infra | Team lunch |
| Miro | Outputs carbon optimization plan to board | €1,000 |

---

## Tech Stack / Building Blocks

| Component | Tool | Effort |
|-----------|------|--------|
| Carbon data | WattTime (free: percentile all regions) + Electricity Maps (free: 1 zone) | Low |
| Carbon-Aware SDK | GSF Carbon-Aware SDK (MIT, 8 REST endpoints) | Low |
| Routing logic | Python FastAPI | Low |
| Shape mode | Claude API with dynamic model selection + generation directives | Medium |
| MCP server | FastMCP (~6 lines) | Low |
| Solana receipts | ecoToken (NFT proof) or direct Solana program | Medium |
| Carbon offsets | Carbonmark (0.001 tCO2 min, 0.5-3s settlement) | Low |
| Dashboard | Lovable (vibe-code it fast) | Low |
| Billing | Paid.ai + Stripe | Low |
| Energy tracking | CodeCarbon (pip install) | Low |

---

## Risks

- **Shape mode** is the hardest to demo convincingly — needs clear before/after
- WattTime free tier only gives percentile (not absolute gCO2/MWh) outside CAISO_NORTH
- Solana receipts add complexity — could mock for demo if time is tight
- Need Crusoe API key (form due Friday 7pm)

---

## Key Research References

- Microsoft EcoServe: 47% carbon reduction (paper only)
- DynamoLLM: 52% energy savings, 38% carbon reduction (paper only)
- NeurIPS 2025: 40% reduction via data transfer routing (paper only)
- Sprout (EMNLP 2024): >40% reduction via generation directives
- GSF Carbon-Aware SDK: production, MIT, v1.8.0
- Arrcus AINF (Feb 2026): closest commercial product, carbon is one policy among many
