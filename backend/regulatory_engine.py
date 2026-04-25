"""Regulatory-compliance evaluation for fairness audits.

The :data:`REGULATIONS` registry encodes the metric thresholds and
procedural requirements of major fairness regulations. The
:func:`check_compliance` function consumes the structured
``bias_results`` dict produced by ``run_data_audit`` (one entry per
protected attribute) and returns a per-regulation PASS / FAIL /
MANUAL_REVIEW report.
"""

from __future__ import annotations

from typing import Any, Dict


REGULATIONS: Dict[str, Dict[str, Any]] = {
    "EEOC_80_RULE": {
        "name": "EEOC Four-Fifths (80%) Rule",
        "jurisdiction": "United States",
        "applies_to": ["hiring", "promotion", "termination"],
        "metrics": {"disparate_impact": {"min": 0.80}},
        "legal_basis": "Uniform Guidelines on Employee Selection Procedures (1978)",
        "penalty": "EEOC enforcement action, civil lawsuit",
    },
    "NYC_LL144": {
        "name": "NYC Local Law 144 (2023)",
        "jurisdiction": "New York City, USA",
        "applies_to": ["hiring"],
        "metrics": {"disparate_impact": {"min": 0.80}},
        "requirements": [
            "annual_independent_audit",
            "public_disclosure",
            "candidate_notice",
        ],
        "effective_date": "2023-07-05",
        "penalty": "Up to $1,500 per violation per day",
    },
    "EU_AI_ACT": {
        "name": "EU AI Act - High Risk (Art. 10)",
        "jurisdiction": "European Union",
        "applies_to": [
            "hiring",
            "credit",
            "education",
            "law_enforcement",
            "medical",
        ],
        "metrics": {
            "demographic_parity_diff": {"max": 0.10},
            "equalized_odds_diff": {"max": 0.10},
        },
        "requirements": [
            "conformity_assessment",
            "technical_documentation",
            "human_oversight",
            "transparency",
        ],
        "effective_date": "2026-08-02",
        "penalty": "Up to EUR 30M or 6% of global annual turnover",
    },
    "GDPR_ART22": {
        "name": "GDPR Article 22 - Automated Decisions",
        "jurisdiction": "European Union",
        "applies_to": ["all_automated_decisions"],
        "requirements": [
            "right_to_explanation",
            "human_review_on_request",
            "audit_trail",
        ],
        "penalty": "Up to EUR 20M or 4% of global annual turnover",
    },
    "NIST_AI_RMF": {
        "name": "NIST AI Risk Management Framework",
        "jurisdiction": "United States (voluntary)",
        "applies_to": ["all"],
        "requirements": ["govern", "map", "measure", "manage"],
        "note": (
            "Voluntary framework - increasingly required by US federal contracts"
        ),
    },
    "ISO_42001": {
        "name": "ISO/IEC 42001 - AI Management Systems",
        "jurisdiction": "International",
        "applies_to": ["all"],
        "requirements": [
            "ai_policy",
            "risk_assessment",
            "impact_assessment",
            "continual_improvement",
        ],
        "note": (
            "Certifiable standard, increasingly required by enterprise procurement"
        ),
    },
}


def check_compliance(
    bias_results: Dict[str, Dict[str, Any]],
    use_case: str,
    jurisdiction: str = "all",  # noqa: ARG001 - reserved for future filtering
) -> Dict[str, Any]:
    """Check every applicable regulation for the supplied ``use_case``.

    ``bias_results`` is the per-attribute dict produced by
    :func:`bias_engine.run_data_audit`.
    """
    report: Dict[str, Any] = {}
    for reg_id, reg in REGULATIONS.items():
        applies_to = reg.get("applies_to", [])
        if (
            "all" not in applies_to
            and "all_automated_decisions" not in applies_to
            and use_case not in applies_to
        ):
            continue

        checks = []
        passed = True
        for metric, threshold in reg.get("metrics", {}).items():
            for attr_name, attr_results in bias_results.items():
                value = attr_results.get(metric)
                if value is None:
                    continue
                try:
                    value = float(value)
                except (TypeError, ValueError):
                    continue
                if "min" in threshold and value < threshold["min"]:
                    checks.append(
                        {
                            "metric": metric,
                            "attribute": attr_name,
                            "value": value,
                            "threshold": threshold["min"],
                            "status": "FAIL",
                            "evidence": (
                                f"{metric} = {value:.3f}, "
                                f"required >= {threshold['min']}"
                            ),
                        }
                    )
                    passed = False
                elif "max" in threshold and value > threshold["max"]:
                    checks.append(
                        {
                            "metric": metric,
                            "attribute": attr_name,
                            "value": value,
                            "threshold": threshold["max"],
                            "status": "FAIL",
                            "evidence": (
                                f"{metric} = {value:.3f}, "
                                f"required <= {threshold['max']}"
                            ),
                        }
                    )
                    passed = False
                else:
                    checks.append(
                        {
                            "metric": metric,
                            "attribute": attr_name,
                            "value": value,
                            "status": "PASS",
                        }
                    )

        if not checks:
            overall_status = "MANUAL_REVIEW"
        elif passed:
            overall_status = "PASS"
        else:
            overall_status = "FAIL"

        report[reg_id] = {
            "regulation": reg["name"],
            "jurisdiction": reg["jurisdiction"],
            "overall_status": overall_status,
            "metric_checks": checks,
            "procedural_requirements": reg.get("requirements", []),
            "penalty": reg.get("penalty", "N/A"),
            "effective_date": reg.get("effective_date", "In force"),
        }
    return report
