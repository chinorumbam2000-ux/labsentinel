from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import TimestampMixin


class SurveillanceProfile(TimestampMixin, Base):
    """
    A surveillance target: a syndrome or a single pathogen.

    Defined in app/profiles/registry.json and stored by migration 0008.
    ``legacy_syndrome`` is the value lab_observation.syndrome and the
    dynamic engine use for this profile; it is NULL for a profile the engine
    does not calculate yet.
    """

    __tablename__ = "surveillance_profile"
    __table_args__ = (
        CheckConstraint("category IN ('Syndrome', 'Pathogen')", name="category_valid"),
        CheckConstraint(
            "data_origin IN ('replay-scenario', 'replay-derived', 'portfolio-fixture')",
            name="data_origin_valid",
        ),
        CheckConstraint("NOT live_available OR legacy_syndrome IS NOT NULL", name="live_needs_engine_key"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(120), unique=True)
    short_name: Mapped[str] = mapped_column(String(60))
    category: Mapped[str] = mapped_column(String(20))
    active: Mapped[bool] = mapped_column(Boolean)
    description: Mapped[str] = mapped_column(Text)
    legacy_syndrome: Mapped[str | None] = mapped_column(
        String(100), comment="lab_observation.syndrome / engine key for this profile, if the engine calculates it."
    )
    baseline_config_ref: Mapped[str] = mapped_column(String(64))
    signal_config_ref: Mapped[str] = mapped_column(String(64))
    replay_available: Mapped[bool] = mapped_column(Boolean, comment="Has the narrated Scenario Replay.")
    live_available: Mapped[bool] = mapped_column(
        Boolean, comment="The dynamic engine calculates it from ingested results."
    )
    data_origin: Mapped[str] = mapped_column(String(30))


class LabTestProfileMembership(Base):
    """Many-to-many: a laboratory test code counts towards each profile it is listed for."""

    __tablename__ = "lab_test_profile_membership"

    test_code: Mapped[str] = mapped_column(String(20), primary_key=True)
    profile_id: Mapped[str] = mapped_column(
        ForeignKey("surveillance_profile.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    code_system: Mapped[str] = mapped_column(String(100))
    test_name: Mapped[str] = mapped_column(String(200))
