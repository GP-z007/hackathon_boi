"""FastAPI app entrypoint with hardened auth, rate limiting, and security headers."""

import asyncio
import io
import logging
import os
import random
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any, Dict, List, Optional

import pandas as pd
from fastapi import (
    Body,
    Depends,
    FastAPI,
    File,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware

from auth import get_current_user, get_user_from_ws_token
from auto_detect import auto_detect_columns, summarize_dataset
from bias_engine import run_data_audit
from causal_engine import run_causal_audit
from database import AuditRun, User, async_session_factory, get_db, init_db
from intersectional_engine import run_intersectional_audit
from lineage_tracker import BiasLineageTracker
from model_card_generator import generate_model_card
from rate_limit import limiter
from recourse_engine import generate_recourse
from regulatory_engine import check_compliance
from report_generator import generate_audit_pdf
from routes.admin_routes import router as admin_router
from routes.auth_routes import router as auth_router
from synthetic_engine import generate_balanced_synthetic


MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10"))
MAX_BODY_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

# Persisted CSV uploads are needed by the causal/recourse/synthetic endpoints
# which re-run analyses on the original dataframe. The directory is created
# lazily on startup; configure the location with DATASET_STORAGE_DIR.
DATASET_STORAGE_DIR = Path(
    os.getenv("DATASET_STORAGE_DIR", "uploaded_datasets")
).resolve()


app = FastAPI(title="Bias Detection Backend", version="1.0.0")

# slowapi wiring – the limiter must be the SAME instance referenced in the
# decorators on individual routes (see rate_limit.py).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


# ---------------------------------------------------------------------------
# Security middleware
# ---------------------------------------------------------------------------


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Apply hardening headers to every response."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        return response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject any request whose body is larger than MAX_BODY_BYTES."""

    def __init__(self, app, max_bytes: int) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > self.max_bytes:
                    return Response(
                        content=(
                            f'{{"detail":"Request body exceeds {MAX_UPLOAD_SIZE_MB}MB limit"}}'
                        ),
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        media_type="application/json",
                    )
            except ValueError:
                pass
        return await call_next(request)


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(BodySizeLimitMiddleware, max_bytes=MAX_BODY_BYTES)

# CORS comes last so it runs first on the way in (Starlette wraps middleware LIFO).
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining"],
)


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(auth_router)
app.include_router(admin_router)


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


@app.on_event("startup")
async def startup_event() -> None:
    # Alembic owns the schema in real deployments; this is a safety net so a
    # fresh dev box can boot without an explicit `alembic upgrade head`.
    await init_db()
    DATASET_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Bias-audit endpoints (all require auth)
# ---------------------------------------------------------------------------


def _maybe_reset_user_quota(user: User) -> None:
    today = datetime.now(timezone.utc).date()
    if user.api_calls_reset_at != today:
        user.api_calls_today = 0
        user.api_calls_reset_at = today


def _store_dataset(run_id: str, content: bytes) -> Path:
    """Persist the raw CSV bytes for re-analysis by downstream endpoints."""
    DATASET_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    path = DATASET_STORAGE_DIR / f"{run_id}.csv"
    path.write_bytes(content)
    return path


def _load_run_dataframe(run: AuditRun) -> pd.DataFrame:
    """Load the original CSV for a run and re-apply auto-detection transforms.

    Re-detects columns on the raw frame so we always feed downstream engines
    the same binarised label / protected columns the initial /analyze used.
    """
    if not run.dataset_path:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This audit run was created before dataset persistence was enabled. "
                "Re-upload the CSV via /analyze to enable advanced analyses."
            ),
        )
    path = Path(run.dataset_path)
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Stored dataset file is missing on disk.",
        )
    try:
        return pd.read_csv(path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Failed to re-read stored dataset: {exc}",
        ) from exc


def _resolved_protected_attr(run: AuditRun, requested: Optional[str]) -> str:
    attrs: List[str] = (run.auto_detected_attrs or {}).get("protected_attrs", []) or []
    if requested:
        if attrs and requested not in attrs:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Protected attribute '{requested}' was not detected for this run. "
                    f"Available: {attrs}"
                ),
            )
        return requested
    if not attrs:
        raise HTTPException(
            status_code=400,
            detail="No protected attributes were detected for this run.",
        )
    return attrs[0]


async def _get_run_for_user(
    run_id: str, current_user: User, db: AsyncSession
) -> AuditRun:
    result = await db.execute(select(AuditRun).where(AuditRun.id == run_id))
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Run ID not found")
    if run.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your audit run")
    return run


class CausalRequest(BaseModel):
    protected_attr: Optional[str] = Field(
        default=None,
        description="Protected attribute name; defaults to first detected attribute.",
    )
    confounders: Optional[List[str]] = Field(default=None)


class RecourseRequest(BaseModel):
    rejected_row: Dict[str, Any]
    n_counterfactuals: int = Field(default=3, ge=1, le=10)
    protected_attr: Optional[str] = None


class SyntheticRequest(BaseModel):
    target_rows: int = Field(default=2000, ge=100, le=20000)
    protected_attr: Optional[str] = None


@app.post("/analyze")
@limiter.limit("20/hour")
async def analyze(
    request: Request,
    file: Annotated[UploadFile, File(...)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    content = await file.read()
    if len(content) > MAX_BODY_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_UPLOAD_SIZE_MB}MB limit",
        )

    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid CSV upload: {exc}") from exc

    try:
        detection = auto_detect_columns(df)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    transformed_df = detection["transformed_df"]
    label_col = detection["label_col"]
    protected_attrs = detection["protected_attrs"]
    if not protected_attrs:
        raise HTTPException(
            status_code=400,
            detail="No suitable protected attributes were detected in the uploaded dataset.",
        )

    dataset_summary = summarize_dataset(transformed_df, label_col, protected_attrs)

    bias_results: Dict[str, Dict[str, Any]] = {}
    disparate_impacts: list[float] = []
    for attr in protected_attrs:
        try:
            audit = run_data_audit(df=transformed_df, label_col=label_col, protected_attr=attr)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        spd = abs(float(audit.get("statistical_parity_difference", 0.0)))
        if spd < 0.05:
            severity = "low"
        elif spd < 0.1:
            severity = "medium"
        else:
            severity = "high"
        audit["severity"] = severity
        bias_results[attr] = audit
        disparate_impacts.append(float(audit.get("disparate_impact", 1.0)))

    if disparate_impacts:
        risk = sum(max(0.0, min(1.0, 1.0 - di)) for di in disparate_impacts) / len(disparate_impacts)
    else:
        risk = 0.0
    overall_risk_score = max(0.0, min(1.0, risk))

    auto_detection_payload = {
        "label_col": label_col,
        "label_col_confidence": float(detection["confidence"].get(label_col, 0.5)),
        "protected_attrs": protected_attrs,
        "detection_reasoning": {
            attr: detection["reasoning"].get(attr, "detected") for attr in protected_attrs
        },
    }

    # 1. Intersectional analysis - examines every protected attribute combo.
    try:
        intersectional = run_intersectional_audit(
            transformed_df, label_col, protected_attrs
        )
    except Exception as exc:  # noqa: BLE001
        logging.exception("Intersectional analysis failed")
        intersectional = {"error": str(exc)}

    # 2. Regulatory compliance check.
    use_case = (request.headers.get("X-Use-Case") or "hiring").lower()
    try:
        compliance = check_compliance(bias_results, use_case=use_case)
    except Exception as exc:  # noqa: BLE001
        logging.exception("Compliance evaluation failed")
        compliance = {"error": str(exc)}

    # 3. Lineage snapshot at ingestion (one tracker per protected attr).
    lineage_log: Dict[str, Any] = {}
    for attr in protected_attrs:
        try:
            tracker = BiasLineageTracker()
            tracker.snapshot("ingestion", transformed_df, label_col, attr)
            lineage_log[attr] = tracker.export()
        except Exception as exc:  # noqa: BLE001
            lineage_log[attr] = [{"stage": "ingestion", "error": str(exc)}]

    # Build the audit run before generating the model card so the run_id is real.
    run_id = str(uuid.uuid4())
    audit_run = AuditRun(
        id=run_id,
        user_id=current_user.id,
        filename=file.filename or "uploaded.csv",
        row_count=int(len(transformed_df)),
        overall_risk_score=overall_risk_score,
        auto_detected_label=label_col,
        auto_detected_attrs=auto_detection_payload,
        bias_results=bias_results,
        dataset_summary=dataset_summary,
        intersectional_analysis=intersectional,
        compliance_report=compliance,
        lineage_log=lineage_log,
    )

    # Persist the raw CSV so causal/recourse/synthetic endpoints can re-load it.
    try:
        stored_path = _store_dataset(run_id, content)
        audit_run.dataset_path = str(stored_path)
    except Exception:  # noqa: BLE001
        logging.exception("Failed to persist uploaded CSV for run %s", run_id)

    # 4. Auto-generated model card.
    model_card_use_case = request.headers.get("X-Use-Case") or "general"
    try:
        model_card = generate_model_card(
            {
                "run_id": run_id,
                "bias_results": bias_results,
                "auto_detection": auto_detection_payload,
                "dataset_summary": dataset_summary,
                "overall_risk_score": overall_risk_score,
                "compliance_report": compliance,
            },
            user={
                "full_name": current_user.full_name,
                "email": current_user.email,
            },
            use_case=model_card_use_case,
        )
    except Exception as exc:  # noqa: BLE001
        logging.exception("Model card generation failed")
        model_card = {"error": str(exc)}
    audit_run.model_card = model_card

    db.add(audit_run)

    _maybe_reset_user_quota(current_user)
    current_user.api_calls_today += 1
    db.add(current_user)

    await db.commit()
    await db.refresh(audit_run)

    return {
        "run_id": audit_run.id,
        "timestamp": audit_run.created_at.isoformat(),
        "auto_detection": auto_detection_payload,
        "dataset_summary": dataset_summary,
        "bias_results": bias_results,
        "overall_risk_score": overall_risk_score,
        "intersectional_analysis": intersectional,
        "compliance_report": compliance,
        "model_card": model_card,
    }


@app.post("/analyze/preview")
async def analyze_preview(
    file: Annotated[UploadFile, File(...)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    content = await file.read()
    if len(content) > MAX_BODY_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_UPLOAD_SIZE_MB}MB limit",
        )

    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid CSV upload: {exc}") from exc

    try:
        detection = auto_detect_columns(df)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    transformed_df = detection["transformed_df"]
    label_col = detection["label_col"]
    protected_attrs = detection["protected_attrs"]

    dataset_summary = summarize_dataset(transformed_df, label_col, protected_attrs)
    return {
        "auto_detection": {
            "label_col": label_col,
            "label_col_confidence": float(detection["confidence"].get(label_col, 0.5)),
            "protected_attrs": protected_attrs,
            "detection_reasoning": {
                attr: detection["reasoning"].get(attr, "detected") for attr in protected_attrs
            },
        },
        "dataset_summary": dataset_summary,
    }


@app.get("/runs")
async def list_runs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200),
):
    stmt = (
        select(AuditRun)
        .where(AuditRun.user_id == current_user.id)
        .order_by(AuditRun.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    runs = result.scalars().all()
    out = []
    for run in runs:
        attrs = (run.auto_detected_attrs or {}).get("protected_attrs", []) or []
        out.append(
            {
                "run_id": run.id,
                "timestamp": run.created_at.isoformat(),
                "filename": run.filename,
                "row_count": int(run.row_count or 0),
                "protected_attrs": attrs,
                "overall_risk_score": float(run.overall_risk_score or 0.0),
            }
        )
    return out


@app.get("/metrics/{run_id}")
async def get_metrics(
    run_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(AuditRun).where(AuditRun.id == run_id))
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Run ID not found")
    if run.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your audit run")

    first_attr = next(iter(run.bias_results), None) if run.bias_results else None
    first_result = run.bias_results.get(first_attr, {}) if first_attr else {}
    return {"run_id": run.id, "results": first_result, "all_results": run.bias_results}


@app.get("/report/{run_id}")
async def get_report(
    run_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Render the audit run as a fully formatted PDF report."""
    result = await db.execute(select(AuditRun).where(AuditRun.id == run_id))
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Run ID not found")
    if run.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your audit run")

    # Render synchronously. PDF generation takes ~1-3s; offloading to a worker
    # thread is tempting but matplotlib + WeasyPrint native libs (Pango/Cairo)
    # have well-known thread-safety quirks on macOS that have crashed the
    # uvicorn worker silently in the past. Blocking the event loop briefly is
    # the right trade-off for a report endpoint.
    try:
        pdf_bytes = generate_audit_pdf(run, current_user)
    except Exception as exc:  # noqa: BLE001
        logging.exception("PDF render failed for run %s", run_id)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to render PDF report: {exc}",
        ) from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="fairaudit-{run_id[:8]}.pdf"',
            "Cache-Control": "no-store",
        },
    )


# ---------------------------------------------------------------------------
# Advanced analysis endpoints (causal, recourse, synthetic, model card, lineage)
# ---------------------------------------------------------------------------


@app.post("/analyze/{run_id}/causal")
@limiter.limit("10/hour")
async def analyze_causal(
    run_id: str,
    request: Request,
    payload: CausalRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Estimate the causal effect of a protected attribute on the outcome.

    Causal inference is computationally expensive (DoWhy refutation in
    particular), so this endpoint is rate-limited more aggressively than
    /analyze.
    """
    run = await _get_run_for_user(run_id, current_user, db)
    df = _load_run_dataframe(run)
    label_col = run.auto_detected_label
    protected_attr = _resolved_protected_attr(run, payload.protected_attr)

    try:
        detection = auto_detect_columns(df)
        df = detection["transformed_df"]
    except ValueError:
        # If auto-detection now fails (e.g. file edited externally), keep the
        # raw dataframe rather than 500 - causal_engine handles raw values.
        pass

    try:
        result = run_causal_audit(
            df=df,
            label_col=label_col,
            protected_attr=protected_attr,
            confounders=payload.confounders,
        )
    except Exception as exc:  # noqa: BLE001
        logging.exception("Causal audit failed for run %s", run_id)
        raise HTTPException(
            status_code=500, detail=f"Causal audit failed: {exc}"
        ) from exc

    return {
        "run_id": run_id,
        "protected_attr": protected_attr,
        "result": result,
    }


@app.post("/analyze/{run_id}/recourse")
@limiter.limit("30/hour")
async def analyze_recourse(
    run_id: str,
    request: Request,
    payload: RecourseRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Generate counterfactual recourse for an individual rejected row."""
    run = await _get_run_for_user(run_id, current_user, db)
    df = _load_run_dataframe(run)
    label_col = run.auto_detected_label
    protected_attr = _resolved_protected_attr(run, payload.protected_attr)

    try:
        detection = auto_detect_columns(df)
        df = detection["transformed_df"]
    except ValueError:
        pass

    try:
        result = generate_recourse(
            df=df,
            label_col=label_col,
            protected_attr=protected_attr,
            rejected_row=payload.rejected_row,
            n_counterfactuals=payload.n_counterfactuals,
        )
    except Exception as exc:  # noqa: BLE001
        logging.exception("Recourse generation failed for run %s", run_id)
        raise HTTPException(
            status_code=500,
            detail=f"Recourse generation failed: {exc}",
        ) from exc

    return {
        "run_id": run_id,
        "protected_attr": protected_attr,
        "rejected_row": payload.rejected_row,
        "result": result,
    }


@app.post("/analyze/{run_id}/synthetic")
@limiter.limit("5/hour")
async def analyze_synthetic(
    run_id: str,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    payload: SyntheticRequest = Body(default=SyntheticRequest()),
):
    """Generate a balanced synthetic dataset for the run."""
    run = await _get_run_for_user(run_id, current_user, db)
    df = _load_run_dataframe(run)
    label_col = run.auto_detected_label
    protected_attr = _resolved_protected_attr(run, payload.protected_attr)

    try:
        detection = auto_detect_columns(df)
        df = detection["transformed_df"]
    except ValueError:
        pass

    try:
        result = generate_balanced_synthetic(
            df=df,
            label_col=label_col,
            protected_attr=protected_attr,
            target_rows=payload.target_rows,
        )
    except Exception as exc:  # noqa: BLE001
        logging.exception("Synthetic generation failed for run %s", run_id)
        raise HTTPException(
            status_code=500,
            detail=f"Synthetic generation failed: {exc}",
        ) from exc

    return {
        "run_id": run_id,
        "protected_attr": protected_attr,
        "result": result,
    }


@app.get("/analyze/{run_id}/model-card")
async def get_model_card(
    run_id: str,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return the auto-generated model card for the run.

    Negotiates content based on the Accept header:
    - ``text/markdown``  -> raw Markdown body
    - anything else      -> JSON envelope with both markdown + json fields
    """
    run = await _get_run_for_user(run_id, current_user, db)

    use_case = (request.headers.get("X-Use-Case") or "general").lower()
    cached = run.model_card or {}
    needs_rebuild = not cached or "markdown" not in cached
    if needs_rebuild:
        card = generate_model_card(
            {
                "run_id": run.id,
                "bias_results": run.bias_results or {},
                "auto_detection": run.auto_detected_attrs or {},
                "dataset_summary": run.dataset_summary or {},
                "overall_risk_score": float(run.overall_risk_score or 0.0),
                "compliance_report": run.compliance_report or {},
            },
            user={
                "full_name": current_user.full_name,
                "email": current_user.email,
            },
            use_case=use_case,
        )
        run.model_card = card
        db.add(run)
        await db.commit()
    else:
        card = cached

    accept = (request.headers.get("accept") or "").lower()
    if "text/markdown" in accept:
        return PlainTextResponse(
            content=card.get("markdown", ""),
            media_type="text/markdown",
        )
    return {"run_id": run_id, **card}


@app.get("/analyze/{run_id}/lineage")
async def get_lineage(
    run_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return the lineage snapshots collected during the run's pipeline."""
    run = await _get_run_for_user(run_id, current_user, db)
    lineage = run.lineage_log or {}

    introduction_points: Dict[str, Any] = {}
    if isinstance(lineage, dict):
        for attr, entries in lineage.items():
            tracker = BiasLineageTracker()
            tracker.log = list(entries) if isinstance(entries, list) else []
            introduction_points[attr] = tracker.find_introduction_point()

    return {
        "run_id": run_id,
        "lineage_log": lineage,
        "introduction_points": introduction_points,
    }


# ---------------------------------------------------------------------------
# Authenticated WebSocket
# ---------------------------------------------------------------------------


@app.websocket("/ws/monitor")
async def monitor(
    websocket: WebSocket,
    token: str | None = Query(default=None),
):
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    async with async_session_factory() as db:
        try:
            user = await get_user_from_ws_token(token, db)
        except HTTPException:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    await websocket.accept()
    try:
        await websocket.send_json(
            {
                "type": "connected",
                "user_id": user.id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        while True:
            demographic_parity_diff = round(random.uniform(0.04, 0.20), 4)
            equalized_odds_diff = round(random.uniform(0.04, 0.20), 4)
            alert = (
                "Fairness drift threshold exceeded"
                if demographic_parity_diff > 0.15 or equalized_odds_diff > 0.15
                else None
            )
            payload = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "demographic_parity_diff": demographic_parity_diff,
                "equalized_odds_diff": equalized_odds_diff,
                "alert": alert,
            }
            await websocket.send_json(payload)
            await asyncio.sleep(4)
    except WebSocketDisconnect:
        return
    except Exception:
        await websocket.close()


# ---------------------------------------------------------------------------
# Public health endpoint (skipped from auth so Railway healthchecks work)
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok", "environment": ENVIRONMENT}
