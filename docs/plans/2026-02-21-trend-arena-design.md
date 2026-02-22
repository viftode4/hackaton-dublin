# HaxBet — Design Document

> AI-powered idea market where news becomes opportunities, crowds bet on startup ideas, and the market decides what's worth building.

**Pitch**: "Upvotes are cheap. Bets are honest. We built the stock market for startup ideas."

---

## Core Concept

AI scrapes real-time news, Twitter, HackerNews. Extracts "opportunity cards" — problems + evidence. Players pitch startup ideas against those opportunities. Everyone bets HaxCoins on which ideas will win. Price moves based on demand. AI provides live analyst commentary. The market decides what's valuable.

---

## Game Loop

```
SCRAPE → EXTRACT → PITCH → BET → TRADE → EARN

1. AI scrapes news/Twitter/HN continuously
2. AI extracts Opportunity Cards (problem + evidence + market size)
3. Players pitch a startup idea (280 chars max, linked to a card/track)
4. Each idea becomes a "stock" at 1 HaxCoin starting price
5. Everyone gets 100 HaxCoins — buy/sell shares
6. Price moves via bonding curve — more buys = higher price
7. Holders earn 5% dividend from every new purchase
8. AI provides live analyst commentary every 6-7 seconds
9. Continuous market — no rounds, always live
10. Leaderboard updates every 2 seconds
```

**There are no rounds.** The market runs continuously. Leaderboard is always live. Players can buy, sell, pitch, and comment at any time.

---

## Auth

- **Username + password + table number** — simple signup form
- Table number = your hackathon team (e.g. Table 7)
- JWT token in localStorage for session
- If same username logs in from another device → first session gets kicked
- Table grouping enables team leaderboard ("Table 7 is dominating")

---

## Market Mechanics

### Bonding Curve Pricing

```
price = base_price + (total_shares_sold × increment)

Example (increment = €0.10):
  Share #1:  €1.00
  Share #2:  €1.10
  Share #3:  €1.20
  ...
  Share #20: €2.90

Selling reverses: price drops as shares are returned.
```

### Holder Dividends

```
On every new purchase:
  5% → split among ALL existing holders (proportional to shares held)
  95% → goes into the bonding curve

Effect: early believers earn passive income as idea gains traction
```

### Five Rules (the entire system)

1. Buy shares → price goes up
2. Sell shares → price goes down
3. Hold shares → earn 5% of every new purchase (split among holders)
4. Portfolio value = (shares × current price) + dividends earned
5. Highest portfolio wins (continuous, no rounds)

### Two Playstyles

- **Holders**: Find ideas early, hold, earn dividends passively
- **Traders**: Buy hype, sell at peak, move to the next one

Both are valid. The tension between them creates drama.

---

## AI System

### Data Sources (hackathon scope)

| Source | What it gives | API |
|--------|--------------|-----|
| NewsAPI / GNews | Headlines + articles from 80k+ sources | Free tier, REST |
| HackerNews | Tech trends, what devs care about | Free, no auth |
| Reddit | Niche community signals | Free API |
| Twitter/X | Trending topics, viral takes | Rapid API / Apify |

### Opportunity Card Generation

Claude processes raw news and outputs structured cards:
- **Problem**: what's broken / changing
- **Evidence**: the news/data backing it
- **Market size estimate**: how big is this
- **Urgency score**: why now

### Duplicate / Similarity Detection

When a new idea is submitted, Claude compares against existing ideas:
- **Novel** → new idea enters the market at €1.00
- **Similar** → user is shown the match, can back existing idea or differentiate
- **Duplicate** → auto-merge, user becomes a backer

### AI Analyst Panel (live commentary)

Four rotating personas to avoid repetition:

| Persona | Role |
|---------|------|
| 🐻 The Bear | Skeptic. Finds risks, competitors, reasons it'll fail |
| 🐂 The Bull | Optimist. Finds opportunity, market gaps, timing advantages |
| 📊 The Quant | Data-driven. Search volume, market size, growth trends |
| 🤡 The Heckler | Comic relief. Pop culture refs, historical failures, spicy takes |

### Commentary Rules

- **Event-driven only** — AI speaks when something happens, never generates filler
- **Batched every 6-7 seconds** — accumulate events/comments, synthesize one response
- **Max 15 words per comment** — forces variety and punchiness
- **Context-aware** — references other ideas, bet patterns, real news, user comments
- **Never repeats** — prompt includes last 5 comments, instructed to never reuse phrases

### Event Triggers

```
Price crosses round number (€2, €3...)  → commentary
3+ people buy/sell at once              → commentary
Idea overtakes another on leaderboard   → commentary
New idea submitted                      → commentary
Cluster of user comments detected       → synthesized response
Price crashes below €1                  → commentary
AI finds breaking news related to idea  → commentary
```

### User Comment Processing

```
Second 0-6:   User comments accumulate
Second 6:     AI batches comments, clusters by theme
              - Ignores low-effort (emoji, "lol", "nice")
              - Groups: concerns, comparisons, opportunities
              - Rates overall sentiment (bullish/bearish, 1-10)
Second 7:     Posts synthesized analysis to feed
              AI does NOT move the price — only users buy/sell
              AI's rating is a signal that PERSUADES users to act
```

---

## Early Mover Advantage

Ideas submitted early get natural advantages:
- More time on feed = more eyeballs = more potential buyers
- Price history graph shows growth (looks mature vs "just submitted")
- AI has had time to find deeper research (5 articles vs 1)
- Bonding curve means early shares are cheapest
- Holders earn dividends from every subsequent buyer

Submitters auto-hold their own idea → every new backer earns them dividends.

---

## Hackathon Framing

### For the Presentation

Platform is live BEFORE the demo. Seeded with real ideas. By demo time:

> "This platform has been live for 12 hours. 47 ideas submitted.
> €23,000 in HaxCoins traded. Here's what the crowd thinks is
> the #1 opportunity right now — live."

### Demo Script (3 minutes)

1. **Open**: "Raise your hand if you've pitched an idea and gotten polite nodding but no honest feedback."
2. **Show**: Live leaderboard — ideas already trading, prices moving
3. **Interact**: "Open [url] on your phone. You have €100. Pick a track. Pitch an idea or bet on one."
4. **Watch**: Live on screen — prices move, AI commentary fires, leaderboard reshuffles
5. **Close**: "That idea didn't exist 2 minutes ago. The market says it's worth €3.40. Upvotes are cheap. Bets are honest."

### Track Integration

Hackathon tracks become market categories:
- Security Market
- Sustainability Market
- FinTech Market
- Agentic AI Market

Players submit ideas under a track. Can browse/bet across all tracks.

---

## UI Screens

### Main Feed (the trading floor)

```
┌─────────────────────────────────────────────────┐
│  HAXBET                    Portfolio: €142  │
├─────────────────────────────────────────────────┤
│  📈 LEADERBOARD                                 │
│  #1  🚀 AI Fitness Coach     €4.20 ↑  (14 hdl) │
│  #2  📦 Carbon Food Tracker  €3.80 ↑  (11 hdl) │
│  #3  🔍 Deepfake Detector    €2.10 ↓  (6 hdl)  │
│  #4  🏥 Hospital Queue       €1.40 ↑  (3 hdl)  │
├─────────────────────────────────────────────────┤
│  💬 LIVE FEED                                   │
│  14:42 📊 Quant: "Carbon tracker search volume   │
│         up 340% this month"                      │
│  14:43 🐂 Bull: "#4 got 3 backers in 10 sec"    │
│  14:43 🐻 Bear: "Momentum ≠ moat"               │
│  14:44 💬 @mike: "What about liability?"         │
│  14:45 🚨 UPSET: AI Fitness overtakes Carbon!    │
├─────────────────────────────────────────────────┤
│  [Submit Idea]  [Browse Tracks]  [My Portfolio]  │
└─────────────────────────────────────────────────┘
```

### Idea Detail Page

```
┌─────────────────────────────────────────────────┐
│  AI Fitness Coach                    €4.20 ↑12% │
│  by @sara — submitted 2h ago                     │
│  Track: Agentic AI                               │
│                                                  │
│  "AI coach that adapts workout plans in          │
│   real-time based on injury history and           │
│   biometric data from wearables"                 │
│                                                  │
│  📊 14 holders · 47 trades · €89 volume          │
│  📈 [price chart over time]                      │
│                                                  │
│  🔬 AI ANALYSIS: 8/10 bullish                    │
│  "Insurance angle strong. Peloton comparison     │
│   is weak — they had no personalization."         │
│                                                  │
│  💬 COMMENTS (12)                                │
│  @mike: "Liability concerns?"                    │
│  @alex: "Insurance companies would pay for this" │
│                                                  │
│  [BUY €1.20/share]  [SELL]  [COMMENT]            │
│                                                  │
│  💰 Your position: 5 shares · Dividends: €1.20   │
└─────────────────────────────────────────────────┘
```

### Portfolio Page

```
┌─────────────────────────────────────────────────┐
│  YOUR PORTFOLIO                     Total: €142  │
│  💰 Passive income: +€0.14/min                   │
├─────────────────────────────────────────────────┤
│  AI Fitness Coach  5sh @€1.00  Now:€4.20  +€5.20│
│  Carbon Tracker    2sh @€2.10  Now:€2.80  +€1.70│
│  Cash: €38.40                                    │
├─────────────────────────────────────────────────┤
│  LEADERBOARD                                     │
│  #1 @mike  €340  — early on AI Fitness           │
│  #2 @sara  €280  — diversified, 3 winners        │
│  #3 YOU    €142  — holding strong                 │
└─────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Tool | Why |
|-------|------|-----|
| Frontend | Next.js + Tailwind | Real-time updates, fast, deployable |
| Backend | Python FastAPI | Scraping + AI orchestration + market engine |
| AI | Claude API | Trend extraction, similarity, analyst commentary |
| DB | Convex | Free, real-time by default, no subscription wiring needed |
| Payments | Stripe (test mode) | Deposit/withdraw HaxCoins (or real for demo) |
| Data | NewsAPI + HN API + Reddit | Trend fuel |
| Deploy | Vercel (FE) + Railway (BE) | Free tiers, fast deploy |
| Optional | Lovable | Vibe-code the frontend fast |

---

## Challenge Stacking

| Challenge | How it fits | Prize |
|-----------|------------|-------|
| Claude | The entire brain — scraping, analysis, commentary, similarity | $10,000 |
| Best Use of Data | Raw news → structured opportunities → crowd predictions → market signal | €7,000 |
| Stripe | Payment integration for bets/deposits | €3,000 |
| FinTech theme | Literally a financial market for ideas | €1,000 |
| Adaptable Agent | AI re-evaluates as new news/comments/bets arrive | Gift bags |
| Lovable | Frontend built on Lovable | €1,000 |
| Paid | Track value generated per AI analysis | Office + 2yr |

**Total potential: ~€22,000+**

Optional adds:
- Solana (€3,500) — on-chain bet settlement / idea NFTs
- ElevenLabs (AirPods) — voice narration of market events

---

## Team Split (4 people, 36-48h)

| Person | Owns | Day 1 | Day 2 |
|--------|------|-------|-------|
| A — AI/Backend | Claude + market engine | News scraping pipeline, opportunity card generation, similarity detection | Analyst personas, comment batching, event-driven commentary |
| B — Frontend | UI + real-time | Main feed, leaderboard, idea cards, price display | Portfolio page, charts, animations, mobile responsive |
| C — Market/Infra | Trading engine + DB | Bonding curve math, buy/sell logic, dividend distribution, Supabase schema | Real-time subscriptions, Stripe integration, deploy |
| D — Demo/UX | Design + pitch | UI design, copy, opportunity card format, seed content | Demo script, presentation slides, live testing, pitch practice |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Bonding curve math bugs | Keep it linear, test with simulations before demo |
| AI commentary gets repetitive | 4 personas + 15-word limit + recent history in prompt |
| Not enough users during demo | Seed with ideas + bots that simulate trading before demo |
| Real-time updates lag | Convex is real-time by default; no extra wiring needed |
| News APIs rate limited | Cache aggressively, pre-scrape before demo |
| Scope creep | MVP = submit idea + buy/sell + leaderboard + AI feed. Everything else is nice-to-have |

---

## MVP vs Nice-to-Have

### MVP (must ship)
- [ ] Opportunity cards from news (can be pre-generated)
- [ ] Submit idea (280 chars, pick a track)
- [ ] Buy/sell shares (bonding curve)
- [ ] Holder dividends (5% distribution)
- [ ] Live leaderboard (price-ranked)
- [ ] AI analyst feed (event-driven, 4 personas)
- [ ] User comments (batched, AI-synthesized)
- [ ] Portfolio page
- [ ] Player leaderboard

### Nice-to-have
- [ ] Real-time price charts per idea
- [ ] Auto-generated landing page for winning idea
- [ ] ElevenLabs voice narration
- [ ] Solana on-chain settlement
- [ ] Stripe real money mode
- [ ] Historical round replays
