"""
The read-only API contract suite (tests/test_api_data.py), run against
PostgreSQL. Importing the tests here collects them in this directory, where
the ``seeded_client`` fixture is the PostgreSQL one.
"""

import pytest

from tests.test_api_data import *  # noqa: F401,F403

pytestmark = pytest.mark.postgres
