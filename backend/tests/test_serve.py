"""
``python -m app.serve``, the platform (Render) start command: binds 0.0.0.0 on
$PORT, migrates only when MIGRATE_ON_START is set, always before serving, and
never seeds or resets data.
"""

import pytest

from app import serve


def test_binds_all_interfaces_on_the_platform_port() -> None:
    assert serve.server_options({"PORT": "10000"}) == {
        "host": "0.0.0.0",
        "port": 10000,
        "proxy_headers": True,
        "forwarded_allow_ips": "*",
    }
    assert serve.server_options({})["port"] == 8000


@pytest.mark.parametrize("port", ["0", "70000", "not-a-port"])
def test_rejects_an_invalid_port(port: str) -> None:
    with pytest.raises(ValueError):
        serve.server_options({"PORT": port})


@pytest.mark.parametrize(("value", "expected"), [("true", True), ("1", True), ("YES", True), ("false", False), ("", False)])
def test_migrate_on_start_flag(value: str, expected: bool) -> None:
    assert serve.env_flag("MIGRATE_ON_START", {"MIGRATE_ON_START": value}) is expected
    assert serve.env_flag("MIGRATE_ON_START", {}) is False


@pytest.mark.parametrize("flag", ["true", "false"])
def test_migrates_only_when_asked_and_before_serving(monkeypatch: pytest.MonkeyPatch, flag: str) -> None:
    calls: list[str] = []
    monkeypatch.setenv("MIGRATE_ON_START", flag)
    monkeypatch.setenv("PORT", "10000")
    monkeypatch.setattr(serve, "migrate", lambda: calls.append("migrate") or "0007")
    import uvicorn

    monkeypatch.setattr(uvicorn, "run", lambda app, **options: calls.append(f"serve {app} {options['host']}:{options['port']}"))

    serve.main()

    expected = ["serve app.main:app 0.0.0.0:10000"]
    assert calls == (["migrate"] + expected if flag == "true" else expected)


def test_start_command_never_seeds_or_resets() -> None:
    source = serve.__file__
    text = open(source, encoding="utf-8").read()
    code = text.split('"""', 2)[2]  # skip the module docstring, which names the commands it does NOT run
    for forbidden in ("seed_demo_dataset", "app.demo.reset", "app.demo.prepare", "reset(", "dynamic_dataset"):
        assert forbidden not in code
