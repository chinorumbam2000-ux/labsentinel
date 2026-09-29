"""
SQLAlchemy 2.x database foundation: declarative base, engine, session
factory and the request-scoped session dependency.

The engine is created lazily, so importing the application never opens a
connection. The API can start, and ``GET /api/health`` can answer, even when
PostgreSQL is down.
"""

from collections.abc import Iterator
from functools import lru_cache
from typing import Any

from sqlalchemy import Engine, MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

# Deterministic constraint names, so Alembic migrations can find and alter
# constraints later without guessing at database-generated names.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def build_engine(
    url: str, *, connect_timeout: int = 5, echo: bool = False, **engine_kwargs: Any
) -> Engine:
    connect_args: dict[str, object] = {}
    if url.startswith("postgresql"):
        connect_args["connect_timeout"] = connect_timeout
    return create_engine(
        url,
        echo=echo,
        # Detects connections the server has dropped before handing them out.
        pool_pre_ping=True,
        connect_args=connect_args,
        **engine_kwargs,
    )


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    return build_engine(
        settings.database_url.get_secret_value(),
        connect_timeout=settings.database_connect_timeout,
        echo=settings.database_echo,
    )


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed afterwards."""
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
