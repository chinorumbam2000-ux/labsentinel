from pydantic import BaseModel, Field


class ProfileTestRead(BaseModel):
    code: str
    system: str
    name: str


class ProfileRead(BaseModel):
    """A surveillance profile as stored (migration 0008), with its resolved settings."""

    id: str
    display_name: str
    short_name: str
    category: str
    active: bool
    description: str
    legacy_syndrome: str | None = Field(
        description="The syndrome key the dynamic engine calculates this profile under, if any."
    )
    baseline_config_ref: str
    signal_config_ref: str
    replay_available: bool
    live_available: bool
    data_origin: str
    tests: list[ProfileTestRead]
    settings: dict = Field(description="Illustrative defaults inherited from the current configuration; not validated.")


class ProfileRoutingRead(BaseModel):
    """Every profile one result for this test code counts towards."""

    test_code: str
    profile_ids: list[str]
