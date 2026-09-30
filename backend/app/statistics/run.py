"""
``python -m app.statistics.run``: run the statistical detectors (EWMA, CUSUM).

DEVELOPMENT COMMAND. Recomputes each detector's series for both metrics from
the persisted observations (via the dynamic surveillance aggregation) and
reconciles the stored results. Idempotent. Never changes the Composite
Outbreak Signal Score or the frozen demonstration, and one detector never
changes the other.

    python -m app.statistics.run                   both detectors (EWMA lambda 0.25, k 3; CUSUM k 0.5, h 5)
    python -m app.statistics.run --method ewma     EWMA only (likewise --method cusum)
    python -m app.statistics.run --report          also print the early-detection and
                                                   parameter-sensitivity analyses (not stored)
    python -m app.statistics.run --method cusum --clear   remove stored CUSUM results
"""

import argparse
import sys

from app.config import get_settings
from app.database import get_session_factory
from app.seed.dynamic_dataset import OUTBREAK_START
from app.statistics import cusum_persistence, cusum_service, persistence, service
from app.statistics.cusum import DISCLAIMER as CUSUM_DISCLAIMER
from app.statistics.cusum import CusumConfig
from app.statistics.types import DISCLAIMER, METRICS, EwmaConfig
from app.surveillance.types import DEFAULT_SYNDROME

SENSITIVITY_LAMBDAS = (0.15, 0.20, 0.25, 0.30)
SENSITIVITY_K = (0.25, 0.50, 0.75)
SENSITIVITY_H = (4.0, 5.0, 6.0)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.statistics.run", description=__doc__.split("\n\n")[0])
    parser.add_argument("--syndrome", default=DEFAULT_SYNDROME)
    parser.add_argument("--report", action="store_true", help="print the detection and sensitivity analysis")
    parser.add_argument("--method", choices=("all", "ewma", "cusum"), default="all")
    parser.add_argument("--clear", action="store_true", help="remove the chosen detector's stored results and stop")
    args = parser.parse_args(argv)
    if get_settings().app_env == "production":
        print("Refusing to run the development statistics command with APP_ENV=production.")
        return 1
    status = 0
    if args.method in ("all", "ewma"):
        status = run_ewma(args)
    if status == 0 and args.method in ("all", "cusum"):
        status = run_cusum(args)
    return status


def run_ewma(args: argparse.Namespace) -> int:
    config = EwmaConfig()
    with get_session_factory()() as session, session.begin():
        if args.clear:
            print(f"Removed {persistence.clear(session)} EWMA result(s).")
            return 0
        run = service.calculate(session, args.syndrome, config)
        if run is None:
            print(f"No eligible observations for {args.syndrome!r}; nothing to calculate.")
            return 0
        report = persistence.upsert_run(session, run)
        print(f"EWMA - {args.syndrome}, {run.first} to {run.last} (lambda {config.lam:g}, k {config.k:g})")
        for metric in METRICS:
            ref = run.references[metric]
            print(
                f"  {metric:<10} reference {ref.first} to {ref.last}: {ref.days} days, "
                f"mean {ref.mean if ref.mean is None else round(ref.mean, 3)}, "
                f"SD {ref.stddev if ref.stddev is None else round(ref.stddev, 3)} ({ref.status})"
            )
        print(f"  {report.created} created, {report.updated} updated, {report.unchanged} unchanged, {report.removed} removed.")
        for change in report.state_changes:
            print(f"  state change: {change}")
        if args.report:
            print_report(session, run, config, args.syndrome)
    print(DISCLAIMER)
    return 0


def print_report(session, run, config: EwmaConfig, syndrome: str) -> None:
    composite = service.dynamic_signals(session, syndrome)
    analysis = service.detection_analysis(run, composite)
    print(f"\nEarly detection ({analysis['evaluation_from']} to {analysis['evaluation_to']}):")
    for band, day in analysis["composite_first"].items():
        print(f"  Composite first {band:<9} {day}")
    for metric, levels in analysis["ewma_first"].items():
        print(f"  EWMA {metric:<10} first watch {levels['watch']}, first alert {levels['alert']}")
    print("  Lead (+) / lag (-) in days, EWMA vs composite band:")
    for key, by_band in analysis["lead_days"].items():
        print(f"    {key:<17} " + "  ".join(f"{band} {value:+d}" if value is not None else f"{band} -" for band, value in by_band.items()))
    print(f"\nLambda sensitivity (development only, not stored; k {config.k:g}; onset {OUTBREAK_START}):")
    print("  lambda  volume watch/alert        positivity watch/alert    overall alert vs High  state changes (vol/pos)  non-normal days before onset (vol/pos)")
    for row in service.sensitivity(session, syndrome, SENSITIVITY_LAMBDAS, config, OUTBREAK_START):
        print(
            f"  {row['lambda']:<6}  {row['volume_watch']} / {row['volume_alert']}  "
            f"{row['positivity_watch']} / {row['positivity_alert']}  "
            f"{row['overall_alert_lead_vs_high']:+d}{'':<20}"
            f"{row['volume_stability']['state_changes']}/{row['positivity_stability']['state_changes']}{'':<22}"
            f"{row['volume_stability']['non_normal_days_before']}/{row['positivity_stability']['non_normal_days_before']}"
            if row["overall_alert_lead_vs_high"] is not None else f"  {row}"
        )


def run_cusum(args: argparse.Namespace) -> int:
    config = CusumConfig()
    with get_session_factory()() as session, session.begin():
        if args.clear:
            print(f"Removed {cusum_persistence.clear(session)} CUSUM result(s).")
            return 0
        run = cusum_service.calculate(session, args.syndrome, config)
        if run is None:
            print(f"No eligible observations for {args.syndrome!r}; nothing to calculate.")
            return 0
        report = cusum_persistence.upsert_run(session, run)
        print(f"\nCUSUM - {args.syndrome}, {run.first} to {run.last} (k {config.k:g}, h {config.h:g}; reference shared with EWMA)")
        for metric in METRICS:
            ref = run.references[metric]
            print(f"  {metric:<10} reference {ref.first} to {ref.last}: {ref.days} days ({ref.status})")
        print(f"  {report.created} created, {report.updated} updated, {report.unchanged} unchanged, {report.removed} removed.")
        for change in report.state_changes:
            print(f"  state change: {change}")
        if args.report:
            print_cusum_report(session, run, config, args.syndrome)
    print(CUSUM_DISCLAIMER)
    return 0


def print_cusum_report(session, run, config: CusumConfig, syndrome: str) -> None:
    from app.services.statistics_service import rows, run_from_rows

    ewma_run = run_from_rows(syndrome, rows(session, syndrome))
    analysis = cusum_service.detection_analysis(
        run, service.dynamic_signals(session, syndrome), ewma_run.points if ewma_run else None
    )
    print(f"\nCUSUM detection ({analysis['evaluation_from']} to {analysis['evaluation_to']}):")
    print(f"  Composite first: {analysis['composite_first']}")
    print(f"  EWMA first:      {analysis['ewma_first']}")
    print(f"  CUSUM first alert: {analysis['cusum_first']}")
    for key, leads in analysis["lead_days"].items():
        print(f"    CUSUM {key:<10} lead(+)/lag(-): {leads}")
    print(f"  False alerts before onset {OUTBREAK_START}: {cusum_service.alerts_before(run, OUTBREAK_START)}")
    print(f"  Reference period, in-sample (analysis only): {analysis['reference_check']}")
    print(f"\nCUSUM sensitivity (development only, not stored; onset {OUTBREAK_START}):")
    print("  k     h    volume alert  positivity alert  false alerts before onset  reference in-sample alerts  overall vs composite High")
    for row in cusum_service.sensitivity(session, syndrome, SENSITIVITY_K, SENSITIVITY_H, config, OUTBREAK_START):
        print(
            f"  {row['k']:<5} {row['h']:<4} {row['volume_alert']}    {row['positivity_alert']}        "
            f"{row['false_alerts_before_onset']}   {row['reference_in_sample_alert_days']}   "
            f"{row['overall_lead_vs_composite_high']}"
        )


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
