# Deployment Guide — FairAudit

This guide walks you through a clean production deployment:

- **Backend (FastAPI + Postgres)** → **Railway**, via Docker
- **Frontend (Next.js)** → **Vercel**
- **Domain wiring** → CORS + HTTPS + WebSocket origins

Total time: ~20 minutes.

The image was deliberately slimmed (CPU-only torch via `Dockerfile`,
`backend/.dockerignore` excluding `.venv` / caches) to fit Railway's plan
limits. Final image is ~3.5 GB instead of the default ~5–6 GB.

---

## 0. Prerequisites

| You need | How to get it |
|---|---|
| GitHub repo with this code | already pushed to `origin` |
| Railway account | <https://railway.app> ($5 Hobby plan recommended — Trial may OOM during model load) |
| Vercel account | <https://vercel.com> (Hobby tier is free) |

The repo is pre-configured for both platforms:

- `backend/Dockerfile` — Python 3.11-slim, system libs (cairo/pango for PDF), CPU-only torch pre-installed
- `backend/.dockerignore` — keeps `.venv/`, caches, and DB files out of the build context (saves ~3 GB)
- `backend/railway.toml` — **forces the Dockerfile builder** (without this, Railway falls back to nixpacks and complains `Script start.sh not found`)
- `frontend/vercel.json` — installs with `--legacy-peer-deps` to handle the `react-markdown` ↔ `eslint-config-next` peer-range conflict

The backend auto-rewrites `postgres://` (legacy) and bare `postgresql://` URLs
to `postgresql+asyncpg://`, so you don't have to edit the Postgres URL by hand.

---

## ⚠ Fixing `Script start.sh not found`

If Railway shows this warning, the service is using **nixpacks** instead of
**dockerfile**. Cause: the service was created before `railway.toml` existed,
or Railway's auto-detection didn't see the file.

Fix in the Railway dashboard, in this exact order:

1. Service → **Settings** → **Source** → confirm **Root Directory** is set to
   `backend` *(not the repo root, not `/`)*.
2. Service → **Settings** → **Build** → **Builder** = **Dockerfile**
   (the dropdown). If you see a "Build Command" field, leave it empty.
3. Service → **Settings** → **Deploy** → **Custom Start Command** = leave empty
   (let the Dockerfile's `CMD` run).
4. Click **Redeploy**.

After this, builds run from `backend/Dockerfile` and the `start.sh` warning
disappears for good.

If the dropdown still shows "Nixpacks" after the changes, you have a stale
service. Easiest fix: **+ New** → **GitHub Repo** → select this repo → set
Root Directory = `backend` *during creation* — Railway then reads
`railway.toml` on first deploy and never tries nixpacks.

---

## 1. Deploy the backend on Railway

### 1.1 Create the project

1. Go to <https://railway.app/new> → **Deploy from GitHub repo** → pick this repo.
2. **Important:** when prompted for the service root, choose **`backend`**
   (not the repo root). Railway auto-detects `railway.toml` + `Dockerfile`.
3. The first build takes ~10–15 min — the heavy ML deps (`sdv`,
   `sentence-transformers`, `aif360`, `shap`) compile / download.

### 1.2 Add managed Postgres

> SQLite on Railway is **ephemeral** — every redeploy wipes it. Use Postgres in production.

1. In your project, click **+ New** → **Database** → **Add PostgreSQL**.
2. Railway auto-injects `DATABASE_URL` into the same project as
   `postgresql://USER:PASS@HOST:PORT/DB`. The backend's `database.py`
   auto-rewrites that to `postgresql+asyncpg://...` on boot, so you can
   leave the variable as-is.

   *(If you previously hand-edited `DATABASE_URL` to `postgresql+asyncpg://`,
   that's also fine — the rewrite is idempotent.)*

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
`DATABASE_URL` is wired automatically by the Postgres add-on.

### 1.4 (Optional) Persistent uploads

Uploaded CSVs are needed by causal / recourse / synthetic re-runs. The
container filesystem is wiped on every deploy, so for a long-lived deployment:

1. Service → **Volumes** → **+ New Volume** → mount path `/data`.
2. Set `DATASET_STORAGE_DIR=/data`.

### 1.5 Verify

After deploy, Railway shows a public URL like
`https://fairaudit-backend.up.railway.app`. Smoke-test it:

```bash
curl https://fairaudit-backend.up.railway.app/health
# → {"status":"ok"}
```

If `/health` 502s, check **Deployments → Logs** for `Application startup
complete.` Common boot failures:

- `SECRET_KEY environment variable is required` → set `SECRET_KEY` in
  Railway variables
- `sqlalchemy.exc.NoSuchModuleError: postgresql.asyncpg` → you're on an old
  commit; pull `main` (the URL coercion lives in `backend/database.py`)
- OOM during startup → upgrade to Hobby plan ($5) for 2 GB RAM. SDV +
  sentence-transformers won't fit in Trial's 512 MB

### 1.6 Reset the database (when you want a clean slate)

```bash
railway connect Postgres   # opens psql against the managed DB
> DROP SCHEMA public CASCADE; CREATE SCHEMA public;
> \q
```

Next backend deploy auto-runs `alembic upgrade head` and rebuilds the schema.

### 1.7 If the image is still too big

Railway's image cap depends on plan. If you hit a size error, the cheapest
cut is removing the two largest optional engines:

```diff
# backend/requirements.txt
- sdv==1.9.0
- sentence-transformers==3.0.1
+ # sdv and sentence-transformers removed for image-size budget; the
+ # synthetic-data and regulatory-NLP engines fall back gracefully.
```

That alone drops ~2 GB. Both `synthetic_engine.py` and the regulatory NLP
path have graceful fallbacks, so the API still serves all endpoints.

---

## 2. Deploy the frontend on Vercel

### 2.1 Import the project

1. Go to <https://vercel.com/new> → **Import Git Repository** → pick the same repo.
2. **Root directory**: `frontend/`. Vercel reads `vercel.json` — Framework
   auto-detected as Next.js, install runs with `--legacy-peer-deps`.
3. Don't deploy yet — set env vars first (next step).

### 2.2 Set env vars

Vercel → **Settings → Environment Variables**, add to **all environments**:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://fairaudit-backend.up.railway.app` |
| `NEXT_PUBLIC_WS_URL` | `wss://fairaudit-backend.up.railway.app` *(note `wss`, not `ws`)* |

Both keys must be `NEXT_PUBLIC_*` so they're inlined into the client bundle
at build time.

### 2.3 Deploy

Click **Deploy**. First build takes ~2 min. Verify:

- Open `https://your-app.vercel.app` → upload a CSV → analysis completes
- Sidebar shows all routes (`/dashboard`, `/intersectional`, `/causal`,
  `/recourse`, `/synthetic`, `/compliance`, `/model-card`, `/lineage`,
  `/monitor`, `/reports`)
- `/monitor` connects to the live WebSocket (no console errors)

### 2.4 Wire CORS

Now go back to Railway → backend → Variables → set:

```text
CORS_ORIGINS=https://your-app.vercel.app
```

(no trailing slash; comma-separate multiple). Railway redeploys
automatically in ~30 s.

---

## 3. Custom domains (optional)

### Frontend

Vercel → **Settings → Domains** → add `fairaudit.example.com`. DNS:
`CNAME → cname.vercel-dns.com`.

### Backend

Railway → **Settings → Networking → Public Networking → + Custom Domain** →
`api.fairaudit.example.com`. DNS: `CNAME → <generated railway target>`.

After both resolve, update `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` /
`NEXT_PUBLIC_WS_URL` to use the custom domains.

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
| Railway: `Script start.sh not found` | Service is using nixpacks. See the ⚠ section above — set Root Directory to `backend`, set Builder to "Dockerfile" |
| Vercel build: `ERESOLVE could not resolve … react-markdown` | Confirm `vercel.json` has `installCommand: npm install --legacy-peer-deps` |
| Railway: `Image size exceeded` | See §1.7 — drop `sdv` + `sentence-transformers`, or upgrade plan |
| Railway boot: `SECRET_KEY environment variable is required` | Set `SECRET_KEY` in Railway variables |
| Railway boot: `sqlalchemy.exc.NoSuchModuleError: postgresql.asyncpg` | Pull `main` — `database.py` auto-rewrites `postgres://` and `postgresql://` to the asyncpg form |
| Frontend → backend: CORS error in browser | `CORS_ORIGINS` doesn't match the actual Vercel domain (case-sensitive, no trailing slash) |
| `/monitor` WebSocket fails | Use `wss://` (not `ws://`) for the production `NEXT_PUBLIC_WS_URL` |
| Railway memory OOMs during model load | Upgrade to Hobby plan ($5, 2 GB RAM); SDV + sentence-transformers won't fit in Trial's 512 MB |
| Uploads disappear after redeploy | Attach a Volume → set `DATASET_STORAGE_DIR=/data` |
| Migrations not running | Confirm Dockerfile's `CMD` still has `alembic upgrade head &&` |

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

That's it. If something breaks in production that doesn't break locally,
the difference is almost always one of the env vars in section 1.3 / 2.2
or the `start.sh / nixpacks` issue from the warning section above.
