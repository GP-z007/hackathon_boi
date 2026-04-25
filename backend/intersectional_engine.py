"""Intersectional bias auditing.

Checks bias for every subset combination of the supplied protected
attributes (e.g. gender alone, race alone, gender + race) using
fairlearn's MetricFrame so that we can surface the worst-performing
intersection, not just the marginal disparities.
"""

from __future__ import annotations

from itertools import combinations
from typing import Any, Dict, List

import pandas as pd
from fairlearn.metrics import MetricFrame, demographic_parity_difference
from sklearn.metrics import accuracy_score


def run_intersectional_audit(
    df: pd.DataFrame,
    label_col: str,
    protected_attrs: List[str],
) -> Dict[str, Any]:
    """Audit every combination (size 1..min(3, len)) of ``protected_attrs``.

    When the dataframe carries a ``prediction`` column it is used as the
    model output; otherwise the label is used as a self-prediction proxy
    (fairness metrics like demographic parity are still meaningful in
    this dataset-only mode).
    """
    results: Dict[str, Any] = {}
    if not protected_attrs or label_col not in df.columns:
        return results

    y = df[label_col]
    y_pred = df["prediction"] if "prediction" in df.columns else y

    max_r = min(len(protected_attrs), 3)
    for r in range(1, max_r + 1):
        for combo in combinations(protected_attrs, r):
            key = " + ".join(combo)
            try:
                combined = (
                    df[list(combo)].astype(str).agg(" | ".join, axis=1)
                )
                frame = MetricFrame(
                    metrics={
                        "accuracy": accuracy_score,
                        "positive_rate": lambda yt, yp: float(pd.Series(yp).mean()),
                    },
                    y_true=y,
                    y_pred=y_pred,
                    sensitive_features=combined,
                )
                by_group = frame.by_group

                worst_group = by_group["accuracy"].idxmin()
                best_group = by_group["accuracy"].idxmax()
                gap = float(
                    by_group["accuracy"].max() - by_group["accuracy"].min()
                )

                results[key] = {
                    "attributes_combined": list(combo),
                    "groups_found": [str(g) for g in by_group.index.tolist()],
                    "accuracy_by_group": {
                        str(k): round(float(v), 4)
                        for k, v in by_group["accuracy"].to_dict().items()
                    },
                    "positive_rate_by_group": {
                        str(k): round(float(v), 4)
                        for k, v in by_group["positive_rate"].to_dict().items()
                    },
                    "worst_group": str(worst_group),
                    "best_group": str(best_group),
                    "accuracy_gap": round(gap, 4),
                    "demographic_parity_diff": round(
                        float(
                            demographic_parity_difference(
                                y, y_pred, sensitive_features=combined
                            )
                        ),
                        4,
                    ),
                    "severity": _severity(gap),
                }
            except Exception as exc:  # noqa: BLE001 - we want any audit failure surfaced
                results[key] = {"error": str(exc)}

    return results


def _severity(gap: float) -> str:
    if gap >= 0.15:
        return "high"
    if gap >= 0.07:
        return "medium"
    return "low"
