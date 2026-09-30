"""
``python -m app.surveillance.run``: run the dynamic surveillance engine.

DEVELOPMENT COMMAND. Reads persisted laboratory observations and calculates,
then stores, the dynamic signal for each date. Idempotent: running a date
again reconciles its existing dynamic signal. Never touches the frozen
five-day demonstration.

    python -m app.surveillance.run                       every date with eligible observations
    python -m app.surveillance.run --date 2026-01-20     one date (persistence reads 2026-01-19)
    python -m app.surveillance.run --from 2026-01-01 --to 2026-01-20
    python -m app.surveillance.run --syndrome "Respiratory Viral Syndrome"
    python -m app.surveillance.run --clear               remove every dynamic signal
"""

import argparse
import sys
from datetime import date

from app.config import get_settings
from app.database import get_session_factory
from app.surveillance import DISCLAIMER
from app.surveillance.aggregator import observed_date_range
from app.surveillance.persistence import clear_dynamic_signals, recalculate
from app.surveillance.types import DEFAULT_SYNDROME, EngineConfig


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m app.surveillance.run", description=__doc__.split("\n\n")[0])
    parser.add_argument("--syndrome", default=DEFAULT_SYNDROME)
    parser.add_argument("--date", type=date.fromisoformat, help="one surveillance date (YYYY-MM-DD)")
    parser.add_argument("--from", dest="first", type=date.fromisoformat, help="first date of a range")
    parser.add_argument("--to", dest="last", type=date.fromisoformat, help="last date of a range")
    parser.add_argument("--clear", action="store_true", help="remove every dynamic signal and stop")
    args = parser.parse_args(argv)
    if args.date and (args.first or args.last):
        parser.error("use --date or --from/--to, not both")
    if (args.first is None) != (args.last is None):
        parser.error("--from and --to go together")
    return args


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if get_settings().app_env == "production":
        print("Refusing to run the development surveillance command with APP_ENV=production.")
        return 1
    config = EngineConfig()
    with get_session_factory()() as session, session.begin():
        if args.clear:
            print(f"Removed {clear_dynamic_signals(session)} dynamic signal(s). Demonstration signals untouched.")
            return 0
        if args.date:
            first = last = args.date
        elif args.first:
            first, last = args.first, args.last
        else:
            span = observed_date_range(session, args.syndrome, config)
            if span is None:
                print(f"No eligible observations for {args.syndrome!r}; nothing to calculate.")
                return 0
            first, last = span
        try:
            report = recalculate(session, args.syndrome, first, last, config)
        except ValueError as error:
            print(f"Not run: {error}")
            return 1

    print(f"Dynamic surveillance - {args.syndrome}, {first.isoformat()} to {last.isoformat()}")
    for day in report.days:
        score = "" if day.composite_score is None else f"{day.composite_score:>3} {day.severity}"
        print(f"  {day.signal_date.isoformat()}  {day.outcome:<9}  {day.calculation_status:<21}  {score}")
    for day in report.skipped:
        print(f"  {day.isoformat()}  skipped    frozen demonstration period")
    print(
        f"{report.count('created')} created, {report.count('updated')} updated, "
        f"{report.count('unchanged')} unchanged."
    )
    print(DISCLAIMER)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
