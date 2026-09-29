"""
``python -m app.seed.verify``: check the database against the frontend dataset.

By default it re-exports the dataset straight from the React prototype's
TypeScript source (needs Node and the frontend's node_modules), so it catches
drift in any link of the chain: frontend source, exported fixture, seed, or
database. ``--fixture`` compares against the committed fixture instead.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

from app.database import get_session_factory
from app.seed.dataset import DATASET_PATH
from app.seed.parity import compare_with_frontend

REPO_ROOT = Path(__file__).resolve().parents[3]
EXPORTER = "scripts/export-demo-dataset.ts"


def export_from_frontend() -> dict:
    npx = shutil.which("npx")
    if npx is None:
        raise RuntimeError("npx not found; install Node.js or use --fixture")
    completed = subprocess.run(
        [npx, "vite-node", EXPORTER, "--stdout"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )
    return json.loads(completed.stdout)


def main(argv: list[str]) -> int:
    if "--fixture" in argv:
        source, raw = f"committed fixture {DATASET_PATH.name}", json.loads(
            DATASET_PATH.read_text(encoding="utf-8")
        )
    else:
        source, raw = "a fresh export of the React prototype's source", export_from_frontend()
        fixture = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
        if fixture != raw:
            print("FAIL: the committed seed fixture is stale; re-run the exporter and the seed.")
            return 1
        print("Committed fixture matches the frontend source.")

    with get_session_factory()() as session:
        problems = compare_with_frontend(session, raw)

    print(f"Compared the database with {source}.")
    if problems:
        print(f"FAIL: {len(problems)} difference(s):")
        for problem in problems[:50]:
            print(f"  - {problem}")
        return 1
    print(
        f"PASS: {len(raw['facilities'])} facilities, {len(raw['observations'])} observations "
        f"and {len(raw['days'])} simulation days match field for field."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
