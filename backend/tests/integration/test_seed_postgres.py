"""
The seed suite (tests/test_seed.py), run against PostgreSQL: exact counts,
idempotency and field-for-field parity with the frontend dataset. Importing
the tests here collects them in this directory, where ``empty_session`` is
the PostgreSQL one.
"""

import pytest

from tests.test_seed import *  # noqa: F401,F403

pytestmark = pytest.mark.postgres
