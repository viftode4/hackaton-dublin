# Orbital Atlas — Data Center Feasibility Estimator

**Theme**: Sustainability
**Team**: 4 people, 48 hours
**Target prizes**: ~€30.5k+ across 10 challenges

---

## What It Is

A 3D interactive solar system (Earth, Moon, Mars) where you explore locations, click to get AI-generated data center feasibility reports, manage an inventory of your existing infrastructure, and chat with an AI advisor that recommends where to build next based on your portfolio gaps.

**Pitch**: "The same tool that helps you pick between Iceland and Singapore today will help you evaluate the lunar south pole tomorrow."

---

## Core User Flows

### Flow 1: Explore & Estimate
User rotates the 3D globe -> clicks a location (or a curated hotspot) -> sees a scorecard (cost, power, cooling, latency, carbon, risk) -> drills down into a full blueprint with phased construction plan.

### Flow 2: Ask the Advisor
User types requirements like "I need 100MW with low carbon and <30ms to EU" -> Claude analyzes all locations against existing inventory -> recommends top 3 sites with reasoning -> user clicks to see full report.

### Flow 3: Build & Track (Inventory)
User approves a recommended site -> it's added to their inventory -> Solana receipt minted -> Stripe charges for the report -> portfolio dashboard updates (coverage map, carbon footprint, total capacity, redundancy score).

### Flow 4: Portfolio Intelligence
"You have 5 data centers, all fossil-grid powered in the northern hemisphere. Here's how a Moon base + Iceland expansion would give you 99.99% uptime, carbon neutrality, and global coverage."

---

## Architecture

```
+--------------------------------------------------+
|               FRONTEND (Lovable + React)          |
|  +----------+  +----------+  +----------------+  |
|  | 3D Globe |  |   Chat   |  |   Dashboard    |  |
|  | (Earth/  |  | Advisor  |  |  (Inventory +  |  |
|  |Moon/Mars)|  |          |  |   Portfolio)   |  |
|  +----+-----+  +----+-----+  +-------+--------+  |
+-------|--------------|-----------------|---------+
        |              |                 |
        v              v                 v
+--------------------------------------------------+
|              BACKEND (Ruby on Rails)              |
|  +--------------+  +-------------------------+   |
|  | Location API  |  |   Report Generator     |   |
|  | (curated data |  |   (Claude via Crusoe)   |   |
|  |  + inventory) |  |                         |   |
|  +--------------+  +-------------------------+   |
|  +--------------+  +----------+  +-----------+   |
|  |  Stripe      |  |  Solana  |  |   Paid    |   |
|  |  Billing     |  |  Minting |  |  Metering |   |
|  +--------------+  +----------+  +-----------+   |
+--------------------------------------------------+
```

### Frontend (Lovable)
- 3D interactive globe with Earth, Moon, Mars (Lovable has demonstrated 3D Earth capability)
- Clickable locations with curated hotspots pre-marked
- Chat interface for the AI advisor
- Dashboard: inventory management, portfolio stats, comparison views
- Landing page

### Backend (Ruby on Rails)
- REST API serving location data, inventory CRUD, report generation
- Claude integration via Crusoe inference endpoint
- Stripe payment processing (per-report billing)
- Solana integration (mint on-chain records for approved sites)
- Paid.ai metering (track usage and value delivered)

### AI Layer (Claude via Crusoe)
- Structured tool use: Claude calls tools to fetch location data, inventory state, energy prices
- Report generation: scorecard (quick) + full blueprint (drill-down)
- Recommendation engine: analyzes portfolio gaps and suggests optimal next locations
- Conversational advisor: natural language Q&A about data center planning

---

## Data Model

### Location (curated dataset)
~30 Earth + 5 Moon + 3 Mars + 2 Orbit locations, each with:
- id, name, body (earth/moon/mars/orbit), coordinates (lat/lng or body-relative)
- energy_cost_per_kwh, energy_sources[], grid_carbon_intensity_gco2
- avg_temperature_c, cooling_method, cooling_cost_estimate
- land_cost_per_sqm (or N/A for space), construction_cost_per_mw
- latency_to_markets: { eu_ms, us_ms, apac_ms }
- natural_disaster_risk (0-100), political_stability (0-100)
- regulatory_environment (description), connectivity_options[]
- special_factors (e.g. "lunar regolith shielding", "zero-g cooling", "solar constant")

### Inventory Item (user's existing data centers)
- id, location_id, name, capacity_mw
- workload_types[], utilization_pct
- annual_carbon_footprint_tons, power_source
- date_commissioned, solana_tx_hash
- monthly_operational_cost

### Feasibility Report (Claude-generated)
**Scorecard** (always generated):
- 6 scores (0-100): cost, power, cooling, latency, carbon, risk
- Overall feasibility rating (A-F)
- One-paragraph summary
- Estimated cost range, timeline

**Blueprint** (drill-down):
- Phased construction plan (timelines, milestones)
- Power sourcing strategy (grid mix, renewables, nuclear, solar for space)
- Cooling design (ambient, liquid, radiative for space)
- Network topology (fiber, satellite, laser links for space)
- Staffing and operations plan
- Detailed cost breakdown by phase
- Portfolio impact analysis (how this changes overall metrics)

---

## Challenge Mapping (10 challenges)

| # | Challenge | Prize | Integration |
|---|-----------|-------|-------------|
| Theme | Sustainability | €1,000 | Core: evaluating environmental impact of DC placement |
| 9 | Claude | $10,000 | Core: generates all reports, recommendations, chat |
| 14 | Best Use of Data | €7,000 | Core: real energy/climate/geography data -> decisions |
| 12 | Crusoe Inference | $5,000 | Claude runs on Crusoe clean-energy GPUs |
| 1 | Solana | €3,500 | Approved DC plans minted as on-chain portfolio records |
| 10 | Stripe | €3,000 | Payment per feasibility report (free scorecard, paid blueprint) |
| 11 | Rails | €2,000 | Rails backend (vibe-coded) |
| 4 | Lovable | €1,000 | Frontend built with Lovable (3D globe, dashboard, landing) |
| 13 | Paid | office+2yr | Usage-based metering, track value per report |
| 7 | Adaptable Agent | gift bags | AI adapts recs when inventory changes or prices shift |
| 8 | Consulting Agent | team lunch | AI acts as autonomous infrastructure consultant |
| **TOTAL** | | **~€30,500+** | |

---

## Demo Script (3 minutes)

1. **Open on the 3D globe** — Earth rotating with glowing hotspot markers. "This is Orbital Atlas."
2. **Show pre-loaded inventory** — "AcmeCorp has 5 data centers." Markers pulse on Virginia, Dublin, Singapore, Iceland, Sao Paulo. Dashboard shows portfolio stats.
3. **Click on a hotspot** (e.g., Reykjavik) — Scorecard slides in: cost A, power A, cooling A+, latency B, carbon A+, risk A. "Iceland scores 94/100."
4. **Drill down** — Full blueprint expands: geothermal power, ambient cooling, submarine cable routes, phased timeline, $X cost.
5. **Rotate to the Moon** — Click lunar south pole. Scorecard: cost F, power B (constant solar), cooling A+ (vacuum), latency D (1.3s), carbon A+, risk C. "Ambitious, but here's how you'd do it..."
6. **Ask the advisor** — Type "Where should AcmeCorp expand next for APAC redundancy with minimal carbon?" Claude recommends: #1 Tasmania, #2 Hokkaido, #3 Orbital. Shows reasoning against current portfolio.
7. **Approve Tasmania** — Added to inventory. Solana receipt minted (show tx). Stripe charges €XX. Portfolio dashboard updates: carbon footprint drops 30%, APAC latency halved.
8. **Close** — "Whether you're building in Dublin or on Mars, Orbital Atlas tells you exactly what it takes."

---

## Team Split (4 people, 48 hours)

### Person 1: Frontend (Lovable)
- 3D globe with Earth/Moon/Mars (using Lovable's 3D capabilities)
- Location hotspot markers, click-to-select interaction
- Scorecard + blueprint panels (slide-in UI)
- Chat interface panel
- Dashboard: inventory list, portfolio stats, comparison view
- Landing page
- Responsive layout: globe left, panels right

### Person 2: AI + Data (The Model)
- Curate the location dataset (~40 locations with real/researched metrics)
- Earth locations: real data from energy databases, climate data, connectivity maps
- Moon/Mars: researched estimates from NASA, ESA, SpaceX published data
- Design Claude prompts: scorecard generation, blueprint generation, recommendation engine, chat
- Structured tool definitions for Claude (fetch location, query inventory, compare)
- Test and iterate on report quality

### Person 3: Backend (Rails)
- Rails API: locations CRUD, inventory CRUD, report generation endpoint
- Claude integration via Crusoe inference API
- Stripe integration: checkout session per blueprint report
- Paid.ai integration: meter every report generated, track usage
- Authentication (simple — API key or session for demo)
- WebSocket or SSE for streaming Claude responses to chat

### Person 4: Blockchain + Integrations
- Solana program or client: mint portfolio records on-chain
- On-chain data: location, capacity, timestamp, feasibility score, report hash
- Wallet integration in frontend (Phantom or similar)
- Help P3 with Stripe/Paid wiring
- Help P1 with integrating 3D globe interactions with backend
- Integration testing across all services

---

## Data Sources for Location Dataset

### Earth (real data)
| Data Point | Source |
|-----------|--------|
| Energy prices | IEA, local utility rates, Electricity Maps |
| Carbon intensity | WattTime, Electricity Maps, Climate TRACE |
| Climate/temperature | NOAA, ERA5 climate reanalysis |
| Land costs | Commercial real estate databases, public records |
| Latency | Cloudflare/AWS region latency data |
| Natural disaster risk | UNDRR, Munich Re NatCat |
| Political stability | World Bank Governance Indicators |
| Connectivity | TeleGeography submarine cable map |

### Moon (researched estimates)
| Data Point | Source |
|-----------|--------|
| Construction cost | NASA Artemis estimates, ESA lunar base studies |
| Power | Constant solar at poles (~1.3kW/m2), no atmosphere |
| Cooling | Radiative cooling in vacuum, lunar night thermal cycling |
| Latency | 1.28 seconds (speed of light Earth-Moon) |
| Transport cost | SpaceX Starship ~$100-200/kg to lunar surface (projected) |

### Mars (researched estimates)
| Data Point | Source |
|-----------|--------|
| Construction cost | NASA Mars mission architecture studies |
| Power | Solar (~590W/m2) or nuclear (Kilopower reactor) |
| Cooling | Thin atmosphere, avg -60C, radiative |
| Latency | 4-24 minutes (varies with orbital position) |
| Transport cost | SpaceX Starship ~$500-1000/kg to Mars surface (projected) |

### Orbit (researched estimates)
| Data Point | Source |
|-----------|--------|
| Platform | Loon-style balloons (LEO) or satellite constellations |
| Power | Continuous solar in LEO |
| Cooling | Radiative panels, no convection |
| Latency | ~20-40ms LEO, ~600ms GEO |
| Cost | Satellite launch costs, SpaceX rideshare pricing |

---

## Tech Stack Summary

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Lovable (React) | Fast to build, 3D globe capability, challenge prize |
| 3D | Three.js (via Lovable) | Interactive Earth/Moon/Mars |
| Backend | Ruby on Rails | Challenge prize (€2k), vibe-codeable, convention-heavy |
| AI | Claude API via Crusoe | Best reasoning, challenge prizes |
| Payments | Stripe + Paid.ai | Per-report billing + usage metering |
| Blockchain | Solana (web3.js) | Portfolio records on-chain |
| Database | PostgreSQL | Standard Rails DB |
| Hosting | Fly.io or Railway | Quick Rails deployment |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Lovable can't do complex 3D interactions | High | Fall back to custom Three.js React component, use Lovable for everything else |
| Rails vibe-coding hits walls | Medium | Keep API surface small (~6 endpoints), use Rails generators heavily |
| Claude reports feel generic | Medium | Invest time in prompt engineering with real location data; few-shot examples |
| Solana integration takes too long | Low | Pre-build a simple mint script, mock wallet for demo if needed |
| Location data curation is slow | Medium | Start with 15 Earth + 3 Moon + 2 Mars, expand if time permits |
| Crusoe API key not approved | Medium | Fall back to direct Claude API, mention Crusoe in pitch anyway |

---

## MVP vs Stretch

### MVP (must ship)
- 3D globe with Earth + Moon (Mars can wait)
- 10-15 curated locations with real data
- Click -> scorecard generation via Claude
- Inventory: pre-seeded demo data + add/remove
- Chat advisor: basic Q&A
- Stripe: one payment flow
- Solana: mint one record

### Stretch (if time permits)
- Mars + orbital locations
- Full blueprint drill-down
- Comparison mode (side-by-side)
- Portfolio analytics dashboard
- Paid.ai metering
- Animated deployment visualization (build a data center on the Moon in real-time)
