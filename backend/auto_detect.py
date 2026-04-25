from __future__ import annotations

import re
from typing import Any, Dict, List

import pandas as pd
from pandas.api.types import is_numeric_dtype, is_string_dtype

LABEL_KEYWORDS = [
    "survived",
    "outcome",
    "label",
    "target",
    "result",
    "decision",
    "approved",
    "hired",
    "granted",
    "class",
    "y",
    "output",
    "predict",
]

PROTECTED_KEYWORDS = [
    "gender",
    "sex",
    "race",
    "ethnicity",
    "age",
    "religion",
    "nationality",
    "disability",
    "marital",
    "color",
    "caste",
    "tribe",
]

FAVORABLE_TEXT = {"yes", "true", "approved", "approve", "pass", "hired", "granted", "1", "positive"}


def _to_lower(value: Any) -> str:
    return str(value).strip().lower()


def _label_name_matches(name: str, keyword: str) -> bool:
    """Match label keywords; avoid false positives like ``Pclass`` for keyword ``class``."""
    lowered = name.lower()
    if keyword == "class":
        return bool(re.search(r"(?<![a-z0-9_])class(?![a-z0-9_])", lowered))
    if keyword == "y":
        return lowered == "y" or lowered.endswith("_y") or lowered.startswith("y_")
    return keyword in lowered


def _name_matches(name: str, keywords: List[str]) -> bool:
    return any(_label_name_matches(name, kw) for kw in keywords)


def _protected_name_matches(name: str, keywords: List[str]) -> bool:
    lowered = name.lower()
    return any(keyword in lowered for keyword in keywords)


def _eligible_group_distribution(series: pd.Series) -> bool:
    non_null = series.dropna()
    if non_null.empty:
        return False
    proportions = non_null.value_counts(normalize=True)
    return (proportions >= 0.05).sum() >= 2


def _binarize_label(series: pd.Series) -> tuple[pd.Series, dict]:
    cleaned = series.dropna()
    if cleaned.empty:
        return series.fillna(0).astype(int), {"positive_values": [], "negative_values": []}

    unique_values = set(cleaned.unique())
    if unique_values.issubset({0, 1}):
        return series.fillna(0).astype(int), {"positive_values": [1], "negative_values": [0]}

    mapping: Dict[Any, int] = {}
    favorable_values: set[Any] = set()

    if is_numeric_dtype(cleaned):
        max_val = cleaned.max()
        favorable_values.add(max_val)
    else:
        lowered_map = {_to_lower(v): v for v in cleaned.unique()}
        text_favorable = [lowered_map[k] for k in lowered_map if k in FAVORABLE_TEXT]
        if text_favorable:
            favorable_values.update(text_favorable)
        else:
            # Use highest lexicographic value as deterministic fallback for non-numeric labels.
            favorable_values.add(sorted(cleaned.unique(), key=lambda v: _to_lower(v))[-1])

    for value in series.unique():
        if pd.isna(value):
            mapping[value] = 0
        else:
            mapping[value] = 1 if value in favorable_values else 0

    binarized = series.map(mapping).fillna(0).astype(int)
    return binarized, {
        "positive_values": [str(v) for v in favorable_values],
        "negative_values": [str(v) for v in set(cleaned.unique()) - favorable_values],
    }


def _binarize_protected(series: pd.Series) -> tuple[pd.Series, dict]:
    non_null = series.dropna()
    if non_null.empty:
        return series.fillna(0).astype(int), {"privileged": None, "mapping": {}}

    counts = non_null.value_counts()
    privileged = counts.idxmax()
    mapping = {value: (1 if value == privileged else 0) for value in non_null.unique()}
    binarized = series.map(mapping).fillna(0).astype(int)
    return binarized, {
        "privileged": str(privileged),
        "mapping": {str(k): int(v) for k, v in mapping.items()},
    }


def auto_detect_columns(df: pd.DataFrame) -> dict:
    """
    Automatically detects the label column and protected attributes
    from any CSV. No user input required.
    Returns: {
        "label_col": str,
        "protected_attrs": list[str],
        "confidence": dict,
        "reasoning": dict
    }
    """
    if df.empty or not len(df.columns):
        raise ValueError("Dataset is empty; unable to detect columns.")

    work_df = df.copy()
    confidence: Dict[str, float] = {}
    reasoning: Dict[str, str] = {}
    binarization_mappings: Dict[str, dict] = {}

    # Label detection.
    name_matches = [col for col in work_df.columns if _name_matches(col, LABEL_KEYWORDS)]
    if name_matches:
        label_col = name_matches[0]
        confidence[label_col] = 1.0
        reasoning[label_col] = "label column chosen via keyword name match"
    else:
        binary_candidates = []
        for col in work_df.columns:
            unique_non_null = work_df[col].dropna().unique()
            if len(unique_non_null) == 2:
                counts = work_df[col].value_counts(normalize=True)
                balance = float((counts - 0.5).abs().sum())
                binary_candidates.append((balance, col))
        if binary_candidates:
            _, label_col = sorted(binary_candidates, key=lambda item: item[0])[0]
            confidence[label_col] = 0.7
            reasoning[label_col] = "label column chosen as most balanced binary feature"
        else:
            label_col = str(work_df.columns[-1])
            confidence[label_col] = 0.5
            reasoning[label_col] = "label column fallback to final dataframe column"

    # Label binarization.
    work_df[label_col], label_mapping = _binarize_label(work_df[label_col])
    binarization_mappings[label_col] = label_mapping

    # Protected attribute detection.
    candidates: List[tuple[float, str, str]] = []
    for col in work_df.columns:
        if col == label_col:
            continue
        is_name_match = _protected_name_matches(col, PROTECTED_KEYWORDS)
        is_low_cardinality = (
            is_string_dtype(work_df[col]) or work_df[col].nunique(dropna=True) < 10
        ) and _eligible_group_distribution(work_df[col])
        if is_name_match:
            candidates.append((1.0, col, "name match"))
        elif is_low_cardinality:
            candidates.append((0.6, col, "low cardinality categorical with adequate group support"))

    # Deduplicate by best score then take top 3.
    best_by_col: Dict[str, tuple[float, str]] = {}
    for score, col, reason in candidates:
        if col not in best_by_col or score > best_by_col[col][0]:
            best_by_col[col] = (score, reason)

    ranked = sorted(best_by_col.items(), key=lambda item: item[1][0], reverse=True)[:3]
    protected_attrs = [col for col, _ in ranked]

    for col, (score, reason) in ranked:
        confidence[col] = score
        reasoning[col] = reason
        if work_df[col].nunique(dropna=True) > 2:
            work_df[col], mapping = _binarize_protected(work_df[col])
            binarization_mappings[col] = mapping
        elif not set(work_df[col].dropna().unique()).issubset({0, 1}):
            work_df[col], mapping = _binarize_protected(work_df[col])
            binarization_mappings[col] = mapping

    return {
        "label_col": label_col,
        "protected_attrs": protected_attrs,
        "confidence": confidence,
        "reasoning": reasoning,
        "binarization_mappings": binarization_mappings,
        "transformed_df": work_df,
    }


def summarize_dataset(df: pd.DataFrame, label_col: str, protected_attrs: list) -> dict:
    row_count = int(len(df))
    column_count = int(len(df.columns))

    label_counts = df[label_col].value_counts(dropna=False).to_dict() if label_col in df.columns else {}
    label_distribution = {str(k): int(v) for k, v in label_counts.items()}
    positives = int(label_distribution.get("1", 0))
    total_labels = sum(label_distribution.values())
    label_distribution["positive_rate"] = float(positives / total_labels) if total_labels else 0.0

    group_distributions: Dict[str, dict] = {}
    tiny_group_penalties: List[float] = []
    for attr in protected_attrs:
        if attr not in df.columns:
            continue
        counts = df[attr].value_counts(dropna=False)
        group_distributions[attr] = {str(k): int(v) for k, v in counts.to_dict().items()}
        if row_count:
            tiny_share = float((counts / row_count < 0.05).mean())
            tiny_group_penalties.append(tiny_share)

    missing_values = {col: int(df[col].isna().sum()) for col in df.columns}
    total_cells = max(row_count * max(column_count, 1), 1)
    missing_ratio = float(sum(missing_values.values()) / total_cells)
    tiny_group_penalty = float(sum(tiny_group_penalties) / len(tiny_group_penalties)) if tiny_group_penalties else 0.0

    dataset_quality_score = max(0.0, min(1.0, 1.0 - (0.6 * missing_ratio) - (0.4 * tiny_group_penalty)))

    return {
        "row_count": row_count,
        "column_count": column_count,
        "label_distribution": label_distribution,
        "group_distributions": group_distributions,
        "missing_values": missing_values,
        "dataset_quality_score": dataset_quality_score,
    }
