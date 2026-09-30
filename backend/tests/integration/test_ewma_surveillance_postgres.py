"""
The EWMA suite (tests/test_ewma_surveillance.py), run against PostgreSQL:
persistence, recalculation, history, the current endpoint, the link to the
dynamic surveillance engine, and FHIR-driven recalculation.
"""

import pytest

from tests.test_ewma_surveillance import *  # noqa: F401,F403

pytestmark = pytest.mark.postgres
