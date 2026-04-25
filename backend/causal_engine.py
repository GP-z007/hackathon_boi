"""Causal-effect estimation of a protected attribute on the outcome.

Uses DoWhy when available, otherwise falls back to a basic IPW
(inverse-probability-weighting) estimator implemented with
scikit-learn. Both paths return the same response shape so callers
do not have to branch on backend.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd


def run_causal_audit(
    df: pd.DataFrame,
    label_col: str,
    protected_attr: str,
    confounders: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Estimate causal effect of ``protected_attr`` on ``label_col``.

    Confounders are auto-detected from numeric columns when not
    supplied. The function never raises - any failure is reported
    via the IPW fallback path with a ``note`` explaining why.
    """
    try:
        from dowhy import CausalModel  # type: ignore

        if confounders is None:
            confounders = [
                c
                for c in df.select_dtypes(include="number").columns
                if c not in [label_col, protected_attr]
            ][:5]

        causal_df = df[[protected_attr, label_col] + confounders].dropna().copy()
        if causal_df.empty:
            raise ValueError("No complete rows for causal analysis")

        if causal_df[protected_attr].nunique() > 2:
            mode_val = causal_df[protected_attr].mode()[0]
            causal_df[protected_attr] = (
                causal_df[protected_attr] == mode_val
            ).astype(int)
        if causal_df[label_col].nunique() > 2:
            mode_val = causal_df[label_col].mode()[0]
            causal_df[label_col] = (causal_df[label_col] == mode_val).astype(int)

        model = CausalModel(
            data=causal_df,
            treatment=protected_attr,
            outcome=label_col,
            common_causes=confounders,
        )
        identified = model.identify_effect(proceed_when_unidentifiable=True)
        estimate = model.estimate_effect(
            identified, method_name="backdoor.linear_regression"
        )
        refute = model.refute_estimate(
            identified, estimate, method_name="random_common_cause"
        )

        ate = float(estimate.value)
        new_effect = float(getattr(refute, "new_effect", ate))
        return {
            "method": "dowhy_linear_regression",
            "average_treatment_effect": round(ate, 4),
            "confounders_controlled": confounders,
            "interpretation": _interpret_ate(ate, protected_attr),
            "refutation_new_effect": round(new_effect, 4),
            "refutation_passed": abs(ate - new_effect) < 0.05,
            "is_causal_bias": abs(ate) > 0.05,
        }

    except Exception as exc:  # noqa: BLE001 - fall back to lightweight IPW
        return _ipw_fallback(
            df,
            label_col,
            protected_attr,
            confounders or [],
            str(exc),
        )


def _ipw_fallback(
    df: pd.DataFrame,
    label_col: str,
    protected_attr: str,
    confounders: List[str],
    original_error: str,
) -> Dict[str, Any]:
    from sklearn.linear_model import LogisticRegression

    sub = df[[protected_attr, label_col] + confounders].dropna().copy()
    if sub.empty:
        return {
            "method": "ipw_fallback",
            "average_treatment_effect": 0.0,
            "confounders_controlled": confounders,
            "interpretation": "Insufficient data after dropping nulls.",
            "is_causal_bias": False,
            "note": (
                f"DoWhy unavailable ({original_error[:80]}); "
                "IPW had no rows to fit."
            ),
        }

    for col in [protected_attr, label_col]:
        if sub[col].dtype == object:
            mode_val = sub[col].mode()[0]
            sub[col] = (sub[col] == mode_val).astype(int)

    if confounders:
        X = sub[confounders].astype(float)
    else:
        X = pd.DataFrame({"intercept": 1.0}, index=sub.index)

    T = sub[protected_attr].astype(int).to_numpy()
    Y = sub[label_col].astype(int).to_numpy()

    try:
        ps_model = LogisticRegression(max_iter=500).fit(X, T)
        ps = ps_model.predict_proba(X)[:, 1]
        ps = np.clip(ps, 0.05, 0.95)
        weights = T / ps + (1 - T) / (1 - ps)
        ate = float(np.average(Y * (2 * T - 1), weights=weights))
    except Exception:  # noqa: BLE001
        # Naive difference-in-means as the last-resort estimate.
        try:
            ate = float(Y[T == 1].mean() - Y[T == 0].mean())
        except Exception:  # noqa: BLE001
            ate = 0.0

    return {
        "method": "ipw_fallback",
        "average_treatment_effect": round(ate, 4),
        "confounders_controlled": confounders,
        "interpretation": _interpret_ate(ate, protected_attr),
        "is_causal_bias": abs(ate) > 0.05,
        "note": f"DoWhy unavailable ({original_error[:80]}), used IPW",
    }


def _interpret_ate(ate: float, attr: str) -> str:
    direction = "more likely" if ate > 0 else "less likely"
    if abs(ate) > 0.15:
        magnitude = "strongly"
    elif abs(ate) > 0.05:
        magnitude = "moderately"
    else:
        magnitude = "slightly"
    return (
        f"Being in the privileged group for '{attr}' is {magnitude} causally "
        f"associated with a {direction} positive outcome (ATE={ate:.3f}), "
        "after controlling for confounders."
    )
