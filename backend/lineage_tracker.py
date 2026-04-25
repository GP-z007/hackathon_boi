"""Bias-lineage tracking across pipeline stages.

Snapshot the dataset at each stage of an ETL/feature-engineering
pipeline and compare disparate-impact metrics over time. Lets users
pinpoint the exact stage where bias was introduced.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

import pandas as pd

from bias_engine import run_data_audit


class BiasLineageTracker:
    """Sequential tracker; call :meth:`snapshot` at every pipeline stage."""

    def __init__(self) -> None:
        self.log: List[Dict[str, Any]] = []

    def snapshot(
        self,
        stage: str,
        df: pd.DataFrame,
        label_col: str,
        protected_attr: str,
    ) -> Dict[str, Any]:
        try:
            audit = run_data_audit(df, label_col, protected_attr)
        except Exception as exc:  # noqa: BLE001 - we still want a snapshot row
            audit = {"disparate_impact": None, "error": str(exc)}

        prev_di = self.log[-1].get("disparate_impact") if self.log else None
        current_di = audit.get("disparate_impact")
        delta = (
            round(float(current_di) - float(prev_di), 4)
            if prev_di is not None and current_di is not None
            else None
        )

        entry: Dict[str, Any] = {
            "stage": stage,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "row_count": int(len(df)),
            "missing_pct": round(float(df.isnull().mean().mean() * 100), 2),
            "disparate_impact": (
                round(float(current_di), 4) if current_di is not None else None
            ),
            "passes_80_rule": audit.get("passes_80_percent_rule"),
            "delta_from_previous": delta,
        }
        if "error" in audit:
            entry["error"] = audit["error"]
        self.log.append(entry)
        return entry

    def find_introduction_point(self) -> Dict[str, Any]:
        """Return the first stage where disparate impact dropped below 0.8."""
        for i, entry in enumerate(self.log):
            di = entry.get("disparate_impact")
            if di is not None and di < 0.8:
                prev = self.log[i - 1]["stage"] if i > 0 else "start"
                return {
                    "bias_introduced_at": entry["stage"],
                    "previous_clean_stage": prev,
                    "disparate_impact_at_introduction": di,
                    "full_timeline": self.log,
                }
        return {
            "bias_introduced_at": None,
            "message": (
                "No bias introduction point found - DI stayed above 0.8 throughout"
            ),
            "full_timeline": self.log,
        }

    def export(self) -> List[Dict[str, Any]]:
        return list(self.log)
