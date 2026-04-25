# DasViewer(ProtoType)

> End-to-end fairness auditing for tabular ML datasets — bias detection, intersectional analysis, causal attribution, individual recourse, synthetic data generation, regulatory compliance checks, auto-generated model cards, and data-pipeline lineage tracking — all behind a clean Next.js UI.

Upload a CSV, get an audit. The system auto-detects the label column and protected attributes, computes group-level fairness metrics (disparate impact, statistical parity, accuracy gaps), and walks through eight distinct analyses without any manual schema configuration.

| Layer | Stack |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind, Framer Motion, Recharts, react-markdown |
| Backend | FastAPI, SQLAlchemy 2 (async), Alembic, JWT auth, slowapi rate-limiting |
| ML / fairness | scikit-learn, AIF360, Fairlearn, SHAP, DoWhy, DiCE, SDV, Evidently, sentence-transformers |
| Storage | PostgreSQL (Postgres+asyncpg in prod, SQLite for local dev), filesystem for uploads |
| Reporting | WeasyPrint (PDF), Jinja2, matplotlib |
| Deployment | Railway (backend, Docker + managed Postgres) + Vercel (frontend) |

---

## What it does

### Eight audit capabilities

1. **Dataset audit** — auto-detects label + protected attributes, group distributions, dataset quality score, overall risk score.
2. **Bias metrics** — disparate impact, statistical parity difference, 80% rule pass/fail, severity per group.
3. **Intersectional analysis** — every pairwise (and beyond) combination of protected attributes, accuracy/positive-rate per group, worst-group highlighting, heatmap of disparate-impact across intersections.
4. **Causal fairness** — `POST /analyze/{run_id}/causal` runs DoWhy linear regression (with IPW fallback) to estimate the Average Treatment Effect of a protected attribute on outcomes, plus a refutation/robustness check.
5. **Individual recourse** — counterfactual suggestions for a rejected individual: which features to change, in what direction, sorted by effort (low/medium/high).
6. **Synthetic data generation** — SDV-trained generative model produces a balanced dataset; UI shows before/after disparate-impact and downloads the CSV.
7. **Regulatory compliance** — checks audit results against major AI fairness laws (EU AI Act, NYC Local Law 144, EEOC 4/5ths, etc.); accordion per regulation with PASS/FAIL/MANUAL REVIEW, metric checks, procedural requirements, penalty info.
8. **Model card + data lineage** — auto-generates a Google/Hugging-Face-standard model card (markdown + JSON), and tracks bias introduction across pipeline stages so you can pinpoint exactly *when* disparate impact dropped below 0.80.

### Productization features

- **Auth** — JWT access + refresh tokens, bcrypt password hashing, role-based admin routes, in-memory token blacklist.
- **Rate limiting** — `slowapi` per-route quotas (analyze 20/h, synthetic 5/h, causal 10/h, recourse 30/h, login 5/min).
- **Security headers** — HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy on every response.
- **Body-size limits** — configurable `MAX_UPLOAD_SIZE_MB` enforced as middleware.
- **Live monitoring** — `/ws/monitor` WebSocket streams audit progress to the dashboard.
- **PDF reports** — WeasyPrint-rendered audit PDFs via `/report/{run_id}`.

---

## Repository layout

```
h6/
├── backend/                          FastAPI service
│   ├── main.py                       App entrypoint, all bias-audit endpoints
│   ├── auth.py                       JWT, bcrypt, role guards
│   ├── database.py                   Async SQLAlchemy + ORM models
│   ├── auto_detect.py                Label / protected-attr inference
│   ├── bias_engine.py                Group-level fairness metrics
│   ├── intersectional_engine.py      Multi-attribute intersection analyzer
│   ├── causal_engine.py              DoWhy + IPW fallback
│   ├── recourse_engine.py            DiCE counterfactuals
│   ├── synthetic_engine.py           SDV balanced-data generator
│   ├── regulatory_engine.py          Multi-jurisdiction compliance rules
│   ├── model_card_generator.py       Google/HF-style markdown + JSON
│   ├── lineage_tracker.py            Pipeline-stage DI tracking
│   ├── report_generator.py           WeasyPrint PDF
│   ├── routes/                       Auth + admin sub-routers
│   ├── alembic/                      Migrations
│   ├── Dockerfile                    Production image (python:3.11-slim + cairo/pango, CPU-only torch)
│   ├── .dockerignore                 Keeps .venv / caches out of build context
│   └── requirements.txt
├── frontend/                         Next.js app
│   ├── app/                          App Router pages
│   │   ├── page.tsx                  Upload + immediate-analysis flow
│   │   ├── dashboard/                Run drilldown
│   │   ├── intersectional/           Combination cards + heatmap
│   │   ├── causal/                   ATE + refutation
│   │   ├── recourse/                 Counterfactual explorer
│   │   ├── synthetic/                Generator + before/after
│   │   ├── compliance/               Regulation accordion
│   │   ├── model-card/               Markdown preview + raw + downloads
│   │   ├── lineage/                  Pipeline timeline
│   │   ├── monitor/                  Live WS feed
│   │   ├── reports/                  Run history
│   │   └── admin/                    User mgmt (role: admin)
│   ├── components/                   Shared UI (AppShell, RunSelector, Badge, …)
│   ├── lib/api.ts                    Typed API client
│   └── vercel.json                   Vercel deploy config
├── backend/railway.toml              Railway service config (forces Dockerfile builder)
├── DEPLOY.md                         Step-by-step Railway + Vercel guide
└── README.md                         You are here
```

---

## Quickstart (local dev)

### Prerequisites

- Python 3.11 (3.12+ may segfault inside WeasyPrint on macOS)
- Node 18+
- ~5 GB of disk space for the full ML wheel set

### Backend

```bash
cd backend
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Copy and edit env vars
cp .env.example .env
# Then set SECRET_KEY in .env (or let start_dev.sh generate an ephemeral one)

./start_dev.sh
# → http://localhost:8000
# → http://localhost:8000/docs   (Swagger UI)
```

### Frontend

```bash
cd frontend
npm install --legacy-peer-deps   # react-markdown peer-range conflict with eslint-config-next
cp .env.local.example .env.local
npm run dev
# → http://localhost:3000
```

### Smoke test

1. Open <http://localhost:3000> → click **Register** → create an account.
2. Drop any CSV with a binary outcome column on the upload zone.
3. The audit runs; you'll get a risk score + group metrics.
4. Sidebar gives you the eight specialized views.

---

## API surface

All audit endpoints require `Authorization: Bearer <jwt>` (obtained from `/auth/login`).

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Issue access + refresh tokens |
| `POST` | `/auth/refresh` | Rotate access token |
| `POST` | `/auth/logout` | Blacklist refresh token |
| `GET`  | `/auth/me` | Current user profile |
| `POST` | `/analyze/preview` | Auto-detect schema without persisting |
| `POST` | `/analyze` | Full audit (returns FullAnalysisResponse, persists run) |
| `GET`  | `/runs` | List my past runs |
| `GET`  | `/metrics/{run_id}` | Run metrics + per-group breakdown |
| `GET`  | `/report/{run_id}` | PDF audit report (WeasyPrint) |
| `POST` | `/analyze/{run_id}/causal` | DoWhy ATE + refutation |
| `POST` | `/analyze/{run_id}/recourse` | DiCE counterfactuals |
| `POST` | `/analyze/{run_id}/synthetic` | SDV balanced dataset (base64 CSV) |
| `GET`  | `/analyze/{run_id}/model-card` | Markdown + JSON model card |
| `GET`  | `/analyze/{run_id}/lineage` | Pipeline-stage DI timeline |
| `WS`   | `/ws/monitor?token=<jwt>` | Live audit-progress feed |
| `GET`  | `/health` | Liveness probe (no auth) |
| `GET`  | `/admin/users` | Paginated user list (role: admin) |
| `GET`  | `/admin/stats` | System stats (role: admin) |

Full request/response shapes live in `backend/main.py` and `frontend/lib/api.ts` (the TypeScript types mirror the FastAPI Pydantic models 1:1).

---


## Architecture diagram

```
┌─────────────────┐         HTTPS          ┌──────────────────────────┐
│  Vercel Edge    │  ──────────────────►   │  Railway (Docker)        │
│  Next.js 16     │                        │  FastAPI / Uvicorn       │
│  App Router     │  ◄──────────────────   │  • JWT auth              │
│  React 18       │      WSS (monitor)     │  • Bias engines          │
└────────┬────────┘                        │  • PDF rendering         │
         │                                 │                          │
         │                                 │  Volume → /data (CSVs)   │
         │                                 │  Railway Postgres add-on │
         ▼                                 └──────────────────────────┘
  Browser
  • CSV upload
  • Dashboard
  • Eight analysis views
```

---

## Why this exists

Most fairness libraries give you a metric. Most compliance tools give you a checklist. **Few connect them.** FairAudit goes from raw CSV → metrics → causal attribution → recourse → synthetic remediation → regulatory report → publishable model card in one flow, so a non-ML stakeholder (legal, compliance, product) can see *why* a model is biased, *whether it would survive court scrutiny*, *what to do about it*, and *what to ship as documentation*.

---

## License

This project is built for a hackathon submission. License TBD.
