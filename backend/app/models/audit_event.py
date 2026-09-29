from sqlalchemy import Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import BigIntPK, CreatedAtMixin


class AuditEvent(CreatedAtMixin, Base):
    """
    Append-only record of something that happened to an entity.

    There is no actor column yet because there is no authentication yet; one
    will be added alongside user accounts in a later phase.
    """

    __tablename__ = "audit_event"
    __table_args__ = (
        Index("ix_audit_event_entity", "entity_type", "entity_id"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(100), index=True)
    entity_type: Mapped[str] = mapped_column(String(100))
    # A string so it can reference any table's key type, or an external id.
    entity_id: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text)

    def __repr__(self) -> str:
        return f"<AuditEvent id={self.id} {self.event_type!r} {self.entity_type!r}>"
