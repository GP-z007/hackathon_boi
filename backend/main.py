from __future__ import annotations

import asyncio
import io
import json
import random
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

import aiosqlite
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from auto_detect import auto_detect_columns, summarize_dataset
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
async def analyze(file: UploadFile = File(...)):
    content = await file.read()
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
    disparate_impacts = []
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

    run_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    response_payload = {
        "run_id": run_id,
        "timestamp": timestamp,
        "auto_detection": {
            "label_col": label_col,
            "label_col_confidence": float(detection["confidence"].get(label_col, 0.5)),
            "protected_attrs": protected_attrs,
            "detection_reasoning": {attr: detection["reasoning"].get(attr, "detected") for attr in protected_attrs},
        },
        "dataset_summary": dataset_summary,
        "bias_results": bias_results,
        "overall_risk_score": overall_risk_score,
    }

    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "INSERT INTO audit_runs (run_id, timestamp, results) VALUES (?, ?, ?)",
            (run_id, timestamp, json.dumps(response_payload)),
        )
        await db.commit()

    return response_payload


@app.post("/analyze/preview")
async def analyze_preview(file: UploadFile = File(...)):
    content = await file.read()
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
            "detection_reasoning": {attr: detection["reasoning"].get(attr, "detected") for attr in protected_attrs},
        },
        "dataset_summary": dataset_summary,
    }


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

    stored = json.loads(row[0])
    if isinstance(stored, dict) and "results" in stored:
        return {"run_id": run_id, "results": stored["results"]}
    if isinstance(stored, dict) and "bias_results" in stored:
        first_attr = next(iter(stored["bias_results"]), None)
        first_result = stored["bias_results"].get(first_attr, {}) if first_attr else {}
        return {"run_id": run_id, "results": first_result}
    return {"run_id": run_id, "results": stored}


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
    if "bias_results" in results:
        sections = []
        for attr, vals in results["bias_results"].items():
            sections.append(
                f"{attr}:\n"
                f"  Disparate Impact: {vals.get('disparate_impact')}\n"
                f"  Statistical Parity Difference: {vals.get('statistical_parity_difference')}\n"
                f"  Passes 80 Percent Rule: {vals.get('passes_80_percent_rule')}\n"
                f"  Severity: {vals.get('severity')}\n"
            )
        report_text = (
            f"Bias Audit Report\n"
            f"Run ID: {run_id}\n"
            f"Timestamp: {timestamp}\n\n"
            f"Label Column: {results.get('auto_detection', {}).get('label_col')}\n"
            f"Protected Attributes: {', '.join(results.get('auto_detection', {}).get('protected_attrs', []))}\n"
            f"Overall Risk Score: {results.get('overall_risk_score')}\n\n"
            + "\n".join(sections)
        )
    else:
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
