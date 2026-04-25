# Deployment Guide — FairAudit

This guide walks you through a clean production deployment:

- **Backend (FastAPI + Postgres)** → Railway, via Docker
- **Frontend (Next.js)** → Vercel
- **Domain wiring** → CORS + HTTPS + WebSocket origins

Total time: ~20 minutes.

---

## 0. Prerequisites

| You need | How to get it |
|---|---|
| GitHub repo with this code | already pushed to `origin` |
| Railway account | <https://railway.app> (free trial covers boot, $5 Hobby plan recommended for sustained 2 GB RAM) |
| Vercel account | <https://vercel.com> |
| Railway CLI *(optional)* | `npm i -g @railway/cli` |
| Vercel CLI *(optional)* | `npm i -g vercel` |

The repo is already configured for both platforms:

- `backend/Dockerfile` — base image, system libs (cairo/pango for PDF), Python deps
- `backend/railway.toml` — Railway build/deploy/healthcheck config
- `frontend/vercel.json` — Vercel build/install config (uses `--legacy-peer-deps` for the `react-markdown` peer-range conflict with `eslint-config-next`)

---

## 1. Deploy the backend on Railway

### 1.1 Create the project

1. Go to <https://railway.app/new> → **Deploy from GitHub repo** → pick this repo.
2. When prompted for the service root, choose **`backend/`**. Railway auto-detects `railway.toml` + `Dockerfile`.
3. The first build takes ~10–15 min (heavy ML deps: `sdv`, `sentence-transformers`, `aif360`, `shap`).

### 1.2 Add managed Postgres

> SQLite on Railway is **ephemeral** — every redeploy wipes it. Always use Postgres in production.

1. In your project, click **+ New** → **Database** → **Add PostgreSQL**.
2. Railway auto-injects `DATABASE_URL` into the same project. **You must override it** so SQLAlchemy uses the async driver:

```text
DATABASE_URL=postgresql+asyncpg://${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
```

(Railway resolves the `${{Postgres.…}}` references automatically. Paste it as one line.)

### 1.3 Set the rest of the env vars

In your backend service → **Variables**:

| Key | Value |
|---|---|
| `SECRET_KEY` | run `python -c "import secrets; print(secrets.token_hex(32))"` and paste |
| `ENVIRONMENT` | `production` |
| `CORS_ORIGINS` | `https://your-app.vercel.app` *(no trailing slash; comma-separate multiple)* |
| `MAX_UPLOAD_SIZE_MB` | `10` |
| `DATASET_STORAGE_DIR` | `/data` *(only if you attach a Volume — see 1.4)* |

`PORT` is injected by Railway automatically — do not set it manually.

### 1.4 (Optional) Persistent uploads

Uploaded CSVs are needed by causal / recourse / synthetic re-runs. The container filesystem is wiped on every deploy, so for a long-lived deployment:

1. Service → **Volumes** → **+ New Volume** → mount path `/data`.
2. Set `DATASET_STORAGE_DIR=/data`.

### 1.5 Verify

After deploy, Railway shows a public URL like `https://fairaudit-backend.up.railway.app`. Verify:

```bash
curl https://fairaudit-backend.up.railway.app/health
# → {"status":"ok"}
```

If `/health` 502s, check **Deployments → Logs** for `Application startup complete.` Failures usually mean:

- `SECRET_KEY` not set → boot error
- `DATABASE_URL` still `postgresql://...` → SQLAlchemy demands `+asyncpg`
- OOM during startup → upgrade to Hobby ($5) for 2 GB RAM

### 1.6 Reset the database (when you want a clean slate)

Migrations run on every deploy via `alembic upgrade head`. To wipe everything:

```bash
# Option A — using Railway shell (Service → ⋯ → Connect)
railway run python -c "from database import engine, Base; import asyncio; \
  asyncio.run((lambda: engine.begin().__aenter__())()); \
  print('manually drop via psql is faster, see Option B')"

# Option B — recommended
railway connect Postgres   # opens psql
> DROP SCHEMA public CASCADE; CREATE SCHEMA public;
> \q
# then redeploy, alembic re-creates the schema
```

---

## 2. Deploy the frontend on Vercel

### 2.1 Import the project

1. Go to <https://vercel.com/new> → **Import Git Repository** → pick the same repo.
2. **Root directory**: `frontend/`. Vercel reads `vercel.json` — Framework auto-detected as Next.js, install runs with `--legacy-peer-deps`.
3. Don't deploy yet — set env vars first (next step).

### 2.2 Set env vars

Vercel → **Settings → Environment Variables**, add to **all environments**:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://fairaudit-backend.up.railway.app` |
| `NEXT_PUBLIC_WS_URL` | `wss://fairaudit-backend.up.railway.app` *(note `wss`, not `ws`)* |

Both keys must be `NEXT_PUBLIC_*` so they're inlined into the client bundle at build time.

### 2.3 Deploy

Click **Deploy**. First build takes ~2 min. Verify:

- Open `https://your-app.vercel.app` → upload a CSV → analysis completes
- Sidebar shows all routes (`/dashboard`, `/intersectional`, `/causal`, `/recourse`, `/synthetic`, `/compliance`, `/model-card`, `/lineage`, `/monitor`, `/reports`)
- `/monitor` connects to the live WebSocket (no console errors about ws://)

### 2.4 Wire the domains together

Once Vercel gives you the final URL:

1. Go back to Railway → backend → Variables → update `CORS_ORIGINS=https://your-app.vercel.app` (and any custom domain).
2. Railway redeploys automatically (~30 s).

---

## 3. Custom domains (optional)

### Frontend

Vercel → **Settings → Domains** → add `fairaudit.example.com`. DNS: `CNAME → cname.vercel-dns.com`.

### Backend

Railway → **Settings → Networking → Public Networking → + Custom Domain** → `api.fairaudit.example.com`. DNS: `CNAME → <generated railway target>`.

After both resolve, update `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` to use the custom domains.

---

## 4. Post-deploy checklist

- [ ] `GET /health` returns `200 ok`
- [ ] `POST /auth/register` succeeds, JWT returned
- [ ] CSV upload through the UI completes (`/analyze`)
- [ ] Dashboard renders bias metrics
- [ ] WebSocket on `/monitor` stays connected (no `wss` cert errors)
- [ ] Model card preview renders markdown
- [ ] Synthetic data download produces a valid CSV
- [ ] Compliance accordion expands per regulation
- [ ] Vercel build log shows zero TypeScript errors
- [ ] Railway logs show `Application startup complete.` and no `bcrypt` warnings

---

## 5. Common pitfalls

| Symptom | Fix |
|---|---|
| Vercel build: `ERESOLVE could not resolve … react-markdown` | Confirm `vercel.json` has `installCommand: npm install --legacy-peer-deps` |
| Railway boot: `SECRET_KEY environment variable is required` | Set `SECRET_KEY` in Railway variables |
| Railway boot: `sqlalchemy.exc.NoSuchModuleError: postgresql.asyncpg` | Use `postgresql+asyncpg://...` (not `postgresql://...`) in `DATABASE_URL` |
| Frontend → backend: CORS error in browser | `CORS_ORIGINS` doesn't match the actual Vercel domain (case-sensitive, no trailing slash) |
| `/monitor` WebSocket fails | Use `wss://` (not `ws://`) for the production `NEXT_PUBLIC_WS_URL` |
| Railway memory OOMs during model load | Upgrade to Hobby plan (2 GB RAM); SDV + sentence-transformers won't fit in 512 MB |
| Uploads disappear after redeploy | Attach a Volume + set `DATASET_STORAGE_DIR=/data` |
| Migrations not running | Confirm `startCommand` in `railway.toml` still has `alembic upgrade head &&` |

---

## 6. Local-first dev (for reference)

```bash
# Backend
cd backend
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env  # then edit SECRET_KEY etc.
./start_dev.sh        # uvicorn on http://localhost:8000

# Frontend
cd frontend
npm install --legacy-peer-deps
cp .env.local.example .env.local
npm run dev           # http://localhost:3000
```

That's it. If something breaks in production that doesn't break locally, the difference is almost always one of the env vars in section 1.3 / 2.2.
