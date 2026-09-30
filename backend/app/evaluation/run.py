"""
``python -m app.evaluation.run``: the capstone evaluation.

Runs the three existing detectors, unchanged and with their default
parameters, on repeated realizations of every synthetic scenario, each in a
throwaway SQLite database, and writes the evaluation artifacts.

    python -m app.evaluation.run --all --repetitions 100
    python -m app.evaluation.run --scenario S03-gradual --scenario S13-moderate --repetitions 20
    python -m app.evaluation.run --all --seed 20260930 --output evaluation-results

The same command and seed reproduce the same results byte for byte.
Never touches the application's database or data.

These evaluations use synthetic scenarios and demonstrate technical behavior
only. They do not establish clinical or epidemiological validation.
"""

import argparse
import logging
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from app.evaluation import reports
from app.evaluation.runner import run_one
from app.evaluation.scenarios import BY_ID, SCENARIOS
from app.evaluation.types import DISCLAIMER

DEFAULT_SEED = 20260930
DEFAULT_REPETITIONS = 100
DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "evaluation-results"


def run(scenario_ids: list[str], repetitions: int, seed: int, workers: int) -> dict:
    tasks = [(sid, rep, seed) for sid in scenario_ids for rep in range(repetitions)]
    if workers <= 1:
        outputs = [run_one(task) for task in tasks]
    else:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            outputs = list(pool.map(run_one, tasks, chunksize=max(1, len(tasks) // (workers * 8))))
    results: dict[str, list] = {sid: [] for sid in scenario_ids}
    for output in outputs:
        results[output.scenario_id].append(output)
    scenarios = [BY_ID[sid] for sid in scenario_ids]
    return reports.build_summary(scenarios, results, seed, repetitions)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.evaluation.run", description=__doc__.split("\n\n")[0])
    parser.add_argument("--all", action="store_true", help="every scenario (the default when none is named)")
    parser.add_argument("--scenario", action="append", choices=sorted(BY_ID), help="a scenario id (repeatable)")
    parser.add_argument("--repetitions", type=int, default=DEFAULT_REPETITIONS)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--workers", type=int, default=min(12, os.cpu_count() or 1))
    args = parser.parse_args(argv)
    if args.repetitions < 1:
        parser.error("--repetitions must be at least 1")
    logging.disable(logging.INFO)
    scenario_ids = [s.id for s in SCENARIOS] if args.all or not args.scenario else args.scenario
    started = time.perf_counter()
    summary = run(scenario_ids, args.repetitions, args.seed, args.workers)
    paths = reports.write(summary, args.output)
    print(f"Evaluated {len(scenario_ids)} scenario(s) x {args.repetitions} realization(s) in "
          f"{time.perf_counter() - started:.0f}s (seed {args.seed}).")
    for kind, path in paths.items():
        print(f"  {kind:<8} {path}")
    print(DISCLAIMER)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
