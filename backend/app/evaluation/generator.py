"""
Deterministic synthetic observation generator for evaluation scenarios.

Randomness: every (repetition, facility, day) cell has its own random
stream, seeded by integer arithmetic from the base seed (never by Python's
salted hash):

    cell seed = base_seed * 1_000_003 + repetition * 10_007 + facility_index * 1_009 + day_index

so the same command and seed always produce the same observations. Because
the streams do not depend on the scenario, a scenario and its data-quality
variant (for example S13 and S09) share identical draws wherever their plans
agree: "common random numbers", which makes paired comparisons fair.

Per cell:  tests ~ Poisson(mean x volume multiplier)
           each test positive with probability = positivity (so positives ~ Binomial)
           unmapped coding / missing specimen / reporting delay per the day plan
"""

import math
import random
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.evaluation.scenarios import START, TOTAL_DAYS, day_offset
from app.evaluation.types import Scenario

ZONE = ZoneInfo("America/New_York")
SYNDROME = "Respiratory Viral Syndrome"
MAPPED_TESTS = (
    ("92142-9", "Influenza A RNA"),
    ("94500-6", "SARS-CoV-2 RNA"),
    ("85479-4", "RSV RNA"),
)
UNMAPPED_TEST = ("94309-2", "SARS-CoV-2 RNA (unmapped local code)")
POSITIVE = ("Positive", "10828004")
NEGATIVE = ("Negative", "260385009")
SNOMED = "http://snomed.info/sct"


def cell_seed(base_seed: int, repetition: int, facility_index: int, day_index: int) -> int:
    return base_seed * 1_000_003 + repetition * 10_007 + facility_index * 1_009 + day_index


def poisson(rng: random.Random, mean: float) -> int:
    """Knuth's method; exact for the small means used here."""
    if mean <= 0:
        return 0
    limit, k, product = math.exp(-mean), 0, 1.0
    while True:
        k += 1
        product *= rng.random()
        if product <= limit:
            return k - 1


@dataclass(frozen=True)
class Draw:
    facility: str
    day: date
    tests: int
    positives: int


def generate(scenario: Scenario, repetition: int, base_seed: int) -> tuple[list[dict], list[Draw]]:
    """
    All observation rows of one realization (facility given by code; the
    runner maps it to the database id), and the per-cell draws (for tests).
    """
    rows: list[dict] = []
    draws: list[Draw] = []
    for day_index in range(TOTAL_DAYS):
        day = START + timedelta(days=day_index)
        offset = day_offset(day)
        for facility_index, facility in enumerate(scenario.facilities):
            plan = scenario.plan(facility.code, offset)
            rng = random.Random(cell_seed(base_seed, repetition, facility_index, day_index))
            tests = poisson(rng, facility.mean_tests * plan.volume_multiplier)
            outcomes = [rng.random() < plan.positivity for _ in range(tests)]
            codings = [rng.random() < plan.unmapped_share for _ in range(tests)]
            missing = [rng.random() < plan.missing_specimen_share for _ in range(tests)]
            delays = [rng.randint(*plan.delay_days) if plan.delay_days else 0 for _ in range(tests)]
            draws.append(Draw(facility.code, day, tests, sum(outcomes)))
            if not plan.reporting:
                continue
            spacing = 13 * 60 // max(tests, 1)
            for i in range(tests):
                effective = datetime.combine(day, time(7), ZONE) + timedelta(minutes=i * spacing)
                received = effective + timedelta(days=delays[i], minutes=10 + (i * 7) % 30)
                unmapped = codings[i]
                loinc, name = UNMAPPED_TEST if unmapped else MAPPED_TESTS[i % 3]
                value, code = POSITIVE if outcomes[i] else NEGATIVE
                rows.append({
                    "facility_code": facility.code,
                    "source_system": f"eval:{scenario.id}",
                    "source_observation_id": f"{facility.code}-{day:%Y%m%d}-{i:03d}",
                    "patient_reference": f"EVAL-PT-{repetition:03d}-{facility_index}{day_index:02d}{i:03d}",
                    "syndrome": None if unmapped else SYNDROME,
                    "terminology_status": "unmapped" if unmapped else "mapped",
                    "test_name": name,
                    "loinc_code": loinc,
                    "code_display": name,
                    "result_type": "coded",
                    "result_value": value,
                    "result_code_system": SNOMED,
                    "result_code": code,
                    "specimen_type": None if missing[i] else "Nasopharyngeal swab",
                    "effective_datetime": effective.astimezone(UTC),
                    "received_datetime": received.astimezone(UTC),
                    "geographic_unit": next(f.postal_code for f in scenario.facilities if f.code == facility.code),
                    "status": "final",
                })
    return rows, draws
