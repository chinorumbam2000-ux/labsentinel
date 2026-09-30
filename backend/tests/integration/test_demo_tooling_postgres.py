"""
The presentation tooling suite (tests/test_demo_tooling.py), run against
PostgreSQL: readiness, the demo reset and its safeguards, and GET /api/readiness.
"""

import pytest

from tests.test_demo_tooling import *  # noqa: F401,F403

pytestmark = pytest.mark.postgres
