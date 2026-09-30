"""
The CUSUM suite (tests/test_cusum_surveillance.py), run against PostgreSQL:
persistence, the current/history/comparison API, recalculation, the link to
the dynamic surveillance engine, and FHIR-driven CUSUM updates.
"""

import pytest

from tests.test_cusum_surveillance import *  # noqa: F401,F403

pytestmark = pytest.mark.postgres
