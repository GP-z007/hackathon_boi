from __future__ import annotations

from typing import Dict

import pandas as pd
from aif360.datasets import BinaryLabelDataset
from aif360.metrics import BinaryLabelDatasetMetric
from fairlearn.metrics import (
    MetricFrame,
    demographic_parity_difference,
    equalized_odds_difference,
)
from sklearn.metrics import accuracy_score


def run_data_audit(df: pd.DataFrame, label_col: str, protected_attr: str) -> dict:
    dataset = BinaryLabelDataset(
        df=df.copy(),
        label_names=[label_col],
        protected_attribute_names=[protected_attr],
    )
    metric = BinaryLabelDatasetMetric(
        dataset,
        unprivileged_groups=[{protected_attr: 0}],
        privileged_groups=[{protected_attr: 1}],
    )

    disparate_impact = float(metric.disparate_impact())
    statistical_parity_difference = float(metric.statistical_parity_difference())
    mean_difference = float(metric.mean_difference())

    return {
        "disparate_impact": disparate_impact,
        "statistical_parity_difference": statistical_parity_difference,
        "mean_difference": mean_difference,
        "passes_80_percent_rule": bool(disparate_impact >= 0.8),
    }


def run_model_fairness(y_true, y_pred, sensitive_features) -> Dict[str, object]:
    metric_frame = MetricFrame(
        metrics={"accuracy": accuracy_score},
        y_true=y_true,
        y_pred=y_pred,
        sensitive_features=sensitive_features,
    )
    accuracy_by_group = {
        str(group): float(score)
        for group, score in metric_frame.by_group["accuracy"].to_dict().items()
    }

    demographic_parity_diff = float(
        demographic_parity_difference(y_true=y_true, y_pred=y_pred, sensitive_features=sensitive_features)
    )
    equalized_odds_diff = float(
        equalized_odds_difference(y_true=y_true, y_pred=y_pred, sensitive_features=sensitive_features)
    )
    overall_accuracy = float(accuracy_score(y_true, y_pred))

    return {
        "accuracy_by_group": accuracy_by_group,
        "demographic_parity_diff": demographic_parity_diff,
        "equalized_odds_diff": equalized_odds_diff,
        "overall_accuracy": overall_accuracy,
    }
