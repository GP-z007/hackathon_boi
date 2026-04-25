"""Balanced synthetic dataset generation.

Tries SDV's CTGAN first; if SDV is unavailable (or training fails),
falls back to a stratified bootstrap that resamples each protected
group to equal size. Returns the resulting dataset as a base64
CSV so the frontend can offer a one-click download.
"""

from __future__ import annotations

import base64
import io
from typing import Any, Dict

import pandas as pd

from bias_engine import run_data_audit


def generate_balanced_synthetic(
    df: pd.DataFrame,
    label_col: str,
    protected_attr: str,
    target_rows: int = 2000,
) -> Dict[str, Any]:
    """Generate a synthetic dataset that improves disparate impact."""
    method: str
    synthetic: pd.DataFrame
    try:
        from sdv.metadata import SingleTableMetadata  # type: ignore
        from sdv.single_table import CTGANSynthesizer  # type: ignore

        meta = SingleTableMetadata()
        meta.detect_from_dataframe(df)
        synth = CTGANSynthesizer(meta, epochs=100, verbose=False)
        synth.fit(df)
        synthetic = synth.sample(num_rows=target_rows)
        method = "ctgan"
    except Exception as exc:  # noqa: BLE001 - fall back to simple resample
        synthetic = _bootstrap_resample(df, protected_attr, label_col, target_rows)
        method = f"stratified_bootstrap (SDV unavailable: {str(exc)[:60]})"

    try:
        original_audit = run_data_audit(df, label_col, protected_attr)
    except Exception as exc:  # noqa: BLE001
        original_audit = {"disparate_impact": None, "error": str(exc)}
    try:
        synthetic_audit = run_data_audit(synthetic, label_col, protected_attr)
    except Exception as exc:  # noqa: BLE001
        synthetic_audit = {"disparate_impact": None, "error": str(exc)}

    orig_di = original_audit.get("disparate_impact")
    synth_di = synthetic_audit.get("disparate_impact")
    if orig_di is not None and synth_di is not None:
        improvement = round(float(synth_di) - float(orig_di), 4)
    else:
        improvement = None

    return {
        "method": method,
        "original_rows": int(len(df)),
        "synthetic_rows": int(len(synthetic)),
        "original_disparate_impact": (
            round(float(orig_di), 4) if orig_di is not None else None
        ),
        "synthetic_disparate_impact": (
            round(float(synth_di), 4) if synth_di is not None else None
        ),
        "improvement": improvement,
        "synthetic_csv_b64": _df_to_base64(synthetic),
    }


def _bootstrap_resample(
    df: pd.DataFrame,
    protected_attr: str,
    label_col: str,  # noqa: ARG001 - reserved for future label-aware balancing
    target_rows: int,
) -> pd.DataFrame:
    if protected_attr not in df.columns:
        return df.sample(n=target_rows, replace=True, random_state=42).reset_index(
            drop=True
        )
    groups = df[protected_attr].dropna().unique()
    if len(groups) == 0:
        return df.sample(n=target_rows, replace=True, random_state=42).reset_index(
            drop=True
        )
    per_group = max(1, target_rows // len(groups))
    parts = []
    for group in groups:
        sub = df[df[protected_attr] == group]
        if sub.empty:
            continue
        resampled = sub.sample(
            n=per_group,
            replace=len(sub) < per_group,
            random_state=42,
        )
        parts.append(resampled)
    if not parts:
        return df.sample(n=target_rows, replace=True, random_state=42).reset_index(
            drop=True
        )
    return (
        pd.concat(parts)
        .sample(frac=1, random_state=42)
        .reset_index(drop=True)
    )


def _df_to_base64(df: pd.DataFrame) -> str:
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return base64.b64encode(buf.getvalue().encode("utf-8")).decode("ascii")
