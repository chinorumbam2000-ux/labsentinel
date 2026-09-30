"""
Capstone evaluation results — DEVELOPMENT ONLY, READ ONLY.

Serves the artifacts written by ``python -m app.evaluation.run``. There is no
endpoint that runs or writes an evaluation: results are produced only by the
command, reproducibly. 404 outside development, or before any evaluation has
been run.

These evaluations use synthetic scenarios and demonstrate technical behavior
only. They do not establish clinical or epidemiological validation.
"""

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import get_settings

router = APIRouter(prefix="/api/evaluation", tags=["capstone evaluation (development only)"])
BACKEND_DIR = Path(__file__).resolve().parents[2]
SUMMARY_FILE = "evaluation-summary.json"


def require_development() -> None:
    if get_settings().app_env != "development":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not Found")


def _load() -> dict:
    directory = Path(get_settings().evaluation_results_dir)
    if not directory.is_absolute():
        directory = BACKEND_DIR / directory
    path = directory / SUMMARY_FILE
    if not path.is_file():
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail="No evaluation results yet. Run: python -m app.evaluation.run --all --repetitions 100",
        )
    return json.loads(path.read_text(encoding="utf-8"))


def _brief(scenario: dict) -> dict:
    return {key: value for key, value in scenario.items() if key != "representative"}


@router.get("/summary", dependencies=[Depends(require_development)])
def summary() -> dict:
    """Design, definitions, aggregate metrics, robustness, coverage, sensitivity, attributes and threats."""
    data = _load()
    return {**{k: v for k, v in data.items() if k != "scenarios"}, "scenarios": [_brief(s) for s in data["scenarios"]]}


@router.get("/scenarios", dependencies=[Depends(require_development)])
def scenarios() -> list[dict]:
    return [
        {key: s[key] for key in ("id", "number", "name", "purpose", "group", "conditions", "ground_truth", "realizations")}
        for s in _load()["scenarios"]
    ]


@router.get("/scenarios/{scenario_id}", dependencies=[Depends(require_development)])
def scenario(scenario_id: str) -> dict:
    """One scenario's metrics and a representative realization's timeline."""
    for s in _load()["scenarios"]:
        if s["id"] == scenario_id:
            return s
    raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No such scenario.")
