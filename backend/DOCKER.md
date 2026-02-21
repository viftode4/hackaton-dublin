# Docker Development Guide

**TL;DR:**
```bash
docker-compose build   # One time
docker-compose up      # Development server
docker-compose down    # Stop
```

---

## First-Time Setup

### 1. Install Docker

**Windows:**
```powershell
# Download Docker Desktop: https://docs.docker.com/desktop/install/windows-install/
# Run installer, restart computer
docker --version  # Verify installation
```

**macOS:**
```bash
# Download Docker Desktop: https://docs.docker.com/desktop/install/mac-install/
# Run installer
docker --version  # Verify installation
```

### 2. Build Image

```bash
cd backend
docker-compose build
```

This:
- Pulls Ruby 4.0 Alpine base image (~200MB)
- Installs system dependencies (SQLite, build tools)
- Bundles all Ruby gems
- Takes 10-15 min on first run, then cached

### 3. Start Server

```bash
docker-compose up
```

This:
- Creates and starts the container
- Mounts local code as a volume (changes auto-reflect)
- Seeds database on first run
- Starts Rails on port 3000

You'll see output like:
```
backend_1  | * Rails 7.1.6 application starting in development
backend_1  | * Listening on http://0.0.0.0:3000
```

### 4. Test

```bash
# In another terminal
curl http://localhost:3000/api/locations
```

---

## Common Commands

### Development Workflow

```bash
# See logs
docker-compose logs -f

# Run a Rails command
docker-compose exec backend rails routes

# Open Rails console
docker-compose exec backend rails console

# Create migrations
docker-compose exec backend rails generate migration AddFieldToTable

# Run migrations
docker-compose exec backend rails db:migrate

# Seed data
docker-compose exec backend rails db:seed

# Stop server (keep container)
docker-compose stop

# Stop and remove container
docker-compose down

# Remove all containers + volumes (full reset)
docker-compose down -v
```

### Debugging

```bash
# See running containers
docker-compose ps

# View container logs
docker-compose logs backend

# Follow logs in real-time
docker-compose logs -f backend

# SSH into container
docker-compose exec backend bash

# Rebuild (if Gemfile changed)
docker-compose build --no-cache
docker-compose up
```

---

## File Changes Reflected Automatically

Your local machine `backend/` directory is mounted in the container at `/app`.

**This works:**
- Edit a controller file locally → Changes appear in container instantly
- Refresh browser → New code loads automatically (Rails reloader)
- Edit Gemfile locally → Need to `docker-compose build` + restart

---

## Database

**Location:** `backend/db/development.sqlite3`

**Create fresh:**
```bash
docker-compose down -v       # Remove volume
docker-compose up            # Recreates and seeds
```

**Inspect:**
```bash
docker-compose exec backend sqlite3 db/development.sqlite3
sqlite> SELECT * FROM inventories;
sqlite> .tables
```

---

## Environment Variables

In `docker-compose.yml`, modify the `environment:` section to add API keys:

```yaml
services:
  backend:
    ...
    environment:
      - RAILS_ENV=development
      - DATABASE_URL=sqlite3:///app/db/development.sqlite3
      - STRIPE_SECRET_KEY=sk_...  # Add your keys here
      - ANTHROPIC_API_KEY=sk-...
```

Or create `.env` file in backend directory (loaded by dotenv-rails):
```
STRIPE_SECRET_KEY=sk_...
ANTHROPIC_API_KEY=sk-...
```

---

## Performance

- **Container startup:** ~3-5 sec
- **Gem install (first time):** ~5-10 min (cached after)
- **Rails request:** Same as local (~100-500ms depending on load)
- **Code reload:** Instant (Rails watches for changes)

---

## Troubleshooting

### "Docker command not found"
→ Install Docker Desktop, restart terminal

### "Port 3000 already in use"
→ `docker-compose down` or change port in docker-compose.yml:
```yaml
ports:
  - "3001:3000"  # Access on localhost:3001
```

### "Gem install fails in build"
→ `docker-compose build --no-cache` (skip Docker's layer cache)

### "Database error: sqlite3 not found"
→ This is handled in Dockerfile, shouldn't happen. Try:
```bash
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

### "Can't reach localhost:3000"
→ Check `docker-compose ps` — backend service running?
```bash
docker-compose logs backend  # See error messages
```

### "Changes not reflecting"
→ Check: Did you save the file? Your file system might have sync issues.
```bash
docker-compose restart backend  # Force restart
```

---

## Multiple Services (Future)

When you add PostgreSQL or other services:

```yaml
services:
  db:
    image: postgres:15
    volumes:
      - postgres:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: orbital
      POSTGRES_PASSWORD: dev

  backend:
    depends_on:
      - db
    environment:
      DATABASE_URL: postgres://postgres:dev@db:5432/orbital
```

Then `docker-compose up` starts both.

---

## Production Deployment

Docker makes deployment simple:

```bash
# Push image to registry (Docker Hub, ECR, etc.)
docker tag orbital-atlas-backend:latest myrepo/orbital-atlas:latest
docker push myrepo/orbital-atlas:latest

# On server, run:
docker run -p 3000:3000 \
  -e RAILS_ENV=production \
  -e DATABASE_URL=postgres://... \
  myrepo/orbital-atlas:latest
```

---

## Next Steps

1. Run Docker setup above
2. Verify endpoints work: `curl http://localhost:3000/api/locations`
3. Make code changes locally
4. Restart container if needed (`docker-compose restart`)
5. See INTEGRATION_WORKFLOW.md for how other teams integrate

---

**Happy developing! 🐳**
