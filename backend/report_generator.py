"""PDF audit report generation.

Renders a 6-page, dark-themed, professionally formatted bias-audit PDF using
WeasyPrint + Jinja2. All charts are produced inline as base64 PNGs by
matplotlib so the resulting PDF has zero external network references.
"""

from __future__ import annotations

import base64
import io
import os
import platform
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List


# ---------------------------------------------------------------------------
# macOS only: ensure WeasyPrint's CFFI loader can find Homebrew-installed
# Pango/Cairo/GObject. On Linux (Docker / Railway) the libs live in /usr/lib
# and these paths are simply absent, so this is a no-op there.
# ---------------------------------------------------------------------------
if platform.system() == "Darwin":
    _HOMEBREW_LIB_PATHS = ["/opt/homebrew/lib", "/usr/local/lib"]
    _existing = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
    _extra = [p for p in _HOMEBREW_LIB_PATHS if os.path.isdir(p) and p not in _existing]
    if _extra:
        os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = ":".join(
            [*_extra, _existing] if _existing else _extra
        )

import matplotlib

matplotlib.use("Agg")  # headless backend, no GUI required
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Wedge
import numpy as np
from jinja2 import Environment, FileSystemLoader, select_autoescape

try:
    from weasyprint import HTML
except OSError as exc:  # pragma: no cover — surfaces a clear hint on macOS
    if platform.system() == "Darwin":
        sys.stderr.write(
            "\n[report_generator] WeasyPrint failed to load native libs.\n"
            "  Install them with: brew install pango cairo libffi\n"
            f"  Original error: {exc}\n\n"
        )
    raise

from database import AuditRun, User


TEMPLATE_DIR = os.path.dirname(os.path.abspath(__file__))

# ---- Brand palette (mirrors frontend design tokens) ----
BG_DARK = "#0A0B0F"
BG_CARD = "#13151C"
BRAND_PURPLE = "#6C63FF"
GRID_COLOR = "#2A2D3E"
TEXT_PRIMARY = "#FFFFFF"
TEXT_SECONDARY = "#A8AAB8"
GREEN = "#22C55E"
AMBER = "#F59E0B"
RED = "#EF4444"


# ---------------------------------------------------------------------------
# Small color / formatting helpers
# ---------------------------------------------------------------------------


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _rgba(hex_color: str, alpha: float) -> str:
    r, g, b = _hex_to_rgb(hex_color)
    return f"rgba({r}, {g}, {b}, {alpha:.2f})"


def _severity_color(score: float) -> str:
    if score < 0.4:
        return GREEN
    if score < 0.7:
        return AMBER
    return RED


def _severity_label(score: float) -> str:
    if score < 0.4:
        return "Low"
    if score < 0.7:
        return "Medium"
    return "High"


def _fig_to_base64_png(fig, dpi: int = 160) -> str:
    """Serialize a matplotlib Figure to a base64-encoded PNG data-URI."""
    buf = io.BytesIO()
    fig.savefig(
        buf,
        format="png",
        dpi=dpi,
        bbox_inches="tight",
        facecolor=fig.get_facecolor(),
        edgecolor="none",
    )
    plt.close(fig)
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


# ---------------------------------------------------------------------------
# Chart generators
# ---------------------------------------------------------------------------


def make_risk_gauge_chart(risk_score: float) -> str:
    """Semi-circle gauge with three colored zones and a needle pointer."""
    score = max(0.0, min(1.0, float(risk_score)))

    fig, ax = plt.subplots(figsize=(6.0, 3.6), facecolor=BG_DARK)
    ax.set_facecolor(BG_DARK)

    inner_radius, outer_radius = 0.72, 1.02

    # Score 0 sits at angle 180°, score 1 at 0°. Draw the three zones.
    zones = [
        (0.0, 0.4, GREEN),
        (0.4, 0.7, AMBER),
        (0.7, 1.0, RED),
    ]
    for start, end, color in zones:
        theta1 = 180 - end * 180
        theta2 = 180 - start * 180
        ax.add_patch(
            Wedge(
                center=(0, 0),
                r=outer_radius,
                theta1=theta1,
                theta2=theta2,
                width=outer_radius - inner_radius,
                facecolor=color,
                edgecolor=BG_DARK,
                linewidth=1.2,
            )
        )

    # Needle.
    needle_angle_deg = 180 - score * 180
    rad = np.deg2rad(needle_angle_deg)
    needle_len = 0.88
    nx, ny = needle_len * np.cos(rad), needle_len * np.sin(rad)
    ax.plot([0, nx], [0, ny], color="white", linewidth=3.2, solid_capstyle="round", zorder=5)
    ax.add_patch(Circle((0, 0), 0.07, color="white", zorder=6))
    ax.add_patch(Circle((0, 0), 0.04, color=BG_DARK, zorder=7))

    # Big centered number.
    ax.text(
        0,
        -0.20,
        f"{score:.0%}",
        ha="center",
        va="center",
        fontsize=44,
        fontweight="bold",
        color="white",
    )
    ax.text(
        0,
        -0.45,
        "Overall Risk Score",
        ha="center",
        va="center",
        fontsize=11,
        color=TEXT_SECONDARY,
    )

    # Tick labels for zone boundaries.
    for boundary, label in [(0.0, "0%"), (0.4, "40%"), (0.7, "70%"), (1.0, "100%")]:
        a = np.deg2rad(180 - boundary * 180)
        ax.text(
            (outer_radius + 0.10) * np.cos(a),
            (outer_radius + 0.10) * np.sin(a),
            label,
            ha="center",
            va="center",
            color=TEXT_SECONDARY,
            fontsize=8,
        )

    ax.set_xlim(-1.25, 1.25)
    ax.set_ylim(-0.65, 1.25)
    ax.set_aspect("equal")
    ax.axis("off")
    return _fig_to_base64_png(fig)


def make_disparate_impact_chart(bias_results: dict) -> str:
    """Horizontal bar chart of disparate-impact ratios with the 80% threshold."""
    attrs = list((bias_results or {}).keys())
    values = [float(bias_results[a].get("disparate_impact", 0.0)) for a in attrs]

    if not attrs:
        fig, ax = plt.subplots(figsize=(8, 2.2), facecolor=BG_CARD)
        ax.set_facecolor(BG_CARD)
        ax.text(
            0.5,
            0.5,
            "No protected-attribute results to display",
            ha="center",
            va="center",
            color=TEXT_SECONDARY,
            fontsize=12,
        )
        ax.axis("off")
        return _fig_to_base64_png(fig)

    height = max(2.0, 0.45 * len(attrs) + 1.1)
    fig, ax = plt.subplots(figsize=(8.5, height), facecolor=BG_CARD)
    ax.set_facecolor(BG_CARD)

    colors = [
        RED if v < 0.8 else AMBER if v < 0.9 else GREEN
        for v in values
    ]

    y = np.arange(len(attrs))
    ax.barh(
        y,
        values,
        color=colors,
        edgecolor="none",
        height=0.55,
        zorder=3,
    )

    # 80% legal threshold.
    ax.axvline(
        0.8,
        color="white",
        linestyle="--",
        linewidth=1.4,
        alpha=0.85,
        zorder=4,
    )
    # Place the threshold label above the plot area (axes coords) so it never
    # collides with the bars.
    ax.text(
        0.8,
        1.02,
        "Legal threshold (80% rule)",
        color="white",
        fontsize=9,
        ha="center",
        va="bottom",
        transform=ax.get_xaxis_transform(),
    )

    for i, v in enumerate(values):
        ax.text(
            min(v + 0.02, 1.18),
            i,
            f"{v:.2f}",
            color="white",
            va="center",
            fontsize=10,
            fontweight="bold",
        )

    ax.set_yticks(y)
    ax.set_yticklabels(attrs, color="white", fontsize=11)
    ax.tick_params(axis="x", colors=TEXT_SECONDARY)
    upper = max(1.2, (max(values) if values else 1.0) * 1.18)
    ax.set_xlim(0, upper)
    ax.set_xlabel("Disparate Impact Ratio", color=TEXT_SECONDARY, fontsize=10)
    ax.grid(True, axis="x", color=GRID_COLOR, linestyle="-", linewidth=0.6, zorder=1)
    ax.invert_yaxis()
    for spine in ax.spines.values():
        spine.set_color(GRID_COLOR)
    return _fig_to_base64_png(fig)


def make_group_distribution_chart(group_distributions: dict) -> str:
    """Side-by-side bars showing privileged vs unprivileged counts per attribute."""
    attrs = list((group_distributions or {}).keys())

    if not attrs:
        fig, ax = plt.subplots(figsize=(8, 2.5), facecolor=BG_CARD)
        ax.set_facecolor(BG_CARD)
        ax.text(
            0.5,
            0.5,
            "No group distribution data available",
            ha="center",
            va="center",
            color=TEXT_SECONDARY,
            fontsize=12,
        )
        ax.axis("off")
        return _fig_to_base64_png(fig)

    privileged_counts: List[int] = []
    unpriv_counts: List[int] = []
    for attr in attrs:
        groups = group_distributions[attr] or {}
        # After binarization the keys are typically "0" and "1".
        priv = sum(int(v) for k, v in groups.items() if str(k) == "1")
        unpriv = sum(int(v) for k, v in groups.items() if str(k) == "0")
        if priv == 0 and unpriv == 0:
            # Fall back: largest = privileged, rest = unprivileged.
            sorted_items = sorted(groups.items(), key=lambda kv: int(kv[1]), reverse=True)
            if sorted_items:
                priv = int(sorted_items[0][1])
                unpriv = sum(int(v) for _, v in sorted_items[1:])
        privileged_counts.append(priv)
        unpriv_counts.append(unpriv)

    fig, ax = plt.subplots(figsize=(8.5, 3.6), facecolor=BG_CARD)
    ax.set_facecolor(BG_CARD)

    bar_width = 0.36
    positions = np.arange(len(attrs))

    ax.bar(
        positions - bar_width / 2,
        privileged_counts,
        width=bar_width,
        color=BRAND_PURPLE,
        label="Privileged group",
        edgecolor="none",
        zorder=3,
    )
    ax.bar(
        positions + bar_width / 2,
        unpriv_counts,
        width=bar_width,
        color="#9DA0FF",
        label="Unprivileged group",
        edgecolor="none",
        zorder=3,
    )

    for i, (p, u) in enumerate(zip(privileged_counts, unpriv_counts)):
        ax.text(positions[i] - bar_width / 2, p, f"{p:,}", ha="center", va="bottom",
                color="white", fontsize=9, fontweight="bold")
        ax.text(positions[i] + bar_width / 2, u, f"{u:,}", ha="center", va="bottom",
                color="white", fontsize=9, fontweight="bold")

    ax.set_xticks(positions)
    ax.set_xticklabels(attrs, color="white", fontsize=11)
    ax.tick_params(axis="y", colors=TEXT_SECONDARY)
    ax.set_ylabel("Records", color=TEXT_SECONDARY, fontsize=10)
    legend = ax.legend(
        facecolor=BG_DARK,
        edgecolor=GRID_COLOR,
        labelcolor="white",
        fontsize=9,
        loc="upper right",
    )
    legend.get_frame().set_linewidth(0.6)
    ax.grid(True, axis="y", color=GRID_COLOR, linewidth=0.6, zorder=1)
    for spine in ax.spines.values():
        spine.set_color(GRID_COLOR)

    # Stretch ymax so labels don't clip the legend.
    ymax = max([*privileged_counts, *unpriv_counts, 1])
    ax.set_ylim(0, ymax * 1.22)
    return _fig_to_base64_png(fig)


# ---------------------------------------------------------------------------
# Narrative builders
# ---------------------------------------------------------------------------


def _build_recommendations(bias_results: dict, overall_risk_score: float) -> List[Dict[str, Any]]:
    recs: List[Dict[str, Any]] = []
    has_di_fail = any(
        float(r.get("disparate_impact", 1.0)) < 0.8
        for r in (bias_results or {}).values()
    )

    if has_di_fail:
        recs.append({
            "icon": "⚖",
            "title": "Re-weighting",
            "description": (
                "Apply pre-processing reweighting (Kamiran-Calders) to balance instance "
                "weights across protected groups before model training. This counteracts "
                "historical sampling bias without modifying the underlying records."
            ),
            "effort": "Low",
        })
        recs.append({
            "icon": "◈",
            "title": "Adversarial Debiasing",
            "description": (
                "Train the predictor jointly with an adversary that tries to recover the "
                "protected attribute from predictions. The adversary's loss is back-propagated "
                "as a fairness penalty, forcing demographic parity at training time."
            ),
            "effort": "High",
        })

    if overall_risk_score > 0.5:
        recs.append({
            "icon": "◎",
            "title": "Threshold Calibration",
            "description": (
                "Compute group-specific decision thresholds that equalize the false-positive "
                "rate across protected groups. This is a post-processing technique that "
                "does not require retraining the underlying model."
            ),
            "effort": "Medium",
        })

    recs.append({
        "icon": "◉",
        "title": "Continuous Monitoring",
        "description": (
            "Stream production predictions through automated fairness checks and alert "
            "when demographic-parity or equalized-odds drift exceed configured thresholds. "
            "Pair with weekly audit snapshots stored alongside model artifacts."
        ),
        "effort": "Medium",
    })

    return recs


def _build_compliance_rows(bias_results: dict) -> List[Dict[str, Any]]:
    di_values = [
        float(r.get("disparate_impact", 1.0))
        for r in (bias_results or {}).values()
    ]
    worst_di = min(di_values) if di_values else 1.0
    eeoc_pass = worst_di >= 0.8

    return [
        {
            "regulation": "EEOC 80% Rule",
            "requirement": "Disparate Impact ≥ 0.80",
            "status": "PASS" if eeoc_pass else "FAIL",
            "icon": "✓" if eeoc_pass else "✗",
            "evidence": f"Worst DI = {worst_di:.2f}",
            "color": GREEN if eeoc_pass else RED,
            "bg": _rgba(GREEN if eeoc_pass else RED, 0.18),
        },
        {
            "regulation": "EU AI Act Art. 10",
            "requirement": "Data governance & quality",
            "status": "REVIEW",
            "icon": "!",
            "evidence": "Manual review required",
            "color": AMBER,
            "bg": _rgba(AMBER, 0.18),
        },
        {
            "regulation": "GDPR Art. 22",
            "requirement": "Automated decision explainability",
            "status": "REVIEW",
            "icon": "!",
            "evidence": "Implement audit trail",
            "color": AMBER,
            "bg": _rgba(AMBER, 0.18),
        },
    ]


def _build_key_findings(bias_results: dict, overall_risk_score: float) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    failing = [
        (attr, float(r.get("disparate_impact", 1.0)))
        for attr, r in (bias_results or {}).items()
        if float(r.get("disparate_impact", 1.0)) < 0.8
    ]
    for attr, di in failing:
        findings.append({
            "icon": "⚠",
            "color": RED,
            "text": (
                f"<strong>{attr}</strong> attribute fails the 80% legal threshold "
                f"(DI = {di:.2f})."
            ),
        })

    if overall_risk_score > 0.7:
        findings.append({
            "icon": "●",
            "color": RED,
            "text": (
                "<strong>High overall risk detected</strong> — immediate mitigation "
                "is recommended before any production deployment."
            ),
        })

    if not findings:
        findings.append({
            "icon": "✓",
            "color": GREEN,
            "text": (
                "<strong>All measured attributes meet fairness thresholds.</strong> "
                "Continue routine monitoring at the configured cadence."
            ),
        })

    return findings


def _interpretation_paragraph(bias_results: dict) -> str:
    if not bias_results:
        return "No protected-attribute results were available to interpret."

    worst_attr = min(
        bias_results.keys(),
        key=lambda a: float(bias_results[a].get("disparate_impact", 1.0)),
    )
    di = float(bias_results[worst_attr].get("disparate_impact", 1.0))
    spd = float(bias_results[worst_attr].get("statistical_parity_difference", 0.0))
    direction = "less" if spd < 0 else "more"
    gap_pp = abs(spd) * 100

    return (
        f"For the <strong>{worst_attr}</strong> attribute, the disparate-impact ratio "
        f"is <strong>{di:.2f}</strong> with a statistical-parity difference of "
        f"<strong>{spd:+.3f}</strong>. The unprivileged group is approximately "
        f"<strong>{gap_pp:.1f} percentage points {direction} likely</strong> to "
        f"receive a positive outcome compared to the privileged group, representing "
        f"the largest fairness gap in this dataset."
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def generate_audit_pdf(run: AuditRun, user: User) -> bytes:
    """Render the full 6-page audit report and return the raw PDF bytes."""
    bias_results: Dict[str, Any] = run.bias_results or {}
    dataset_summary: Dict[str, Any] = run.dataset_summary or {}
    auto_detected: Dict[str, Any] = run.auto_detected_attrs or {}
    overall_risk_score = float(run.overall_risk_score or 0.0)

    # ---- charts ----------------------------------------------------------
    risk_chart = make_risk_gauge_chart(overall_risk_score)
    disparate_impact_chart = make_disparate_impact_chart(bias_results)
    group_chart = make_group_distribution_chart(
        dataset_summary.get("group_distributions", {})
    )

    # ---- per-attribute analysis blocks ----------------------------------
    attr_sections: List[Dict[str, Any]] = []
    for attr, r in bias_results.items():
        di = float(r.get("disparate_impact", 0.0))
        spd = float(r.get("statistical_parity_difference", 0.0))
        passes = bool(r.get("passes_80_percent_rule", False))
        severity = str(r.get("severity", "low")).lower()
        sev_color = {"low": GREEN, "medium": AMBER, "high": RED}.get(severity, GREEN)
        di_color = RED if di < 0.8 else AMBER if di < 0.9 else GREEN
        # Bar fills 0..1.2 of the visual range; 0.8 threshold sits at 0.8/1.2 ≈ 67%.
        max_axis = 1.2
        di_percent = max(0.0, min(100.0, (di / max_axis) * 100))
        threshold_percent = (0.8 / max_axis) * 100

        attr_sections.append({
            "attr": attr,
            "severity_label": severity.upper(),
            "severity_color": sev_color,
            "severity_bg": _rgba(sev_color, 0.18),
            "metrics": [
                {
                    "name": "Disparate Impact",
                    "value": f"{di:.3f}",
                    "pass": di >= 0.8,
                },
                {
                    "name": "Statistical Parity Diff",
                    "value": f"{spd:+.3f}",
                    "pass": abs(spd) < 0.1,
                },
                {
                    "name": "Passes 80% Rule",
                    "value": "Yes" if passes else "No",
                    "pass": passes,
                },
            ],
            "di_value": di,
            "di_color": di_color,
            "di_percent": di_percent,
            "threshold_percent": threshold_percent,
        })

    # ---- group distribution tables --------------------------------------
    group_tables: List[Dict[str, Any]] = []
    group_distributions: Dict[str, Dict[str, int]] = (
        dataset_summary.get("group_distributions", {}) or {}
    )
    label_distribution = dataset_summary.get("label_distribution", {}) or {}
    overall_pos_rate = float(label_distribution.get("positive_rate", 0.0))

    for attr, groups in group_distributions.items():
        rows: List[Dict[str, Any]] = []
        total = sum(int(v) for v in groups.values()) or 1
        for g_name, count in groups.items():
            count_int = int(count)
            pct = (count_int / total) * 100
            rows.append({
                "group": str(g_name),
                "count": count_int,
                "percent": f"{pct:.1f}%",
                "positive_rate": f"{overall_pos_rate * 100:.1f}%",
            })
        group_tables.append({"attr": attr, "rows": rows})

    # ---- header / footer text -------------------------------------------
    if run.created_at:
        ts = run.created_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        timestamp_str = ts.strftime("%B %d, %Y · %H:%M UTC")
    else:
        timestamp_str = datetime.now(timezone.utc).strftime("%B %d, %Y · %H:%M UTC")

    run_id_short = (run.id or "")[:8]
    footer_center_text = f"{run_id_short} · {timestamp_str}"

    rendered_data = {
        "user": user,
        "run": run,
        "run_id": run.id,
        "run_id_short": run_id_short,
        "filename": run.filename or "uploaded.csv",
        "timestamp": timestamp_str,
        "footer_center_text": footer_center_text,

        "row_count": dataset_summary.get("row_count", run.row_count) or 0,
        "column_count": dataset_summary.get("column_count", "—"),
        "n_attrs": len(bias_results),

        "overall_risk_score": overall_risk_score,
        "risk_score_pct": f"{overall_risk_score:.0%}",
        "risk_label": _severity_label(overall_risk_score),
        "risk_color": _severity_color(overall_risk_score),
        "risk_bg": _rgba(_severity_color(overall_risk_score), 0.20),

        "label_col": auto_detected.get("label_col") or run.auto_detected_label or "—",
        "label_confidence": float(auto_detected.get("label_col_confidence", 0.7)),
        "protected_attrs": auto_detected.get("protected_attrs") or list(bias_results.keys()),

        "key_findings": _build_key_findings(bias_results, overall_risk_score),
        "risk_chart": risk_chart,
        "disparate_impact_chart": disparate_impact_chart,
        "group_distribution_chart": group_chart,
        "attr_sections": attr_sections,
        "group_tables": group_tables,
        "interpretation": _interpretation_paragraph(bias_results),
        "recommendations": _build_recommendations(bias_results, overall_risk_score),
        "compliance_rows": _build_compliance_rows(bias_results),
    }

    env = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(["html", "xml"]),
    )
    template = env.get_template("report_template.html")
    html_content = template.render(**rendered_data)

    return HTML(string=html_content, base_url=TEMPLATE_DIR).write_pdf()
