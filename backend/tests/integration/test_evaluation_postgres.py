"""
The evaluation runner on PostgreSQL: one realization gives exactly the same
day-by-day detector results as on the throwaway SQLite evaluation database,
so the evaluation's findings do not depend on the database engine.
"""

from dataclasses import asdict

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.evaluation.database import Workspace, insert_facilities
from app.evaluation.runner import run_on_engine, run_realization
from app.evaluation.scenarios import BY_ID
from tests.integration.conftest import truncate_all

pytestmark = pytest.mark.postgres
SEED = 20260930


@pytest.mark.parametrize("scenario_id", ["S13-moderate", "S10-delayed-data"])
def test_realization_matches_sqlite(pg_engine: Engine, scenario_id: str) -> None:
    truncate_all(pg_engine)
    try:
        with Session(pg_engine) as session, session.begin():
            insert_facilities(session)
        on_postgres = run_on_engine(pg_engine, BY_ID[scenario_id], 0, SEED)
    finally:
        truncate_all(pg_engine)
    workspace = Workspace()
    try:
        on_sqlite = run_realization(BY_ID[scenario_id], 0, SEED, workspace.fresh(scenario_id))
    finally:
        workspace.close()
    assert [asdict(d) for d in on_postgres.days] == [asdict(d) for d in on_sqlite.days]
    assert on_postgres.as_of_detection == on_sqlite.as_of_detection
    assert on_postgres.observation_count == on_sqlite.observation_count
