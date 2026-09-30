"""
Evaluation summaries and report artifacts.

    evaluation-summary.json   everything the Capstone Evaluation page shows
    evaluation-summary.csv    one row per scenario x detector
    evaluation-report.md      a human-readable report

No timestamps are written, so the same command and seed reproduce the same
files byte for byte.
"""

import csv
import io
import json
from dataclasses import asdict
from pathlib import Path

from app.evaluation import comparison, metrics
from app.evaluation.scenarios import END, MONITORING_DAYS, MONITORING_START, ONSET, REFERENCE_DAYS, START
from app.evaluation.types import (
    DETECTION_DEFINITION,
    DETECTOR_LABEL,
    DETECTORS,
    DISCLAIMER,
    LABEL,
    SECONDARY_EVENTS,
    RealizationResult,
    Scenario,
)

ROBUSTNESS_IDS = ("S13-moderate", "S09-reporting-gap", "S10-delayed-data", "S11-terminology")
COVERAGE_IDS = ("S13-moderate", "C2-coverage-2of3", "C1-coverage-1of3")
SENSITIVITY_FOCUS = ("S01-control", "S03-gradual", "S12-small-count", "S13-moderate")

CDC_WHO_ATTRIBUTES = [
    {"attribute": "Sensitivity", "status": "evaluated technically",
     "how": "Share of synthetic outbreak realizations (and outbreak days) each method detects."},
    {"attribute": "Positive predictive value", "status": "evaluated technically, design-dependent",
     "how": "Precision over the designed mix of outbreak and no-outbreak scenarios; real-world PPV depends on real outbreak frequency and cannot be inferred."},
    {"attribute": "Timeliness", "status": "evaluated technically",
     "how": "Detection delay from the known synthetic onset, including real-time replay with delayed results."},
    {"attribute": "Data quality", "status": "evaluated technically",
     "how": "Missing facility, delayed results, unmapped terminology and incomplete records, with Data Confidence alongside."},
    {"attribute": "Stability", "status": "evaluated technically",
     "how": "Alert-state transitions, false-alert episodes and share of normal days in alert."},
    {"attribute": "Flexibility", "status": "partly (design only)",
     "how": "Configurable parameters and syndrome-agnostic engine; not exercised on other syndromes."},
    {"attribute": "Simplicity", "status": "described, not measured",
     "how": "Each method's explanation is shown in plain language; no user study."},
    {"attribute": "Representativeness", "status": "cannot be established",
     "how": "Synthetic facilities and populations; no real population denominator."},
    {"attribute": "Acceptability", "status": "cannot be established",
     "how": "No real users, workflow or public-health partners."},
    {"attribute": "Usefulness", "status": "cannot be established",
     "how": "No real public-health action was informed by these signals."},
]

THREATS_TO_VALIDITY = [
    "Synthetic scenarios may not reflect real outbreaks: shapes, speeds and sizes were designed, not observed.",
    "Detector parameters (composite bands, EWMA lambda/k, CUSUM k/h) are illustrative and were not clinically validated.",
    "Only one respiratory syndrome is evaluated.",
    "Facility and geographic structure is simplified: three fictional facilities, three areas.",
    "Test-seeking behavior is synthetic (Poisson volumes, Binomial positivity); real testing has weekday, holiday and policy effects.",
    "There is no real population denominator.",
    "There is no seasonal structure: every scenario starts from a flat baseline.",
    "No real workflow or acceptability evaluation was done.",
    "There is no external epidemiological gold standard: ground truth is the scenario design itself.",
    "Realization-level precision depends on the designed mix of outbreak and no-outbreak scenarios.",
    "Outbreaks last to the end of each series; recovery behavior after an outbreak is not evaluated.",
]


def _timeline(result: RealizationResult) -> list[dict]:
    return [
        {
            "date": d.day.isoformat(),
            "truth": d.truth,
            "volume": d.volume,
            "positivity": None if d.positivity is None else round(d.positivity, 2),
            "composite_score": d.composite_score,
            "composite_severity": d.composite_severity,
            "data_confidence": d.data_confidence,
            "affected_facilities": d.affected_facilities,
            "ewma_overall": d.ewma_overall,
            "ewma_volume": d.ewma_volume,
            "ewma_positivity": d.ewma_positivity,
            "cusum_overall": d.cusum_overall,
            "cusum_volume": d.cusum_volume,
            "cusum_positivity": d.cusum_positivity,
            "cusum_volume_value": None if d.cusum_volume_value is None else round(d.cusum_volume_value, 3),
            "cusum_positivity_value": None if d.cusum_positivity_value is None else round(d.cusum_positivity_value, 3),
        }
        for d in result.days
    ]


def scenario_summary(scenario: Scenario, results: list[RealizationResult]) -> dict:
    representative = results[0]
    return {
        "id": scenario.id,
        "number": scenario.number,
        "name": scenario.name,
        "purpose": scenario.purpose,
        "description": scenario.description,
        "group": scenario.group,
        "conditions": list(scenario.conditions),
        "as_of": scenario.as_of,
        "compare_with": scenario.compare_with,
        "ground_truth": representative.truth.as_dict(),
        "realizations": len(results),
        "mean_observations": round(sum(r.observation_count for r in results) / len(results), 1),
        "detectors": metrics.all_detectors(results),
        "lead_lag": comparison.lead_lag(results) if scenario.outbreak_present else None,
        "secondary": metrics.secondary(results),
        "data_confidence": metrics.data_confidence(results),
        "representative": {
            "repetition": representative.repetition,
            "as_of_detection": {k: (v.isoformat() if v else None) for k, v in representative.as_of_detection.items()},
            "detections": {
                detector: (lambda o: o.detection_date.isoformat() if o.detection_date else None)(metrics.outcome(representative, detector))
                for detector in DETECTORS
            },
            "timeline": _timeline(representative),
        },
    }


def build_summary(
    scenarios: list[Scenario], results: dict[str, list[RealizationResult]], seed: int, repetitions: int
) -> dict:
    summaries = {s.id: scenario_summary(s, results[s.id]) for s in scenarios}
    primary = [s for s in scenarios if s.group == "primary"]
    pooled = [r for s in primary for r in results[s.id]]
    focus = [sid for sid in SENSITIVITY_FOCUS if sid in results]
    return {
        "label": LABEL,
        "disclaimer": DISCLAIMER,
        "reproduce": f"python -m app.evaluation.run --all --repetitions {repetitions} --seed {seed}",
        "seed": seed,
        "repetitions": repetitions,
        "calendar": {
            "start": START.isoformat(),
            "reference_days": REFERENCE_DAYS,
            "monitoring_start": MONITORING_START.isoformat(),
            "monitoring_days": MONITORING_DAYS,
            "onset": ONSET.isoformat(),
            "end": END.isoformat(),
        },
        "definitions": {
            "detection": DETECTION_DEFINITION,
            "secondary_events": SECONDARY_EVENTS,
            "units": {
                "realization_level": "One simulated run of one scenario. Outbreak scenario: TP if the method alerts on any outbreak day, else FN. No-outbreak scenario: FP if it alerts on any monitored day, else TN.",
                "day_level": "One monitored surveillance day: outbreak day in alert = TP, not in alert = FN; normal day in alert = FP, not = TN.",
            },
            "confidence_interval": "Wilson score interval, 95 % (z = 1.959964), for every proportion.",
            "parameters": "Application defaults: composite severity bands (detection at High); EWMA lambda 0.25, k 3; CUSUM k 0.5, h 5.",
            "roc_auc": "Not reported: the detectors run at fixed operational thresholds, and ROC/AUC would require varying them. Threshold effects are shown in the separate sensitivity analyses instead.",
        },
        "scenarios": [summaries[s.id] for s in scenarios],
        "overall": {
            "scope": f"Pooled over the {len(primary)} primary scenarios ({len(pooled)} realizations).",
            "detectors": metrics.all_detectors(pooled) if pooled else None,
        },
        "robustness": [comparison.condition_row(sid, summaries[sid]) for sid in ROBUSTNESS_IDS if sid in summaries],
        "coverage": [comparison.condition_row(sid, summaries[sid]) for sid in COVERAGE_IDS if sid in summaries],
        "sensitivity": {
            "note": "Secondary, explanatory only. Recomputed from each realization's daily series; not persisted; the defaults are unchanged.",
            "ewma_lambda": {"pooled": comparison.ewma_sensitivity(pooled),
                            "by_scenario": {sid: comparison.ewma_sensitivity(results[sid]) for sid in focus}},
            "cusum_k_h": {"pooled": comparison.cusum_sensitivity(pooled),
                          "by_scenario": {sid: comparison.cusum_sensitivity(results[sid]) for sid in focus}},
            "composite_cutoffs": {"pooled": comparison.composite_cutoffs(pooled),
                                  "note": "Exploratory: which severity would count as detection. The application's severity bands are unchanged."},
        },
        "cdc_who_attributes": CDC_WHO_ATTRIBUTES,
        "threats_to_validity": THREATS_TO_VALIDITY,
    }


# ---------------------------------------------------------------------------
# Artifacts
# ---------------------------------------------------------------------------


def _v(value) -> str:
    return "—" if value is None else str(value)


def _pct(p: dict) -> str:
    if p["value"] is None:
        return "—"
    low, high = p["ci95"]
    return f"{p['numerator']}/{p['denominator']} = {100 * p['value']:.1f}% (95% CI {100 * low:.1f}-{100 * high:.1f})"


def _delay(d: dict) -> str:
    if d["n"] == 0:
        return "—"
    return f"median {d['median']}, mean {d['mean']}, IQR {d['p25']}-{d['p75']}, range {d['min']}-{d['max']} (n={d['n']})"


def csv_text(summary: dict) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow([
        "scenario", "name", "outbreak_present", "realizations", "detector",
        "tp", "fn", "fp", "tn", "sensitivity", "specificity",
        "median_delay_days", "mean_delay_days", "false_alert_days_per_100_normal_days",
        "normal_day_transitions", "data_confidence_outbreak_mean", "data_confidence_normal_mean",
    ])
    for s in summary["scenarios"]:
        for detector in DETECTORS:
            m = s["detectors"][detector]
            r = m["realization_level"]
            writer.writerow([
                s["id"], s["name"], s["ground_truth"]["outbreak_present"], s["realizations"], detector,
                r["tp"], r["fn"], r["fp"], r["tn"], r["sensitivity"]["value"], r["specificity"]["value"],
                m["detection_delay_days"]["median"], m["detection_delay_days"]["mean"],
                m["burden"]["false_alert_days_per_100_normal_days"], m["stability"]["normal_day_transitions"],
                s["data_confidence"]["outbreak_days"]["mean"], s["data_confidence"]["normal_days"]["mean"],
            ])
    return buffer.getvalue()


def markdown(summary: dict) -> str:
    lines = [
        "# LabSentinel capstone evaluation report",
        "",
        f"> **{summary['disclaimer']}**",
        "",
        f"{summary['label']} Reproduce with `{summary['reproduce']}` (from `backend/`).",
        "",
        "## Design",
        "",
        f"- Calendar: {summary['calendar']['reference_days']} reference days from {summary['calendar']['start']}, then "
        f"{summary['calendar']['monitoring_days']} monitored days ({summary['calendar']['monitoring_start']} to "
        f"{summary['calendar']['end']}); outbreak onset {summary['calendar']['onset']} (monitored day 21), lasting to the end.",
        f"- {summary['repetitions']} realizations per scenario, base seed {summary['seed']}.",
        f"- Parameters: {summary['definitions']['parameters']}",
        f"- Realization level: {summary['definitions']['units']['realization_level']}",
        f"- Day level: {summary['definitions']['units']['day_level']}",
        f"- Intervals: {summary['definitions']['confidence_interval']}",
        f"- ROC/AUC: {summary['definitions']['roc_auc']}",
        "",
        "Detection events (fixed before results were seen):",
        "",
        *[f"- **{DETECTOR_LABEL[d]}**: {text}" for d, text in summary["definitions"]["detection"].items()],
        "",
        "## Scenarios and results",
        "",
        "| # | Scenario | Ground truth | Composite | EWMA | CUSUM | Data Confidence (normal / outbreak) |",
        "|---|---|---|---|---|---|---|",
    ]
    for s in summary["scenarios"]:
        cells = []
        for detector in DETECTORS:
            m = s["detectors"][detector]
            if s["ground_truth"]["outbreak_present"]:
                sens = m["realization_level"]["sensitivity"]
                cells.append(
                    f"{sens['numerator']}/{sens['denominator']} detected; median delay {_v(m['detection_delay_days']['median'])}; "
                    f"false-alert days/100 {_v(m['burden']['false_alert_days_per_100_normal_days'])}"
                )
            else:
                fpr = m["realization_level"]["false_positive_rate"]
                cells.append(
                    f"{fpr['numerator']}/{fpr['denominator']} runs with a false alert; "
                    f"false-alert days/100 {m['burden']['false_alert_days_per_100_normal_days']}"
                )
        truth = "outbreak from onset" if s["ground_truth"]["outbreak_present"] else "no outbreak"
        dc = s["data_confidence"]
        lines.append(
            f"| {s['number']} | {s['name']} | {truth} | {cells[0]} | {cells[1]} | {cells[2]} | "
            f"{_v(dc['normal_days']['mean'])} / {_v(dc['outbreak_days']['mean'])} |"
        )

    overall = summary["overall"]["detectors"]
    if overall:
        lines += ["", "## Aggregate metrics", "", summary["overall"]["scope"], "",
                  "| Metric | Composite | EWMA | CUSUM |", "|---|---|---|---|"]
        rows = [
            ("Sensitivity (realizations)", lambda m: _pct(m["realization_level"]["sensitivity"])),
            ("Specificity (realizations)", lambda m: _pct(m["realization_level"]["specificity"])),
            ("Precision (realizations)", lambda m: _pct(m["realization_level"]["precision"])),
            ("False-positive rate (realizations)", lambda m: _pct(m["realization_level"]["false_positive_rate"])),
            ("Sensitivity (days)", lambda m: _pct(m["day_level"]["sensitivity"])),
            ("Specificity (days)", lambda m: _pct(m["day_level"]["specificity"])),
            ("Detection delay (days)", lambda m: _delay(m["detection_delay_days"])),
            ("False-alert days per 100 normal days", lambda m: str(m["burden"]["false_alert_days_per_100_normal_days"])),
            ("False-alert episodes", lambda m: str(m["burden"]["false_alert_episodes"])),
            ("Normal-day state transitions", lambda m: str(m["stability"]["normal_day_transitions"])),
        ]
        for label, fn in rows:
            lines.append(f"| {label} | " + " | ".join(fn(overall[d]) for d in DETECTORS) + " |")
        lines += ["", "### Confusion matrices", ""]
        for unit in ("realization_level", "day_level"):
            lines += [f"**{unit.replace('_', ' ').capitalize()}**", "", "| Detector | TP | FP | TN | FN |", "|---|---|---|---|---|"]
            for d in DETECTORS:
                c = overall[d][unit]
                lines.append(f"| {DETECTOR_LABEL[d]} | {c['tp']} | {c['fp']} | {c['tn']} | {c['fn']} |")
            lines.append("")

    lines += ["## Lead / lag (days, positive = first method earlier)", "",
              "| Scenario | Composite vs EWMA | Composite vs CUSUM | EWMA vs CUSUM |", "|---|---|---|---|"]
    for s in summary["scenarios"]:
        if s["lead_lag"]:
            cells = []
            for key in ("composite_vs_ewma", "composite_vs_cusum", "ewma_vs_cusum"):
                ll = s["lead_lag"][key]
                a, b = key.split("_vs_")
                cells.append(
                    f"median {ll['days_b_minus_a']['median']} ({a} first {ll[f'{a}_earlier']}, {b} first {ll[f'{b}_earlier']}, "
                    f"same day {ll['same_day']}, n={ll['both_detected']})"
                )
            lines.append(f"| {s['name']} | " + " | ".join(cells) + " |")

    for title, key in (("Robustness to data-quality problems", "robustness"), ("Facility coverage", "coverage")):
        lines += ["", f"## {title}", "",
                  "| Scenario | Conditions | Composite | EWMA | CUSUM | Data Confidence normal / outbreak (min) | Mean outbreak composite score |",
                  "|---|---|---|---|---|---|---|"]
        for row in summary[key]:
            cells = [
                f"{row[d]['detected']['numerator']}/{row[d]['detected']['denominator']}, median delay {_v(row[d]['median_delay'])}"
                for d in DETECTORS
            ]
            lines.append(
                f"| {row['scenario']} | {', '.join(row['conditions']) or 'clean'} | " + " | ".join(cells)
                + f" | {row['data_confidence_normal_mean']} / {row['data_confidence_outbreak_mean']} ({row['data_confidence_outbreak_min']}) "
                f"| {row['outbreak_composite_score_mean']} |"
            )

    sens = summary["sensitivity"]
    lines += ["", "## Secondary: parameter sensitivity (pooled, not persisted)", "", sens["note"], "",
              "| EWMA lambda | Detected | Median delay | Runs with false alert | False-alert days/100 |", "|---|---|---|---|---|"]
    for row in sens["ewma_lambda"]["pooled"]:
        lines.append(
            f"| {row['lambda']}{' (default)' if row['default'] else ''} | {_pct(row['detected'])} | {_v(row['delay_days']['median'])} | "
            f"{_pct(row['false_alert_realizations'])} | {row['false_alert_days_per_100_normal_days']} |"
        )
    lines += ["", "| CUSUM k | h | Detected | Median delay | Runs with false alert | False-alert days/100 |", "|---|---|---|---|---|---|"]
    for row in sens["cusum_k_h"]["pooled"]:
        lines.append(
            f"| {row['k']} | {row['h']}{' (default)' if row['default'] else ''} | {_pct(row['detected'])} | {_v(row['delay_days']['median'])} | "
            f"{_pct(row['false_alert_realizations'])} | {row['false_alert_days_per_100_normal_days']} |"
        )
    lines += ["", f"Composite cutoffs: {sens['composite_cutoffs']['note']}", "",
              "| Detect at | Detected | Median delay | Runs with false alert | False-alert days/100 |", "|---|---|---|---|---|"]
    for row in sens["composite_cutoffs"]["pooled"]:
        lines.append(
            f"| {row['cutoff']}{' (application default)' if row['default'] else ''} | {_pct(row['detected'])} | "
            f"{row['delay_days']['median']} | {_pct(row['false_alert_realizations'])} | {row['false_alert_days_per_100_normal_days']} |"
        )

    lines += ["", "## CDC / WHO surveillance-evaluation attributes", "", "| Attribute | Status here | How |", "|---|---|---|"]
    lines += [f"| {a['attribute']} | {a['status']} | {a['how']} |" for a in summary["cdc_who_attributes"]]
    lines += ["", "## Threats to validity", "", *[f"- {t}" for t in summary["threats_to_validity"]], "",
              f"> **{summary['disclaimer']}** No method is declared best: the tables show tradeoffs.", ""]
    return "\n".join(lines)


def write(summary: dict, directory: Path) -> dict[str, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    paths = {
        "json": directory / "evaluation-summary.json",
        "csv": directory / "evaluation-summary.csv",
        "markdown": directory / "evaluation-report.md",
    }
    paths["json"].write_text(json.dumps(summary, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    paths["csv"].write_text(csv_text(summary), encoding="utf-8")
    paths["markdown"].write_text(markdown(summary), encoding="utf-8")
    return paths


__all__ = ["asdict", "build_summary", "write"]
