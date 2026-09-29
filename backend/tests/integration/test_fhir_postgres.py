"""
The FHIR ingestion suite (tests/test_fhir_ingestion.py), run against
PostgreSQL. Importing the tests here collects them in this directory, where
``seeded_engine`` (and so ``fhir_env``) is the PostgreSQL one.
"""

import pytest

from tests.test_fhir_ingestion import *  # noqa: F401,F403

pytestmark = pytest.mark.postgres
