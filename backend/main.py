"""FastAPI app entrypoint with hardened auth, rate limiting, and security headers."""

import asyncio
import io
import os
import random
from datetime import datetime, timezone
from typing import Annotated, Any, Dict

import pandas as pd
from fastapi import (
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
from fastapi.responses import StreamingResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware

from auth import get_current_user, get_user_from_ws_token
from auto_detect import auto_detect_columns, summarize_dataset
from bias_engine import run_data_audit
from database import AuditRun, User, async_session_factory, get_db, init_db
from rate_limit import limiter
from routes.admin_routes import router as admin_router
from routes.auth_routes import router as auth_router


MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10"))
MAX_BODY_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]


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


# ---------------------------------------------------------------------------
# Bias-audit endpoints (all require auth)
# ---------------------------------------------------------------------------


def _maybe_reset_user_quota(user: User) -> None:
    today = datetime.now(timezone.utc).date()
    if user.api_calls_reset_at != today:
        user.api_calls_today = 0
        user.api_calls_reset_at = today


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

    audit_run = AuditRun(
        user_id=current_user.id,
        filename=file.filename or "uploaded.csv",
        row_count=int(len(transformed_df)),
        overall_risk_score=overall_risk_score,
        auto_detected_label=label_col,
        auto_detected_attrs=auto_detection_payload,
        bias_results=bias_results,
        dataset_summary=dataset_summary,
    )
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
    result = await db.execute(select(AuditRun).where(AuditRun.id == run_id))
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Run ID not found")
    if run.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your audit run")

    sections = []
    for attr, vals in (run.bias_results or {}).items():
        sections.append(
            f"{attr}:\n"
            f"  Disparate Impact: {vals.get('disparate_impact')}\n"
            f"  Statistical Parity Difference: {vals.get('statistical_parity_difference')}\n"
            f"  Passes 80 Percent Rule: {vals.get('passes_80_percent_rule')}\n"
            f"  Severity: {vals.get('severity')}\n"
        )
    report_text = (
        f"Bias Audit Report\n"
        f"Run ID: {run.id}\n"
        f"Timestamp: {run.created_at.isoformat()}\n"
        f"User: {current_user.email}\n\n"
        f"Filename: {run.filename}\n"
        f"Label Column: {run.auto_detected_label}\n"
        f"Protected Attributes: {', '.join((run.auto_detected_attrs or {}).get('protected_attrs', []))}\n"
        f"Overall Risk Score: {run.overall_risk_score}\n\n"
        + "\n".join(sections)
    )

    return StreamingResponse(
        io.BytesIO(report_text.encode("utf-8")),
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="audit_report_{run.id}.txt"'},
    )


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
