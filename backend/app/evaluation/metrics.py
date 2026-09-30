"""
Evaluation metrics. Pure functions over realization results.

Two evaluation units, never mixed without a label:

REALIZATION LEVEL (one simulated run of one scenario)
  outbreak scenario:    TP if the detector alerts on any outbreak day (on or
                        after the true start), else FN
  no-outbreak scenario: FP if the detector alerts on any monitored day, else TN
  An alert on a pre-onset day of an outbreak scenario is a false alert: it is
  counted in alert burden and in the day-level matrix, not as the detection.

DAY LEVEL (one monitored surveillance day)
  outbreak day in alert: TP; outbreak day not in alert: FN;
  normal day in alert: FP; normal day not in alert: TN

Detection (fixed before any result was seen): composite High or Critical;
EWMA overall STATISTICAL ALERT; CUSUM either metric >= h.

Confidence intervals for proportions: Wilson score interval, 95 %
(z = 1.959964). Detection delays are reported as distributions.
"""

import math
import statistics
from dataclasses import dataclass, field
from datetime import date

from app.evaluation.types import DETECTORS, Detector, RealizationResult

Z95 = 1.959964
SEVERITY_RANK = {"Low": 0, "Watch": 1, "Moderate": 2, "High": 3, "Critical": 4}


def wilson(k: int, n: int, z: float = Z95) -> tuple[float, float] | None:
    """Wilson score interval for k successes in n trials; None when n = 0."""
    if n == 0:
        return None
    p = k / n
    denominator = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denominator
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator
    return max(0.0, centre - half), min(1.0, centre + half)


def proportion(k: int, n: int) -> dict:
    ci = wilson(k, n)
    return {
        "numerator": k,
        "denominator": n,
        "value": None if n == 0 else round(k / n, 4),
        "ci95": None if ci is None else [round(ci[0], 4), round(ci[1], 4)],
    }


def distribution(values: list[int]) -> dict:
    if not values:
        return {"n": 0, "mean": None, "median": None, "p25": None, "p75": None, "min": None, "max": None, "counts": {}}
    ordered = sorted(values)
    quartiles = statistics.quantiles(ordered, n=4, method="inclusive") if len(ordered) >= 2 else [ordered[0]] * 3
    counts: dict[str, int] = {}
    for v in ordered:
        counts[str(v)] = counts.get(str(v), 0) + 1
    return {
        "n": len(ordered),
        "mean": round(statistics.fmean(ordered), 3),
        "median": statistics.median(ordered),
        "p25": quartiles[0],
        "p75": quartiles[2],
        "min": ordered[0],
        "max": ordered[-1],
        "counts": counts,
    }


def confusion(tp: int, fp: int, tn: int, fn: int) -> dict:
    return {
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "sensitivity": proportion(tp, tp + fn),
        "specificity": proportion(tn, tn + fp),
        "precision": proportion(tp, tp + fp),
        "npv": proportion(tn, tn + fn),
        "false_positive_rate": proportion(fp, fp + tn),
        "false_negative_rate": proportion(fn, fn + tp),
    }


@dataclass
class Outcome:
    """One detector on one realization."""

    outbreak_present: bool
    detected: bool
    detection_date: date | None
    delay: int | None
    retrospective_detection_date: date | None
    normal_days: int = 0
    normal_alert_days: int = 0
    outbreak_days: int = 0
    outbreak_alert_days: int = 0
    alert_days: int = 0
    alert_episodes: int = 0
    false_episodes: int = 0
    false_episode_lengths: list[int] = field(default_factory=list)
    normal_transitions: int = 0
    any_normal_alert: bool = False


def outcome(result: RealizationResult, detector: Detector) -> Outcome:
    truth = result.truth
    days = result.days
    alerts = [d.alert(detector) for d in days]
    retrospective = next((d.day for d, a in zip(days, alerts) if a and d.truth == "outbreak"), None)
    if truth.outbreak_present and result.as_of_detection:
        detection = result.as_of_detection.get(detector)  # as seen in real time
    else:
        detection = retrospective
    out = Outcome(
        outbreak_present=truth.outbreak_present,
        detected=detection is not None,
        detection_date=detection,
        delay=None if detection is None or truth.true_outbreak_start is None else (detection - truth.true_outbreak_start).days,
        retrospective_detection_date=retrospective,
    )
    previous_alert = False
    previous_normal: bool | None = None
    episode = 0
    for record, alert in zip(days, alerts):
        normal = record.truth == "normal"
        out.alert_days += alert
        if alert and not previous_alert:
            out.alert_episodes += 1
        if normal:
            out.normal_days += 1
            out.normal_alert_days += alert
            if alert:
                if not previous_alert or previous_normal is False:
                    out.false_episodes += 1
                episode += 1
            elif episode:
                out.false_episode_lengths.append(episode)
                episode = 0
            if previous_normal and alert != previous_alert:
                out.normal_transitions += 1
        else:
            out.outbreak_days += 1
            out.outbreak_alert_days += alert
            if episode:
                out.false_episode_lengths.append(episode)
                episode = 0
        previous_alert, previous_normal = alert, normal
    if episode:
        out.false_episode_lengths.append(episode)
    out.any_normal_alert = out.normal_alert_days > 0
    return out


def secondary_events(result: RealizationResult) -> dict[str, date | None]:
    """First outbreak-window dates of the lower-level (secondary) events."""
    outbreak = [d for d in result.days if d.truth == "outbreak"]

    def first(predicate) -> date | None:
        return next((d.day for d in outbreak if predicate(d)), None)

    return {
        "composite_watch": first(lambda d: SEVERITY_RANK.get(d.composite_severity or "", -1) >= 1),
        "composite_moderate": first(lambda d: SEVERITY_RANK.get(d.composite_severity or "", -1) >= 2),
        "ewma_watch": first(lambda d: d.ewma_overall in ("WATCH", "STATISTICAL_ALERT")),
    }


def summarize(results: list[RealizationResult], detector: Detector) -> dict:
    """Realization-level and day-level metrics, timeliness, burden and stability for one detector."""
    outs = [outcome(r, detector) for r in results]
    outbreak = [o for o in outs if o.outbreak_present]
    control = [o for o in outs if not o.outbreak_present]
    tp = sum(o.detected for o in outbreak)
    fn = len(outbreak) - tp
    fp = sum(o.any_normal_alert for o in control)
    tn = len(control) - fp
    day_tp = sum(o.outbreak_alert_days for o in outs)
    day_fn = sum(o.outbreak_days - o.outbreak_alert_days for o in outs)
    day_fp = sum(o.normal_alert_days for o in outs)
    day_tn = sum(o.normal_days - o.normal_alert_days for o in outs)
    normal_days = sum(o.normal_days for o in outs)
    lengths = [length for o in outs for length in o.false_episode_lengths]
    return {
        "realizations": len(outs),
        "realization_level": confusion(tp, fp, tn, fn),
        "day_level": confusion(day_tp, day_fp, day_tn, day_fn),
        "detection_delay_days": distribution([o.delay for o in outbreak if o.delay is not None]),
        "retrospective_delay_days": distribution([
            (o.retrospective_detection_date - results[0].truth.true_outbreak_start).days
            for o in outbreak if o.retrospective_detection_date and results[0].truth.true_outbreak_start
        ]),
        "burden": {
            "alert_days": sum(o.alert_days for o in outs),
            "alert_episodes": sum(o.alert_episodes for o in outs),
            "monitored_days": sum(o.normal_days + o.outbreak_days for o in outs),
            "normal_days": normal_days,
            "false_alert_days": day_fp,
            "false_alert_episodes": sum(o.false_episodes for o in outs),
            "false_alert_days_per_100_normal_days": None if normal_days == 0 else round(100 * day_fp / normal_days, 3),
            "realizations_with_false_alert": sum(o.any_normal_alert for o in outs),
        },
        "stability": {
            "normal_day_transitions": sum(o.normal_transitions for o in outs),
            "transitions_per_100_normal_days": None if normal_days == 0 else round(
                100 * sum(o.normal_transitions for o in outs) / normal_days, 3
            ),
            "false_episode_length": distribution(lengths),
            "percent_normal_days_in_alert": None if normal_days == 0 else round(100 * day_fp / normal_days, 3),
        },
    }


def data_confidence(results: list[RealizationResult]) -> dict:
    def values(truth: str) -> list[float]:
        return [d.data_confidence for r in results for d in r.days if d.truth == truth and d.data_confidence is not None]

    def stats(values_: list[float]) -> dict:
        if not values_:
            return {"n": 0, "mean": None, "min": None}
        return {"n": len(values_), "mean": round(statistics.fmean(values_), 2), "min": min(values_)}

    scores = [d.composite_score for r in results for d in r.days if d.truth == "outbreak" and d.composite_score is not None]
    return {
        "normal_days": stats(values("normal")),
        "outbreak_days": stats(values("outbreak")),
        "outbreak_composite_score_mean": None if not scores else round(statistics.fmean(scores), 2),
        "outbreak_composite_score_max": None if not scores else max(scores),
    }


def secondary(results: list[RealizationResult]) -> dict:
    start = results[0].truth.true_outbreak_start
    if start is None:
        return {}
    events = [secondary_events(r) for r in results]
    return {
        key: {
            "detected": proportion(sum(e[key] is not None for e in events), len(events)),
            "delay_days": distribution([(e[key] - start).days for e in events if e[key] is not None]),
        }
        for key in ("composite_watch", "composite_moderate", "ewma_watch")
    }


def all_detectors(results: list[RealizationResult]) -> dict:
    return {detector: summarize(results, detector) for detector in DETECTORS}
