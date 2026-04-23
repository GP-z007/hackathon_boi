from typing import Any, Dict

from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    label_col: str
    protected_attr: str


class AuditResult(BaseModel):
    run_id: str
    timestamp: str
    disparate_impact: float
    statistical_parity_difference: float
    passes_80_percent_rule: bool


class MetricResponse(BaseModel):
    run_id: str
    results: Dict[str, Any]
