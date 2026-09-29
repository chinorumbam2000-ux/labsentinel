"""
ORM models. Importing this package registers every table on ``Base.metadata``,
which is what Alembic autogenerate and the tests rely on.
"""

from app.models.audit_event import AuditEvent
from app.models.demo_simulation_day import DemoSimulationDay
from app.models.facility import Facility
from app.models.lab_observation import LabObservation
from app.models.surveillance_signal import SurveillanceSignal

__all__ = [
    "AuditEvent",
    "DemoSimulationDay",
    "Facility",
    "LabObservation",
    "SurveillanceSignal",
]
