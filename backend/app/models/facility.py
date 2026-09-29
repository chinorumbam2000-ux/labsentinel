from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, String, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.lab_observation import LabObservation


class Facility(TimestampMixin, Base):
    """A participating laboratory-reporting organization."""

    __tablename__ = "facility"
    __table_args__ = (
        CheckConstraint("length(country_code) = 2", name="country_code_length"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    vendor: Mapped[str] = mapped_column(
        String(100),
        comment=(
            "EHR/LIS platform label, descriptive only. Implies no ranking or "
            "comparison of vendor quality, maturity or reliability."
        ),
    )
    facility_code: Mapped[str] = mapped_column(String(50), unique=True)
    city: Mapped[str] = mapped_column(String(100))
    postal_code: Mapped[str | None] = mapped_column(
        String(20), comment="Postal code of the facility's surveillance area (e.g. a ZIP)."
    )
    subregion: Mapped[str | None] = mapped_column(
        String(100), comment="County, district or equivalent second-level area."
    )
    region: Mapped[str] = mapped_column(
        String(100), comment="State, province or equivalent first-level region."
    )
    country_code: Mapped[str] = mapped_column(
        String(2), comment="ISO 3166-1 alpha-2 country code."
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())

    # passive_deletes="all": never NULL out children's facility_id on delete.
    # The database's ON DELETE RESTRICT decides, so a facility with
    # observations cannot be removed and no observation is ever orphaned.
    observations: Mapped[list["LabObservation"]] = relationship(
        back_populates="facility", passive_deletes="all"
    )

    def __repr__(self) -> str:
        return f"<Facility id={self.id} code={self.facility_code!r}>"
