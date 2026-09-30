"""
The dynamic surveillance engine: persisted observations -> scored signal.

For one syndrome and one surveillance date D:

1. aggregate eligible observations for D and its baseline window (aggregator)
2. the regional baseline from the window (baseline); none -> INSUFFICIENT_BASELINE
3. current regional counts; none -> NO_DATA
4. each facility against its own baseline (the affected-facility rule below)
5. affected and participating geographic areas (geography)
6. persistence from the previous day's persisted dynamic signal
7. the five components and the Composite Outbreak Signal Score (scorer)
8. Data Confidence, calculated and stored separately from the score

AFFECTED-FACILITY RULE. A facility is ABNORMAL on D when all hold:
  - it has its own sufficient baseline (same method as the region);
  - it reported at least ``facility_min_tests`` eligible tests on D;
  - its test volume is at least ``abnormal_volume_increase_percent`` above
    its baseline mean, OR its positivity is at least
    ``abnormal_positivity_increase_points`` percentage points above its
    baseline positivity.
A facility that merely reports is never counted as affected.

PARTICIPATING FACILITIES (the denominator) are the participating facilities
that reported this syndrome on D or on any day of the baseline window. A
facility that has gone silent stays in the denominator: its silence lowers
Data Confidence, and is not read as normal activity.

PERSISTENCE. A day is abnormal when at least one facility is ABNORMAL.
Persistence on D is 0 when D is not abnormal; otherwise 1 plus the
persistence of the persisted dynamic signal for D-1 when that signal was
also abnormal, else 1 (it resets). It is read from the dynamic signal
history, never from the classroom demonstration.

The Dynamic Surveillance Engine is a capstone prototype model and is not
epidemiologically validated for production public-health decision-making.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import SurveillanceSignal
from app.surveillance import scorer
from app.surveillance.aggregator import Aggregation, aggregate, in_demo_period
from app.surveillance.baseline import baseline_for, window_for
from app.surveillance.geography import area_for, areas_for
from app.surveillance.types import (
    ENGINE_VERSION,
    Baseline,
    CalculationStatus,
    Counts,
    EngineConfig,
    FacilityInfo,
    FacilityStatus,
)

INSUFFICIENT_BASELINE_MESSAGE = (
    "Insufficient historical data to calculate a dynamic surveillance baseline."
)
NO_DATA_MESSAGE = (
    "No eligible laboratory observations were received for this date. "
    "Absence of data is not evidence of normal activity."
)
METHOD = {
    "baseline": (
        "Rolling historical mean of the {window} days before the surveillance date "
        "(the date itself and later days are never used). Days without data are left out; "
        "at least {minimum} days with data are required. Volume: mean eligible tests per day. "
        "Positivity: pooled positives / (positives + negatives)."
    ),
    "affected_facility_rule": (
        "Sufficient own baseline, at least {min_tests} eligible tests, and volume >= +{volume:g}% "
        "or positivity >= +{points:g} percentage points above the facility's own baseline."
    ),
    "persistence_rule": (
        "Consecutive days, ending on the surveillance date, with at least one abnormal facility, "
        "read from the persisted dynamic signal history."
    ),
    "eligibility": (
        "Mapped test for the syndrome; status final, amended or corrected; active participating "
        "facility; outside the frozen demonstration period. Positivity counts Positive and "
        "Negative results only."
    ),
}


def _r(value: float | None, places: int = 4) -> float | None:
    return None if value is None else round(value, places)


def _decimal(value: float | None, places: int = 2) -> Decimal | None:
    return None if value is None else Decimal(str(scorer.round_half_up(value, places)))


def method_description(config: EngineConfig) -> dict:
    return {
        "baseline": METHOD["baseline"].format(
            window=config.baseline_window_days, minimum=config.min_baseline_days
        ),
        "affected_facility_rule": METHOD["affected_facility_rule"].format(
            min_tests=config.facility_min_tests,
            volume=config.abnormal_volume_increase_percent,
            points=config.abnormal_positivity_increase_points,
        ),
        "persistence_rule": METHOD["persistence_rule"],
        "eligibility": METHOD["eligibility"],
    }


@dataclass
class FacilityAssessment:
    info: FacilityInfo
    counts: Counts
    baseline: Baseline
    status: FacilityStatus
    reasons: list[str]
    volume_change: float | None
    positivity_change: float | None

    def as_dict(self) -> dict:
        area = area_for(self.info)
        return {
            "facility_code": self.info.facility_code,
            "name": self.info.name,
            "vendor": self.info.vendor,
            "area": area.code,
            "subregion": area.subregion,
            "tests": self.counts.tests,
            "positive": self.counts.positive,
            "negative": self.counts.negative,
            "positivity_rate": _r(self.counts.positivity()),
            "baseline_mean_tests": _r(self.baseline.mean_tests),
            "baseline_positivity_rate": _r(self.baseline.positivity),
            "baseline_observed_days": self.baseline.observed_days,
            "volume_change_percent": _r(self.volume_change),
            "positivity_change_points": _r(self.positivity_change),
            "status": self.status,
            "reasons": self.reasons,
        }


def assess_facility(
    info: FacilityInfo, counts: Counts, baseline: Baseline, config: EngineConfig
) -> FacilityAssessment:
    volume_change = positivity_change = None
    if baseline.sufficient and counts.tests > 0:
        volume_change = scorer.volume_change_percent(counts.tests, baseline.mean_tests)
        current = counts.positivity()
        if current is not None:
            positivity_change = current - baseline.positivity

    reasons: list[str] = []
    status: FacilityStatus
    if counts.tests == 0:
        status = "NOT_REPORTING"
    elif not baseline.sufficient:
        status = "INSUFFICIENT_BASELINE"
    elif counts.tests < config.facility_min_tests:
        status = "BELOW_MINIMUM"
        reasons.append(f"{counts.tests} tests, below the minimum of {config.facility_min_tests}")
    else:
        if volume_change is not None and volume_change >= config.abnormal_volume_increase_percent:
            reasons.append(
                f"volume {volume_change:+.1f}% (threshold +{config.abnormal_volume_increase_percent:g}%)"
            )
        if positivity_change is not None and positivity_change >= config.abnormal_positivity_increase_points:
            reasons.append(
                f"positivity {positivity_change:+.1f} points "
                f"(threshold +{config.abnormal_positivity_increase_points:g})"
            )
        status = "ABNORMAL" if reasons else "NORMAL"
    return FacilityAssessment(info, counts, baseline, status, reasons, volume_change, positivity_change)


@dataclass
class Calculation:
    """Everything a dynamic signal stores, before it is persisted."""

    syndrome: str
    signal_date: date
    status: CalculationStatus
    values: dict  # column values of SurveillanceSignal
    metadata: dict

    @property
    def severity(self) -> str | None:
        return self.values["severity"]

    @property
    def composite_score(self) -> Decimal | None:
        return self.values["composite_score"]


def _previous_persistence(previous: SurveillanceSignal | None) -> tuple[int, dict]:
    if previous is None:
        return 0, {"previous_signal": "none", "previous_persistence_days": 0}
    abnormal = previous.calculation_status == "CALCULATED" and previous.affected_facilities > 0
    return (
        previous.persistence_days if abnormal else 0,
        {
            "previous_signal": previous.signal_date.isoformat(),
            "previous_calculation_status": previous.calculation_status,
            "previous_abnormal": abnormal,
            "previous_persistence_days": previous.persistence_days,
        },
    )


def calculate(
    session: Session,
    syndrome: str,
    target: date,
    config: EngineConfig,
    previous: SurveillanceSignal | None,
) -> Calculation:
    """Calculate (without persisting) the dynamic signal for ``target``."""
    zone = ZoneInfo(config.timezone)
    if in_demo_period(target, zone):
        raise ValueError(
            f"{target.isoformat()} is inside the frozen Day 1-Day 5 demonstration period; "
            "dynamic surveillance does not run on it."
        )
    first, _ = window_for(target, config)
    data: Aggregation = aggregate(session, syndrome, first, target, config)

    regional_daily = data.regional_daily()
    current = regional_daily.get(target, Counts())
    baseline = baseline_for(regional_daily, target, config)

    relevant_codes = sorted(
        code
        for code, days in data.by_facility.items()
        if any(fd.counts.tests > 0 for fd in days.values())
    )
    assessments = [
        assess_facility(
            data.facilities[code],
            data.day(code, target).counts,
            baseline_for(data.facility_daily(code), target, config),
            config,
        )
        for code in relevant_codes
    ]
    reporting = [a for a in assessments if a.counts.tests > 0]

    quality = [
        scorer.FacilityQuality(
            facility_code=a.info.facility_code,
            reporting_delays=tuple(data.day(a.info.facility_code, target).quality.reporting_delays),
            eligible_observations=a.counts.tests,
            fields_populated=data.day(a.info.facility_code, target).quality.fields_populated,
            fields_required=data.day(a.info.facility_code, target).quality.fields_required,
            lab_observations=data.day(a.info.facility_code, target).quality.lab_observations,
            mapped_observations=data.day(a.info.facility_code, target).quality.mapped_observations,
            integrity_issues=data.day(a.info.facility_code, target).quality.integrity_issues,
        )
        for a in reporting
    ]
    confidence = scorer.data_confidence(quality, len(relevant_codes)) if relevant_codes else None

    participating_areas = areas_for([a.info for a in assessments])
    metadata: dict = {
        "engine_version": ENGINE_VERSION,
        "mode": "dynamic",
        "config": config.as_dict(),
        "method": method_description(config),
        "current": {
            "tests": current.tests,
            "positive": current.positive,
            "negative": current.negative,
            "indeterminate": current.indeterminate,
            "positivity_rate": _r(current.positivity()),
        },
        "baseline": baseline.as_dict(),
        "facilities": [a.as_dict() for a in assessments],
        "geography": {
            "level": "postal_code",
            "participating": [area.as_dict() for area in participating_areas],
            "affected": [],
        },
        "data_confidence": _confidence_dict(confidence),
    }

    status: CalculationStatus
    if current.tests == 0:
        status = "NO_DATA"
        metadata["message"] = NO_DATA_MESSAGE
    elif not baseline.sufficient:
        status = "INSUFFICIENT_BASELINE"
        metadata["message"] = INSUFFICIENT_BASELINE_MESSAGE
    else:
        status = "CALCULATED"

    values: dict = {
        "test_volume": current.tests,
        "positive_count": current.positive,
        "positivity_rate": _decimal(current.positivity() or 0.0),
        "baseline_volume": _decimal(baseline.mean_tests),
        "baseline_positivity_rate": _decimal(baseline.positivity),
        "affected_facilities": 0,
        "affected_geographies": [],
        "persistence_days": 0,
        "composite_score": None,
        "severity": None,
        "volume_component_score": None,
        "positivity_component_score": None,
        "facility_component_score": None,
        "geography_component_score": None,
        "persistence_component_score": None,
        "data_confidence_score": None if confidence is None else Decimal(confidence.score),
        "data_confidence_level": None if confidence is None else confidence.level,
    }
    if status != "CALCULATED":
        metadata["persistence"] = {"days": 0, "rule": metadata["method"]["persistence_rule"]}
        return Calculation(syndrome, target, status, values, metadata)

    # Changes against the regional baseline.
    volume_change = scorer.volume_change_percent(current.tests, baseline.mean_tests)
    current_positivity = current.positivity() or 0.0
    positivity_change = current_positivity - baseline.positivity

    affected = [a for a in assessments if a.status == "ABNORMAL"]
    affected_areas = areas_for([a.info for a in affected])

    previous_days, previous_info = _previous_persistence(previous)
    if previous is not None and previous.signal_date != target - timedelta(days=1):
        raise ValueError("The previous signal must be the one for the day before.")
    persistence = previous_days + 1 if affected else 0

    normalized = {
        "volume": scorer.volume_score(volume_change),
        "positivity": scorer.positivity_score(positivity_change),
        "facilities": scorer.share_score(len(affected), len(assessments)),
        "geography": scorer.share_score(len(affected_areas), len(participating_areas)),
        "persistence": scorer.persistence_score(persistence),
    }
    result = scorer.composite(normalized)
    raw = {
        "volume": {
            "current_tests": current.tests,
            "baseline_mean_tests": _r(baseline.mean_tests),
            "change_percent": _r(volume_change),
        },
        "positivity": {
            "current_rate": _r(current_positivity),
            "baseline_rate": _r(baseline.positivity),
            "change_points": _r(positivity_change),
            "range_points": scorer.POSITIVITY_RANGE_POINTS,
        },
        "facilities": {"affected": len(affected), "participating": len(assessments)},
        "geography": {"affected": len(affected_areas), "participating": len(participating_areas)},
        "persistence": {"days": persistence, "max_days": scorer.MAX_PERSISTENCE_DAYS},
    }
    metadata["changes"] = {
        "volume_change_percent": _r(volume_change),
        "positivity_change_points": _r(positivity_change),
    }
    metadata["components"] = [
        {
            "key": c.key,
            "label": scorer.COMPONENT_LABELS[c.key],
            "weight": c.weight,
            "max_points": c.max_points,
            "raw": raw[c.key],
            "normalized": _r(c.normalized),
            "weighted": _r(c.weighted),
            "points": c.points,
        }
        for c in result.components
    ]
    metadata["composite"] = {
        "unrounded": _r(result.unrounded),
        "score": result.score,
        "severity": result.severity,
    }
    metadata["geography"]["affected"] = [area.as_dict() for area in affected_areas]
    metadata["persistence"] = {
        "days": persistence,
        "abnormal_today": bool(affected),
        "rule": metadata["method"]["persistence_rule"],
        **previous_info,
    }

    values.update(
        {
            "affected_facilities": len(affected),
            "affected_geographies": [area.code for area in affected_areas],
            "persistence_days": persistence,
            "composite_score": Decimal(result.score),
            "severity": result.severity,
            "volume_component_score": _decimal(normalized["volume"]),
            "positivity_component_score": _decimal(normalized["positivity"]),
            "facility_component_score": _decimal(normalized["facilities"]),
            "geography_component_score": _decimal(normalized["geography"]),
            "persistence_component_score": _decimal(normalized["persistence"]),
        }
    )
    return Calculation(syndrome, target, status, values, metadata)


def _confidence_dict(confidence: scorer.DataConfidence | None) -> dict | None:
    if confidence is None:
        return None
    return {
        "score": confidence.score,
        "level": confidence.level,
        "facilities_reporting": confidence.facilities_reporting,
        "facilities_total": confidence.facilities_total,
        "explanation": confidence.explanation,
        "components": [
            {
                "key": c.key,
                "label": scorer.CONFIDENCE_LABELS[c.key],
                "weight": c.weight,
                "max_points": int(scorer.round_half_up(c.weight * 100)),
                "score": _r(c.score),
                "points": c.points,
                "evidence": c.evidence,
            }
            for c in confidence.components
        ],
    }
