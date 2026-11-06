"""
Request parameters naming a surveillance profile.

The dynamic, EWMA and CUSUM endpoints accept ``?profile=<id>`` beside the
older ``?syndrome=``. With neither they resolve to Respiratory Viral
Syndrome, exactly as before, so existing clients are unaffected.
"""

from fastapi import HTTPException, Query, status

from app.profiles.registry import resolve_engine_key
from app.surveillance.types import DEFAULT_SYNDROME


def engine_key_param(
    syndrome: str | None = Query(
        default=None,
        max_length=100,
        description="Engine key (older parameter). Default: Respiratory Viral Syndrome.",
    ),
    profile: str | None = Query(
        default=None,
        max_length=64,
        description="Surveillance profile id, e.g. influenza-a. Resolves to the profile's engine key.",
    ),
) -> str:
    try:
        return resolve_engine_key(syndrome, profile, DEFAULT_SYNDROME)
    except LookupError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(422, detail=str(error)) from error


def resolve_request_key(syndrome: str, profile: str | None, syndrome_given: bool) -> str:
    """For request bodies: ``profile`` wins when given; an explicit, different ``syndrome`` is refused."""
    return resolve_engine_key(syndrome if syndrome_given else None, profile, syndrome)
