"""Column types and mixins shared across models."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

# BIGINT identity on PostgreSQL. SQLite (used only by the unit tests) only
# auto-increments a column declared exactly as INTEGER PRIMARY KEY.
BigIntPK = BigInteger().with_variant(Integer(), "sqlite")


class CreatedAtMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TimestampMixin(CreatedAtMixin):
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
