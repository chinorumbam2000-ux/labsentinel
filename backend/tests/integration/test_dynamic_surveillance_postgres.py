"""
The dynamic surveillance suite (tests/test_dynamic_surveillance.py), run
against PostgreSQL: dynamic observations, signal creation, recalculation and
update, persistence progression, the API and demo/dynamic separation.
"""

import pytest

from tests.test_dynamic_surveillance import *  # noqa: F401,F403

pytestmark = pytest.mark.postgres
