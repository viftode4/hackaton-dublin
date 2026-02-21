# Quick Start - Orbital Atlas Backend

**Current State: 90% Complete** | Ruby 4.0.1 | Rails 7.1 | SQLite3

---

## Get Running (5 minutes - WSL2 Route)

```powershell
# 1. In Windows PowerShell (Admin):
wsl --install ubuntu
# Restart and reopen

# 2. In WSL terminal:
cd /mnt/c/Users/cpetr/Desktop/'HackEurope Dublin'/hackaton-dublin/backend
sudo apt update && sudo apt install -y ruby-full build-essential libsqlite3-dev
ruby --version  # Should be 3.x+

# 3. Install Ruby dependencies:
bundle install

# 4. Setup database:
rails db:create db:migrate db:seed

# 5. Start server:
rails s
```

Server running on **http://localhost:3000**

---

## Test It

```bash
# Get all locations (14+)
curl http://localhost:3000/api/locations | jq

# Get one location
curl http://localhost:3000/api/locations/iceland-reykjavik | jq

# Get all inventories
curl http://localhost:3000/api/inventories | jq

# Create a data center
curl -X POST http://localhost:3000/api/inventories \
  -H "Content-Type: application/json" \
  -d '{
    "location_id": "singapore-tuas",
    "name": "APAC Hub",
    "capacity_mw": 75,
    "workload_types": ["WEB_SERVING"],
    "utilization_pct": 60,
    "power_source": "grid"
  }' | jq
```

---

## What's Working

✓ **Locations API** — GET endpoints working, 14+ locations loaded  
✓ **Inventories API** — Full CRUD (Create, Read, Update, Delete)  
✓ **Database** — SQLite3, migrations ready, 5 demo records seeded  
✓ **CORS** — Frontend can call backend  
✓ **Error Handling** — Proper JSON error responses  

---

## What's Pending

⚠ **Reports/Advisor** — Endpoints exist but return placeholders (waiting for P2 Claude implementation)  
⚠ **Payments** — Stripe integration needs real API key  
⚠ **Portfolio** — Analytics endpoint needs calculation logic  
⚠ **Solana** — Blockchain mint needs P4 integration  

---

## Key Files

- **app/controllers/api/\*.rb** — 7 API controllers
- **app/models/inventory.rb** — Data center model
- **app/services/location_service.rb** — Location data loader
- **data/locations/\*.json** — 14+ location records
- **config/routes.rb** — All endpoints mapped
- **STATUS.md** — Detailed current state
- **INTEGRATION_WORKFLOW.md** — Phase-by-phase guides for P1/P2/P4

---

## Next Steps

1. **Get running** → Follow steps above
2. **P2:** Implement ClaudeService (replace TODO methods in `app/services/claude_service.rb`)
3. **P4:** Integrate Solana service (add real call in `app/controllers/api/solana_controller.rb`)
4. **Backend:** Implement Portfolio analytics
5. **All:** Test end-to-end

---

## Troubleshooting

**"Bundle install fails on Windows?"**  
→ Use WSL2 (instructions above) — fastest way

**"Can't connect to database?"**  
→ Run `rails db:create db:migrate` first

**"API returning 404?"**  
→ Check routes: `rails routes | grep api`

**"Locations not loading?"**  
→ Check `data/locations/` JSON files exist and are valid JSON

---

See **STATUS.md** for full details.
