"""Algorithmic recourse / counterfactual explanations.

For an individual whose outcome was negative, this module generates
the smallest set of feature edits required to flip the outcome to
positive. Uses DiCE when available, with a nearest-neighbour
fallback for environments where DiCE cannot be installed.
"""

from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import pandas as pd


def generate_recourse(
    df: pd.DataFrame,
    label_col: str,
    protected_attr: str,
    rejected_row: Dict[str, Any],
    n_counterfactuals: int = 3,
) -> Dict[str, Any]:
    """Return up to ``n_counterfactuals`` recourse suggestions for a rejected row."""
    try:
        import dice_ml  # type: ignore
        from sklearn.ensemble import RandomForestClassifier

        feature_cols = [
            c for c in df.columns if c not in [label_col, protected_attr, "prediction"]
        ]
        if not feature_cols:
            raise ValueError("No usable feature columns for recourse.")

        X = df[feature_cols].copy()
        # Fill numeric with median, categoricals with mode so RF can train.
        numeric_cols = X.select_dtypes(include="number").columns
        if len(numeric_cols):
            X[numeric_cols] = X[numeric_cols].fillna(X[numeric_cols].median())
        for col in X.columns.difference(numeric_cols):
            mode = X[col].mode()
            X[col] = X[col].fillna(mode.iloc[0] if not mode.empty else "")
        # DiCE needs all-numeric for the random method we use.
        X = pd.get_dummies(X, drop_first=False)

        y = df[label_col].astype(int)

        clf = RandomForestClassifier(n_estimators=50, random_state=42).fit(X, y)

        continuous = X.select_dtypes(include="number").columns.tolist()
        d = dice_ml.Data(
            dataframe=pd.concat([X, y.rename(label_col)], axis=1),
            continuous_features=continuous,
            outcome_name=label_col,
        )
        m = dice_ml.Model(model=clf, backend="sklearn")
        exp = dice_ml.Dice(d, m, method="random")

        query = pd.DataFrame(
            [
                {
                    k: rejected_row.get(k, X[k].median() if k in X.columns else 0)
                    for k in X.columns
                }
            ]
        )
        dice_exp = exp.generate_counterfactuals(
            query, total_CFs=n_counterfactuals, desired_class=1
        )
        cfs = dice_exp.cf_examples_list[0].final_cfs_df

        suggestions: List[Dict[str, Any]] = []
        for _, cf_row in cfs.iterrows():
            changes: Dict[str, Dict[str, Any]] = {}
            for col in X.columns:
                orig = float(query[col].iloc[0])
                new = float(cf_row[col])
                if abs(orig - new) > 0.01:
                    changes[col] = {
                        "from": round(orig, 3),
                        "to": round(new, 3),
                        "direction": "increase" if new > orig else "decrease",
                    }
            if changes:
                suggestions.append(
                    {
                        "changes_needed": changes,
                        "n_features_to_change": len(changes),
                    }
                )

        suggestions.sort(key=lambda x: x["n_features_to_change"])
        return {
            "method": "dice_ml",
            "counterfactuals": suggestions[:n_counterfactuals],
            "summary": (
                f"To receive a positive outcome, "
                f"{suggestions[0]['n_features_to_change']} feature(s) need to change."
                if suggestions
                else "No counterfactuals found."
            ),
        }

    except Exception as exc:  # noqa: BLE001
        return _nearest_neighbor_recourse(
            df,
            label_col,
            protected_attr,
            rejected_row,
            n_counterfactuals,
            str(exc),
        )


def _nearest_neighbor_recourse(
    df: pd.DataFrame,
    label_col: str,
    protected_attr: str,
    rejected_row: Dict[str, Any],
    n: int,
    error: str,
) -> Dict[str, Any]:
    feature_cols = [
        c
        for c in df.select_dtypes(include="number").columns
        if c not in [label_col, protected_attr]
    ]
    if not feature_cols:
        return {
            "method": "fallback",
            "counterfactuals": [],
            "summary": "Insufficient numeric data for recourse generation.",
            "note": f"DiCE unavailable: {error[:80]}",
        }

    label_max = df[label_col].max()
    positives = df[df[label_col] == label_max][feature_cols].dropna()
    if positives.empty:
        return {
            "method": "fallback",
            "counterfactuals": [],
            "summary": "No positive examples available to anchor recourse on.",
            "note": f"DiCE unavailable: {error[:80]}",
        }

    medians = positives.median(numeric_only=True)
    row_vec = np.array(
        [float(rejected_row.get(c, medians[c])) for c in feature_cols]
    )
    dists = np.linalg.norm(positives.values - row_vec, axis=1)
    closest = positives.iloc[dists.argsort()[:n]]

    suggestions: List[Dict[str, Any]] = []
    for _, cf in closest.iterrows():
        changes: Dict[str, Dict[str, Any]] = {}
        for i, c in enumerate(feature_cols):
            cf_val = float(cf[c])
            if abs(cf_val - row_vec[i]) > 0.01:
                changes[c] = {
                    "from": round(float(row_vec[i]), 3),
                    "to": round(cf_val, 3),
                    "direction": "increase" if cf_val > row_vec[i] else "decrease",
                }
        if changes:
            suggestions.append(
                {
                    "changes_needed": changes,
                    "n_features_to_change": len(changes),
                }
            )

    return {
        "method": "nearest_neighbor_fallback",
        "counterfactuals": suggestions[:n],
        "summary": "Estimated recourse using nearest positive examples.",
        "note": f"DiCE unavailable: {error[:80]}",
    }
