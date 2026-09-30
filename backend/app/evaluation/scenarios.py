"""
Synthetic evaluation scenarios, with explicit ground truth.

Every scenario uses the same calendar so results are comparable:

    days 0-27    reference period: in-control history (the EWMA / CUSUM
                 reference; also the composite's first baseline windows)
    days 28-69   42 monitored days: every detector is evaluated here
    day 49       ONSET (monitored day 21) for outbreak scenarios; an outbreak
                 then lasts to the end of the series (21 outbreak days)

Dates start on 2024-03-01, well away from the frozen Nov 3-7 2025 classroom
demonstration. Facilities are fictional (EVAL-A/B/C) and never appear in the
application's own data.

Daily draws (see generator.py): tests ~ Poisson(mean x volume multiplier),
positives ~ Binomial(tests, positivity), per facility.
"""

from datetime import date, timedelta

from app.evaluation.types import DayPlan, FacilityProfile, Scenario

START = date(2024, 3, 1)
REFERENCE_DAYS = 28
MONITORING_DAYS = 42
ONSET_MONITORING_DAY = 21
TOTAL_DAYS = REFERENCE_DAYS + MONITORING_DAYS
MONITORING_START = START + timedelta(days=REFERENCE_DAYS)
ONSET = MONITORING_START + timedelta(days=ONSET_MONITORING_DAY)
END = START + timedelta(days=TOTAL_DAYS - 1)
BASE_POSITIVITY = 0.08

STANDARD = (
    FacilityProfile("EVAL-A", "Evaluation Facility A (synthetic)", "E-001", 20.0),
    FacilityProfile("EVAL-B", "Evaluation Facility B (synthetic)", "E-002", 16.0),
    FacilityProfile("EVAL-C", "Evaluation Facility C (synthetic)", "E-003", 12.0),
)
SMALL = (
    FacilityProfile("EVAL-A", "Evaluation Facility A (synthetic)", "E-001", 4.0),
    FacilityProfile("EVAL-B", "Evaluation Facility B (synthetic)", "E-002", 3.0),
    FacilityProfile("EVAL-C", "Evaluation Facility C (synthetic)", "E-003", 2.0),
)
ALL = ("EVAL-A", "EVAL-B", "EVAL-C")
NORMAL = DayPlan()


def day_offset(day: date) -> int:
    """Days since onset (negative before it)."""
    return (day - ONSET).days


# ---------------------------------------------------------------------------
# Outbreak shapes (d = days since onset, d >= 0)
# ---------------------------------------------------------------------------


def moderate(d: int) -> DayPlan:
    """Moderate regional rise: +5 % tests a day (cap +50 %), +1.5 points positivity a day (cap 23 %)."""
    return DayPlan(min(1 + 0.05 * (d + 1), 1.5), min(BASE_POSITIVITY + 0.015 * (d + 1), 0.23))


def cluster(d: int) -> DayPlan:
    """A local cluster: +8 % tests a day (cap +60 %), +2 points positivity a day (cap 28 %)."""
    return DayPlan(min(1 + 0.08 * (d + 1), 1.6), min(BASE_POSITIVITY + 0.02 * (d + 1), 0.28))


def _control(_facility: str, _d: int) -> DayPlan:
    return NORMAL


def _sudden(_facility: str, d: int) -> DayPlan:
    return NORMAL if d < 0 else DayPlan(1.6, 0.30)


def _gradual(_facility: str, d: int) -> DayPlan:
    if d < 0:
        return NORMAL
    return DayPlan(min(1 + 0.02 * (d + 1), 1.4), BASE_POSITIVITY + 0.005 * (d + 1))


def _positivity_only(_facility: str, d: int) -> DayPlan:
    return NORMAL if d < 0 else DayPlan(1.0, min(BASE_POSITIVITY + 0.015 * (d + 1), 0.26))


def _volume_only(_facility: str, d: int) -> DayPlan:
    return NORMAL if d < 0 else DayPlan(min(1 + 0.12 * (d + 1), 2.2), BASE_POSITIVITY)


def _single_facility(facility: str, d: int) -> DayPlan:
    return cluster(d) if d >= 0 and facility == "EVAL-A" else NORMAL


SPREAD_START = {"EVAL-A": 0, "EVAL-B": 4, "EVAL-C": 8}


def _spread(facility: str, d: int) -> DayPlan:
    start = SPREAD_START[facility]
    return cluster(d - start) if d >= start else NORMAL


def _transient(_facility: str, d: int) -> DayPlan:
    return DayPlan(2.0, 0.25) if d == 0 else NORMAL


def _moderate(_facility: str, d: int) -> DayPlan:
    return NORMAL if d < 0 else moderate(d)


def _reporting_gap(facility: str, d: int) -> DayPlan:
    plan = _moderate(facility, d)
    if facility == "EVAL-B" and 0 <= d <= 4:
        return DayPlan(plan.volume_multiplier, plan.positivity, reporting=False)
    return plan


def _delayed(facility: str, d: int) -> DayPlan:
    plan = _moderate(facility, d)
    if d >= -7:  # delays begin a week before onset and continue
        return DayPlan(plan.volume_multiplier, plan.positivity, delay_days=(1, 3))
    return plan


def _terminology(facility: str, d: int) -> DayPlan:
    plan = _moderate(facility, d)
    if d >= -7:  # from a week before onset: a local code change at EVAL-A and EVAL-B, and incomplete records
        return DayPlan(
            plan.volume_multiplier,
            plan.positivity,
            unmapped_share=0.5 if facility in ("EVAL-A", "EVAL-B") else 0.0,
            missing_specimen_share=0.25,
        )
    return plan


def _coverage(dropped: tuple[str, ...]):
    def plan(facility: str, d: int) -> DayPlan:
        base = _moderate(facility, d)
        if facility in dropped and d >= -7:  # stop reporting a week before onset
            return DayPlan(base.volume_multiplier, base.positivity, reporting=False)
        return base

    return plan


SCENARIOS: tuple[Scenario, ...] = (
    Scenario("S01-control", 1, "No outbreak (control)", "False alerts and stability.",
             "Normal baseline variation only, at all three facilities, for all 42 monitored days.",
             STANDARD, _control, False, ()),
    Scenario("S02-sudden", 2, "Sudden sharp outbreak", "Obvious outbreak detection.",
             "From onset, every facility's tests rise 60 % and positivity jumps from 8 % to 30 %.",
             STANDARD, _sudden, True, ALL),
    Scenario("S03-gradual", 3, "Slow gradual outbreak", "Whether EWMA/CUSUM detect gradual change earlier.",
             "From onset, tests rise 2 % a day (cap +40 %) and positivity 0.5 points a day (8 % -> 18.5 % after 21 days).",
             STANDARD, _gradual, True, ALL),
    Scenario("S04-positivity-only", 4, "Positivity-only rise", "Sensitivity to a true signal without volume growth.",
             "From onset, positivity rises 1.5 points a day (cap 26 %) while test volume stays at baseline.",
             STANDARD, _positivity_only, True, ALL),
    Scenario("S05-volume-only", 5, "Volume-only surge (no disease increase)",
             "Whether increased testing is over-interpreted as disease spread.",
             "From monitored day 21, testing rises 12 % a day (cap +120 %) with positivity unchanged at 8 %. "
             "Ground truth: NO outbreak.",
             STANDARD, _volume_only, False, ()),
    Scenario("S06-single-facility", 6, "Single-facility local cluster", "Multi-facility logic and geographic containment.",
             "From onset, only EVAL-A: tests +8 % a day (cap +60 %), positivity +2 points a day (cap 28 %). "
             "EVAL-B and EVAL-C stay normal.",
             STANDARD, _single_facility, True, ("EVAL-A",)),
    Scenario("S07-regional-spread", 7, "Multi-facility regional spread", "Facility and geographic spread components.",
             "The single-facility cluster starts at EVAL-A on onset, at EVAL-B 4 days later and at EVAL-C 8 days later.",
             STANDARD, _spread, True, ALL),
    Scenario("S08-transient-spike", 8, "Transient one-day spike (no outbreak)", "False-alarm resistance and persistence logic.",
             "On monitored day 21 only, tests double and positivity is 25 % everywhere; normal before and after. "
             "Ground truth: NO outbreak.",
             STANDARD, _transient, False, ()),
    Scenario("S09-reporting-gap", 9, "Reporting gap / missing facility", "Robustness, Data Confidence and degradation.",
             "The moderate regional outbreak (S13), with EVAL-B reporting nothing for the first 5 outbreak days.",
             STANDARD, _reporting_gap, True, ALL, conditions=("missing facility",), compare_with="S13-moderate"),
    Scenario("S10-delayed-data", 10, "Delayed data", "Timeliness and Data Confidence effects.",
             "The moderate regional outbreak (S13), with every result from a week before onset delivered 1-3 days late. "
             "Detection is evaluated as of each day, with only the results received by then.",
             STANDARD, _delayed, True, ALL, conditions=("delayed results",), as_of=True, compare_with="S13-moderate"),
    Scenario("S11-terminology", 11, "Terminology quality problem", "Data Confidence and syndrome-classification robustness.",
             "The moderate regional outbreak (S13), with half of EVAL-A's and EVAL-B's results from a week before onset "
             "coded with a valid but unmapped LOINC code (94309-2), and a quarter of all records missing a specimen type.",
             STANDARD, _terminology, True, ALL, conditions=("unmapped terminology", "incomplete observations"),
             compare_with="S13-moderate"),
    Scenario("S12-small-count", 12, "Small-count environment (no outbreak)", "False alerts in small populations.",
             "Normal variation only, at a quarter of the usual volume (about 4, 3 and 2 tests a day). "
             "Ground truth: NO outbreak.",
             SMALL, _control, False, ()),
    Scenario("S13-moderate", 13, "Moderate regional outbreak (clean reference)",
             "The clean comparator for the data-quality and coverage experiments.",
             "From onset, every facility: tests +5 % a day (cap +50 %), positivity +1.5 points a day (cap 23 %). "
             "No data-quality problem.",
             STANDARD, _moderate, True, ALL),
    # Facility-coverage experiment: the S13 outbreak with fewer facilities reporting.
    Scenario("C2-coverage-2of3", 101, "Coverage: 2 of 3 facilities reporting", "Facility coverage robustness.",
             "The S13 outbreak with EVAL-C silent from a week before onset.",
             STANDARD, _coverage(("EVAL-C",)), True, ALL, conditions=("2 of 3 facilities",),
             compare_with="S13-moderate", group="coverage"),
    Scenario("C1-coverage-1of3", 102, "Coverage: 1 of 3 facilities reporting", "Facility coverage robustness.",
             "The S13 outbreak with EVAL-B and EVAL-C silent from a week before onset.",
             STANDARD, _coverage(("EVAL-B", "EVAL-C")), True, ALL, conditions=("1 of 3 facilities",),
             compare_with="S13-moderate", group="coverage"),
)
BY_ID = {s.id: s for s in SCENARIOS}


def ground_truth(scenario: Scenario):
    from app.evaluation.types import GroundTruth

    postal = {f.code: f.postal_code for f in scenario.facilities}
    return GroundTruth(
        scenario_id=scenario.id,
        outbreak_present=scenario.outbreak_present,
        true_outbreak_start=ONSET if scenario.outbreak_present else None,
        true_outbreak_end=END if scenario.outbreak_present else None,
        true_affected_facilities=scenario.affected_facilities,
        true_affected_geographies=tuple(postal[f] for f in scenario.affected_facilities),
        description=scenario.description,
    )
