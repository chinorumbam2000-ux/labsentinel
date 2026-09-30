"""
Geographic units for dynamic surveillance, from the configured facility geography.

A facility's surveillance area is its configured postal code (the finest
level of the hierarchy postal code -> subregion -> region -> country). No
patient location is read: an area is attributed to a facility, never to a
person. Small-count suppression happens where counts are displayed (the UI's
existing adaptive privacy rule); the engine stores aggregate counts only.
"""

from dataclasses import dataclass

from app.surveillance.types import FacilityInfo

AREA_LEVEL = "postal_code"


@dataclass(frozen=True)
class Area:
    code: str
    subregion: str | None
    region: str
    country_code: str

    def as_dict(self) -> dict:
        return {
            "code": self.code,
            "level": AREA_LEVEL,
            "subregion": self.subregion,
            "region": self.region,
            "country_code": self.country_code,
        }


def area_for(facility: FacilityInfo) -> Area:
    # A facility without a postal code is placed at its subregion rather than
    # being dropped from the geography.
    code = facility.postal_code or facility.subregion or facility.region
    return Area(code, facility.subregion, facility.region, facility.country_code)


def areas_for(facilities: list[FacilityInfo]) -> list[Area]:
    """Distinct areas of the given facilities, ordered by code."""
    return sorted({area_for(f) for f in facilities}, key=lambda area: area.code)
