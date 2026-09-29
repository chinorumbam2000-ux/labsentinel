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

# Whether an observation's LOINC code maps to a LabSentinel test and syndrome.
TERMINOLOGY_STATUSES = ("mapped", "unmapped")


def sql_in(column: str, values: tuple[str, ...]) -> str:
    """Render a CHECK constraint body restricting ``column`` to ``values``."""
    quoted = ", ".join("'" + value.replace("'", "''") + "'" for value in values)
    return f"{column} IN ({quoted})"
