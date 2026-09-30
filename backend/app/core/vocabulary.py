"""
Controlled vocabularies shared by the models and, later, the API schemas.

The severity, confidence and investigation values match the existing React
prototype (``src/types/index.ts``) exactly, so that when the frontend is
eventually pointed at this API the two agree without any translation layer.
"""

# Composite Outbreak Signal Score bands (src/lib/signalScore.ts).
SEVERITY_LEVELS = ("Low", "Watch", "Moderate", "High", "Critical")

# Data Confidence Score bands (src/lib/dataConfidence.ts).
CONFIDENCE_LEVELS = ("Very High", "High", "Moderate", "Low")

# Human-in-the-loop review states (src/lib/investigationWorkflow.ts).
SIGNAL_STATUSES = (
    "NEW",
    "UNDER REVIEW",
    "MONITORING",
    "ESCALATED",
    "DISMISSED",
    "CONFIRMED CONCERN",
    "CLOSED",
)

# FHIR R4 Observation.status value set. Stored now so that later ingestion
# can keep amended or entered-in-error results out of the signal.
OBSERVATION_STATUSES = (
    "registered",
    "preliminary",
    "final",
    "amended",
    "corrected",
    "cancelled",
    "entered-in-error",
    "unknown",
)

# Which FHIR Observation.value[x] shape the stored result came from.
RESULT_TYPES = ("coded", "quantity", "string", "boolean")

# participating: one of the surveillance network's facilities (shown by the
# API and the dashboard). development: a fictional development source, such
# as the SMART sandbox, reachable only through a configured development
# mapping and never shown as a participating facility.
FACILITY_PARTICIPATIONS = ("participating", "development")

# Where a surveillance signal came from. demo: the frozen five-day classroom
# simulation (seeded, never recalculated). dynamic: calculated by the dynamic
# surveillance engine (app/surveillance) from persisted observations. The two
# are stored in one table but never returned together.
SIGNAL_MODES = ("demo", "dynamic")

# Whether a dynamic signal could be scored. A demo signal is always CALCULATED.
#   INSUFFICIENT_BASELINE  too little history for a baseline; no score is produced
#   NO_DATA                no eligible observations for the date; no score is produced
CALCULATION_STATUSES = ("CALCULATED", "INSUFFICIENT_BASELINE", "NO_DATA")

# Secondary statistical detectors (app/statistics), stored per metric in
# statistical_signal, never in the Composite Outbreak Signal Score columns.
STATISTICAL_METHODS = ("EWMA",)
STATISTICAL_METRICS = ("volume", "positivity")
#   REFERENCE_PERIOD       the day is part of the historical reference; not monitored
#   INSUFFICIENT_BASELINE  too few reference days to estimate a mean and SD
#   INSUFFICIENT_VARIANCE  the reference SD is zero: no control limit can be set
#   NO_DATA                no eligible results that day; the EWMA is carried forward
STATISTICAL_STATUSES = (
    "CALCULATED",
    "REFERENCE_PERIOD",
    "INSUFFICIENT_BASELINE",
    "INSUFFICIENT_VARIANCE",
    "NO_DATA",
)
STATISTICAL_ALERT_STATES = ("NORMAL", "WATCH", "STATISTICAL_ALERT")

# Whether an observation's LOINC code maps to a LabSentinel test and syndrome.
TERMINOLOGY_STATUSES = ("mapped", "unmapped")


def sql_in(column: str, values: tuple[str, ...]) -> str:
    """Render a CHECK constraint body restricting ``column`` to ``values``."""
    quoted = ", ".join("'" + value.replace("'", "''") + "'" for value in values)
    return f"{column} IN ({quoted})"
