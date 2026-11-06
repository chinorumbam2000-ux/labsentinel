"""
Surveillance profiles (read-only).

The profile definitions and test memberships are read from the database
(tables created and filled by migration 0008); each profile's settings are
resolved from the registry by its configuration references.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LabTestProfileMembership, SurveillanceProfile
from app.profiles import registry
from app.schemas.profile import ProfileRead, ProfileTestRead, ProfileRoutingRead

router = APIRouter(prefix="/api/profiles", tags=["surveillance profiles"])


def _order() -> dict[str, int]:
    return {p.id: index for index, p in enumerate(registry.profiles())}


def _read(profile: SurveillanceProfile, members: list[LabTestProfileMembership]) -> ProfileRead:
    definition = registry.get_profile(profile.id)
    settings = registry.settings_for(definition) if definition else {}
    return ProfileRead(
        id=profile.id,
        display_name=profile.display_name,
        short_name=profile.short_name,
        category=profile.category,
        active=profile.active,
        description=profile.description,
        legacy_syndrome=profile.legacy_syndrome,
        engine_key=profile.engine_key,
        baseline_config_ref=profile.baseline_config_ref,
        signal_config_ref=profile.signal_config_ref,
        replay_available=profile.replay_available,
        live_available=profile.live_available,
        data_origin=profile.data_origin,
        tests=[ProfileTestRead(code=m.test_code, system=m.code_system, name=m.test_name) for m in members],
        settings=settings,
    )


def _members(db: Session) -> dict[str, list[LabTestProfileMembership]]:
    grouped: dict[str, list[LabTestProfileMembership]] = {}
    for member in db.scalars(select(LabTestProfileMembership).order_by(LabTestProfileMembership.test_code)):
        grouped.setdefault(member.profile_id, []).append(member)
    return grouped


@router.get("", response_model=list[ProfileRead])
def list_profiles(db: Session = Depends(get_db)) -> list[ProfileRead]:
    """Every surveillance profile, in registry order."""
    order = _order()
    members = _members(db)
    rows = sorted(db.scalars(select(SurveillanceProfile)), key=lambda p: (order.get(p.id, len(order)), p.id))
    return [_read(p, members.get(p.id, [])) for p in rows]


@router.get("/test-routing", response_model=ProfileRoutingRead)
def test_routing(code: str = Query(min_length=1, max_length=20), db: Session = Depends(get_db)) -> ProfileRoutingRead:
    """The profiles one result for ``code`` updates. Empty for an unmapped code."""
    order = _order()
    ids = db.scalars(select(LabTestProfileMembership.profile_id).where(LabTestProfileMembership.test_code == code))
    return ProfileRoutingRead(test_code=code, profile_ids=sorted(ids, key=lambda pid: (order.get(pid, len(order)), pid)))


@router.get(
    "/{profile_id}",
    response_model=ProfileRead,
    responses={status.HTTP_404_NOT_FOUND: {"description": "No such profile."}},
)
def get_profile(profile_id: str, db: Session = Depends(get_db)) -> ProfileRead:
    profile = db.get(SurveillanceProfile, profile_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    return _read(profile, _members(db).get(profile_id, []))
