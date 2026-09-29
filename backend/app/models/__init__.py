"""
ORM models. Importing this package registers every table on ``Base.metadata``,
which is what Alembic autogenerate and the tests rely on.
"""

from app.models.audit_event import AuditEvent
from app.models.facility import Facility
from app.models.lab_observation import LabObservation
from app.models.surveillance_signal import SurveillanceSignal

__all__ = ["AuditEvent", "Facility", "LabObservation", "SurveillanceSignal"]
