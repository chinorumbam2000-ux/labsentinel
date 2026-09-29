import pytest
from sqlalchemy import Engine, inspect

from tests.integration.conftest import migrate
from tests.test_migrations import CORE_TABLES

pytestmark = pytest.mark.postgres


def test_downgrade_base_then_upgrade_head(pg_engine: Engine) -> None:
    migrate(pg_engine, "base", down=True)
    assert not CORE_TABLES & set(inspect(pg_engine).get_table_names())

    migrate(pg_engine, "head")
    assert CORE_TABLES <= set(inspect(pg_engine).get_table_names())
