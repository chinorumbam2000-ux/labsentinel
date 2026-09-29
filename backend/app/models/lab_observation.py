from datetime import datetime
from typing import TYPE_CHECKING

from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.vocabulary import OBSERVATION_STATUSES, RESULT_TYPES, TERMINOLOGY_STATUSES, sql_in
from app.database import Base
from app.models.mixins import BigIntPK, CreatedAtMixin

if TYPE_CHECKING:
    from app.models.facility import Facility


class LabObservation(CreatedAtMixin, Base):
    """
    One normalized laboratory result.

    Deliberately holds no direct patient identifiers: no name, address, date
    of birth, SSN or MRN. ``patient_reference`` is a synthetic, de-identified
    token and ``geographic_unit`` is a surveillance area, never an address.
    """

    __tablename__ = "lab_observation"
    __table_args__ = (
        # The same source result must never be stored twice; later ingestion
        # relies on this to be safely re-runnable.
        UniqueConstraint(
            "source_system",
            "source_observation_id",
            name="uq_lab_observation_source_record",
        ),
        CheckConstraint(sql_in("status", OBSERVATION_STATUSES), name="status_valid"),
        CheckConstraint(sql_in("result_type", RESULT_TYPES), name="result_type_valid"),
        CheckConstraint(
            sql_in("terminology_status", TERMINOLOGY_STATUSES), name="terminology_status_valid"
        ),
        # A syndrome is recorded exactly when the test is mapped: an unmapped
        # code is never given a guessed syndrome.
        CheckConstraint(
            "(terminology_status = 'mapped' AND syndrome IS NOT NULL) OR "
            "(terminology_status = 'unmapped' AND syndrome IS NULL)",
            name="syndrome_matches_terminology",
        ),
        CheckConstraint(
            "result_type <> 'quantity' OR result_numeric IS NOT NULL",
            name="quantity_has_number",
        ),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    source_observation_id: Mapped[str] = mapped_column(
        String(128), comment="Identifier of the result in its source system."
    )
    facility_id: Mapped[int] = mapped_column(
        ForeignKey("facility.id", ondelete="RESTRICT"), index=True
    )
    patient_reference: Mapped[str] = mapped_column(
        String(64),
        comment=(
            "Synthetic, de-identified reference only. Never a name, MRN or "
            "other direct identifier."
        ),
    )

    # Null only for an unmapped LOINC code (see terminology_status).
    syndrome: Mapped[str | None] = mapped_column(String(100), index=True)
    test_name: Mapped[str] = mapped_column(String(200))
    loinc_code: Mapped[str] = mapped_column(String(20), index=True)
    terminology_status: Mapped[str] = mapped_column(
        String(20),
        default="mapped",
        server_default="mapped",
        comment="mapped: the LOINC code maps to a LabSentinel test and syndrome.",
    )
    code_display: Mapped[str | None] = mapped_column(
        String(255), comment="The source's own display text for the LOINC code."
    )
    result_type: Mapped[str] = mapped_column(String(20))
    # Normalized result: 'Positive' / 'Negative' for qualitative tests, the
    # source text for other coded or string results, the number for quantities.
    result_value: Mapped[str | None] = mapped_column(String(255))
    result_unit: Mapped[str | None] = mapped_column(String(50))
    result_numeric: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    result_unit_system: Mapped[str | None] = mapped_column(
        String(100), comment="Unit code system, e.g. http://unitsofmeasure.org (UCUM)."
    )
    result_unit_code: Mapped[str | None] = mapped_column(String(50))
    result_code_system: Mapped[str | None] = mapped_column(
        String(100), comment="Code system of a coded result, e.g. SNOMED CT."
    )
    result_code: Mapped[str | None] = mapped_column(String(50))
    source_report_id: Mapped[str | None] = mapped_column(
        String(128), comment="Source DiagnosticReport that grouped this result, if any."
    )
    specimen_type: Mapped[str | None] = mapped_column(String(100))

    effective_datetime: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True
    )
    # Nullable: when the source does not say when a result was received, it is
    # recorded as unknown rather than guessed.
    received_datetime: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    geographic_unit: Mapped[str] = mapped_column(
        String(50),
        comment="Surveillance area code (for example a ZIP). Never a patient address.",
    )
    source_system: Mapped[str] = mapped_column(String(100))

    status: Mapped[str] = mapped_column(
        String(20), default="final", server_default="final"
    )

    facility: Mapped["Facility"] = relationship(back_populates="observations")

    def __repr__(self) -> str:
        return (
            f"<LabObservation id={self.id} "
            f"source={self.source_system!r}:{self.source_observation_id!r}>"
        )
