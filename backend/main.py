from __future__ import annotations

import asyncio
import io
import json
import random
import uuid
from datetime import datetime, timezone

import aiosqlite
import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from bias_engine import run_data_audit

DATABASE_PATH = "bias_audit.db"

app = FastAPI(title="Bias Detection Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def init_db() -> None:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_runs (
                run_id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                results TEXT NOT NULL
            )
            """
        )
        await db.commit()


@app.on_event("startup")
async def startup_event() -> None:
    await init_db()


@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    label_col: str = Query(...),
    protected_attr: str = Query(...),
):
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid CSV upload: {exc}") from exc

    if label_col not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{label_col}' not found in CSV")
    if protected_attr not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{protected_attr}' not found in CSV")

    run_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    results = run_data_audit(df=df, label_col=label_col, protected_attr=protected_attr)

    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "INSERT INTO audit_runs (run_id, timestamp, results) VALUES (?, ?, ?)",
            (run_id, timestamp, json.dumps(results)),
        )
        await db.commit()

    return {"run_id": run_id, "timestamp": timestamp, "results": results}


@app.get("/metrics/{run_id}")
async def get_metrics(run_id: str):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute(
            "SELECT results FROM audit_runs WHERE run_id = ?",
            (run_id,),
        )
        row = await cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Run ID not found")

    return {"run_id": run_id, "results": json.loads(row[0])}


@app.get("/report/{run_id}")
async def get_report(run_id: str):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute(
            "SELECT timestamp, results FROM audit_runs WHERE run_id = ?",
            (run_id,),
        )
        row = await cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Run ID not found")

    timestamp, results_json = row
    results = json.loads(results_json)
    report_text = (
        f"Bias Audit Report\n"
        f"Run ID: {run_id}\n"
        f"Timestamp: {timestamp}\n\n"
        f"Disparate Impact: {results.get('disparate_impact')}\n"
        f"Statistical Parity Difference: {results.get('statistical_parity_difference')}\n"
        f"Mean Difference: {results.get('mean_difference')}\n"
        f"Passes 80 Percent Rule: {results.get('passes_80_percent_rule')}\n"
    )

    return StreamingResponse(
        io.BytesIO(report_text.encode("utf-8")),
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="audit_report_{run_id}.txt"'},
    )


@app.websocket("/ws/monitor")
async def monitor(websocket: WebSocket):
    await websocket.accept()
    try:
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


@app.get("/health")
async def health():
    return {"status": "ok"}
