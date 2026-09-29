"""
Read-only data API contract over the fully seeded synthetic dataset.

Runs on SQLite here and, via tests/integration/test_api_postgres.py, on
PostgreSQL with the same test bodies.
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.seed import DATASET_PATH

OBSERVATIONS_TOTAL = 699


def get_json(client: TestClient, url: str, expected_status: int = 200):
    response = client.get(url)
    assert response.status_code == expected_status, response.text
    return response.json()


# --- facilities --------------------------------------------------------------


def test_list_facilities(seeded_client: TestClient) -> None:
    facilities = get_json(seeded_client, "/api/facilities")

    assert [(f["facility_code"], f["name"], f["vendor"], f["postal_code"]) for f in facilities] == [
        ("HOSP-A", "Worcester Central Medical Center", "Epic", "01604"),
        ("HOSP-B", "Central Massachusetts Regional Hospital", "Oracle Health", "01605"),
        ("HOSP-C", "Shrewsbury Community Medical Center", "MEDITECH", "01545"),
    ]
    assert {f["subregion"] for f in facilities} == {"Worcester County"}
    assert {(f["region"], f["country_code"], f["active"]) for f in facilities} == {("MA", "US", True)}


def test_get_facility(seeded_client: TestClient) -> None:
    first = get_json(seeded_client, "/api/facilities")[0]

    assert get_json(seeded_client, f"/api/facilities/{first['id']}") == first


def test_unknown_facility_is_404(seeded_client: TestClient) -> None:
    assert get_json(seeded_client, "/api/facilities/999999", 404) == {"detail": "Facility not found."}


# --- observations ------------------------------------------------------------


def test_observations_are_paged_by_default(seeded_client: TestClient) -> None:
    page = get_json(seeded_client, "/api/observations")

    assert page["total"] == OBSERVATIONS_TOTAL
    assert (page["limit"], page["offset"]) == (100, 0)
    assert len(page["items"]) == 100
    first = page["items"][0]
    assert first["source_observation_id"] == "OBS-0001"
    assert first["effective_datetime"] == "2025-11-03T06:00:00-05:00"
    assert first["received_datetime"] is None
    assert first["patient_reference"] == "SYN-P0001"
    assert first["source_system"] == "Simulated Epic Environment"
    assert (first["result_type"], first["result_value"]) == ("coded", "Negative")


def test_observation_pagination_walks_the_whole_dataset(seeded_client: TestClient) -> None:
    seen: list[str] = []
    offset = 0
    while True:
        page = get_json(seeded_client, f"/api/observations?limit=500&offset={offset}")
        seen += [o["source_observation_id"] for o in page["items"]]
        offset += page["limit"]
        if offset >= page["total"]:
            break

    assert len(seen) == OBSERVATIONS_TOTAL
    assert len(set(seen)) == OBSERVATIONS_TOTAL
    assert get_json(seeded_client, "/api/observations?offset=699")["items"] == []


@pytest.mark.parametrize(
    ("query", "total"),
    [
        ("day=1", 100),
        ("day=5", 176),
        ("result=Positive", 99),
        ("result=Negative", 600),
        ("day=5&result=Positive", 34),
        ("loinc_code=92142-9", 234),
        ("loinc_code=00000-0", 0),
    ],
)
def test_observation_filters(seeded_client: TestClient, query: str, total: int) -> None:
    assert get_json(seeded_client, f"/api/observations?{query}")["total"] == total


def test_observations_filter_by_facility(seeded_client: TestClient) -> None:
    facilities = {f["facility_code"]: f["id"] for f in get_json(seeded_client, "/api/facilities")}
    page = get_json(seeded_client, f"/api/observations?facility_id={facilities['HOSP-C']}&limit=500")

    assert page["total"] == 174
    assert {o["geographic_unit"] for o in page["items"]} == {"01545"}


def test_day_filter_stays_inside_the_local_day(seeded_client: TestClient) -> None:
    page = get_json(seeded_client, "/api/observations?day=2&limit=500")

    assert {o["effective_datetime"][:10] for o in page["items"]} == {"2025-11-04"}


@pytest.mark.parametrize(
    "query",
    ["day=0", "day=6", "limit=0", "limit=501", "offset=-1", "result=positive", "day=abc"],
)
def test_invalid_observation_queries_are_rejected(seeded_client: TestClient, query: str) -> None:
    assert seeded_client.get(f"/api/observations?{query}").status_code == 422


# Expected values for the Phase 3 query parameters are derived from the
# committed frontend export, applying the prototype's own browser-side rules.
_RAW = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
_FACILITY = {f["code"]: f for f in _RAW["facilities"]}


def _search_blob(o: dict) -> str:
    f = _FACILITY[o["facilityCode"]]
    return " ".join(
        [o["id"], o["patientReference"], f["name"], f["vendor"], o["testName"],
         o["loincCode"], o["zipCode"], o["result"]]
    ).lower()


def _expected(predicate) -> list[str]:
    return [o["id"] for o in _RAW["observations"] if predicate(o)]


@pytest.mark.parametrize(
    ("query", "predicate"),
    [
        ("through_day=3", lambda o: o["day"] <= 3),
        ("day=2&through_day=3", lambda o: o["day"] == 2),
        ("day=4&through_day=3", lambda o: False),
        ("vendor=Epic", lambda o: _FACILITY[o["facilityCode"]]["vendor"] == "Epic"),
        ("vendor=Unknown", lambda o: False),
        ("q=SYN-P0001", lambda o: "syn-p0001" in _search_blob(o)),
        ("q=meditech", lambda o: "meditech" in _search_blob(o)),
        ("q=01545", lambda o: "01545" in _search_blob(o)),
        # A term spanning two fields matches, as in the browser search.
        ("q=epic%20sars", lambda o: "epic sars" in _search_blob(o)),
        # LIKE wildcards are matched literally.
        ("q=%25", lambda o: "%" in _search_blob(o)),
        ("q=_", lambda o: "_" in _search_blob(o)),
        ("through_day=5&vendor=MEDITECH&result=Positive&q=rsv",
         lambda o: _FACILITY[o["facilityCode"]]["vendor"] == "MEDITECH"
         and o["result"] == "Positive" and "rsv" in _search_blob(o)),
    ],
)
def test_phase3_observation_filters(seeded_client: TestClient, query: str, predicate) -> None:
    page = get_json(seeded_client, f"/api/observations?{query}&limit=500")

    assert page["total"] == len(_expected(predicate))
    assert sorted(o["source_observation_id"] for o in page["items"]) == sorted(_expected(predicate))


def _sort_value(o: dict, key: str) -> str:
    f = _FACILITY[o["facilityCode"]]
    return {
        "effective_datetime": o["effectiveDateTime"],
        "facility_name": f["name"],
        "vendor": f["vendor"],
        "patient_reference": o["patientReference"],
        "result": o["result"],
        "test_name": o["testName"],
    }[key]


@pytest.mark.parametrize(
    "sort", ["effective_datetime", "facility_name", "vendor", "patient_reference", "result", "test_name"]
)
@pytest.mark.parametrize("order", ["asc", "desc"])
def test_observation_sorting_keeps_source_order_on_ties(
    seeded_client: TestClient, sort: str, order: str
) -> None:
    page = get_json(seeded_client, f"/api/observations?through_day=2&sort={sort}&order={order}&limit=500")

    # The browser's stable sort: values in the requested direction, and rows
    # with equal values kept in source order (ascending) either way.
    groups: dict[str, list[str]] = {}
    for o in (o for o in _RAW["observations"] if o["day"] <= 2):
        groups.setdefault(_sort_value(o, sort), []).append(o["id"])
    expected = [i for value in sorted(groups, reverse=order == "desc") for i in groups[value]]

    assert [o["source_observation_id"] for o in page["items"]] == expected


@pytest.mark.parametrize("query", ["sort=hospital", "order=up", "through_day=0", "through_day=6", "q=" + "x" * 101])
def test_invalid_phase3_queries_are_rejected(seeded_client: TestClient, query: str) -> None:
    assert seeded_client.get(f"/api/observations?{query}").status_code == 422


def test_demo_days_lists_the_whole_storyline(seeded_client: TestClient) -> None:
    days = get_json(seeded_client, "/api/demo/days")

    assert [d["day"] for d in days] == [1, 2, 3, 4, 5]
    assert [d["stage"] for d in days] == [d["stage"] for d in _RAW["days"]]
    for day in days:
        assert day == get_json(seeded_client, f"/api/demo/summary?day={day['day']}")


def test_get_observation_and_404(seeded_client: TestClient) -> None:
    first = get_json(seeded_client, "/api/observations?limit=1")["items"][0]

    assert get_json(seeded_client, f"/api/observations/{first['id']}") == first
    assert get_json(seeded_client, "/api/observations/99999999", 404) == {
        "detail": "Observation not found."
    }


# --- signals -----------------------------------------------------------------

EXPECTED_SIGNALS = [
    # date, tests, positives, positivity, facilities, geographies, persistence, score, severity, confidence
    ("2025-11-03", 100, 8, 8.0, 0, [], 0, 0.0, "Low", 98.0),
    ("2025-11-04", 124, 12, 9.68, 1, ["01604"], 1, 24.0, "Watch", 97.0),
    ("2025-11-05", 141, 19, 13.48, 2, ["01604", "01605"], 2, 50.0, "Moderate", 94.0),
    ("2025-11-06", 158, 26, 16.46, 3, ["01604", "01605", "01545"], 3, 74.0, "High", 97.0),
    ("2025-11-07", 176, 34, 19.32, 3, ["01604", "01605", "01545"], 4, 87.0, "Critical", 97.0),
]


def signal_tuple(s: dict) -> tuple:
    return (
        s["signal_date"],
        s["test_volume"],
        s["positive_count"],
        s["positivity_rate"],
        s["affected_facilities"],
        s["affected_geographies"],
        s["persistence_days"],
        s["composite_score"],
        s["severity"],
        s["data_confidence_score"],
    )


def test_signal_history_in_date_order(seeded_client: TestClient) -> None:
    signals = get_json(seeded_client, "/api/signals")

    assert [signal_tuple(s) for s in signals] == EXPECTED_SIGNALS
    assert {s["data_confidence_level"] for s in signals} == {"Very High"}
    assert {(s["baseline_volume"], s["baseline_positivity_rate"]) for s in signals} == {(100.0, 8.0)}
    assert {s["status"] for s in signals} == {"NEW"}


@pytest.mark.parametrize("day", [1, 5])
def test_current_signal_for_day(seeded_client: TestClient, day: int) -> None:
    signal = get_json(seeded_client, f"/api/signals/current?day={day}")

    assert signal_tuple(signal) == EXPECTED_SIGNALS[day - 1]


@pytest.mark.parametrize("query", ["", "?day=0", "?day=6", "?day=one"])
def test_current_signal_rejects_invalid_day(seeded_client: TestClient, query: str) -> None:
    assert seeded_client.get(f"/api/signals/current{query}").status_code == 422


def test_get_signal_and_404(seeded_client: TestClient) -> None:
    last = get_json(seeded_client, "/api/signals/current?day=5")

    assert get_json(seeded_client, f"/api/signals/{last['id']}") == last
    assert get_json(seeded_client, "/api/signals/999999", 404) == {"detail": "Signal not found."}


# --- demo summary ------------------------------------------------------------


def test_demo_summary_day_1(seeded_client: TestClient) -> None:
    summary = get_json(seeded_client, "/api/demo/summary?day=1")

    assert {k: summary[k] for k in (
        "day", "simulation_date", "stage", "test_volume", "positive_count", "negative_count",
        "positivity_rate", "affected_facilities", "affected_geographies", "persistence_days",
        "composite_score", "severity", "data_confidence_score", "data_confidence_level",
    )} == {
        "day": 1,
        "simulation_date": "2025-11-03",
        "stage": "Baseline",
        "test_volume": 100,
        "positive_count": 8,
        "negative_count": 92,
        "positivity_rate": 8.0,
        "affected_facilities": 0,
        "affected_geographies": [],
        "persistence_days": 0,
        "composite_score": 0.0,
        "severity": "Low",
        "data_confidence_score": 98.0,
        "data_confidence_level": "Very High",
    }
    assert "Synthetic" in summary["notice"]


def test_demo_summary_day_5(seeded_client: TestClient) -> None:
    summary = get_json(seeded_client, "/api/demo/summary?day=5")

    assert summary["stage"] == "Regional Early-Warning Signal"
    assert (summary["test_volume"], summary["positive_count"], summary["negative_count"]) == (176, 34, 142)
    assert (summary["composite_score"], summary["severity"]) == (87.0, "Critical")
    assert summary["affected_geographies"] == ["01604", "01605", "01545"]
    assert summary["persistence_days"] == 4
    assert summary["signal_id"] == get_json(seeded_client, "/api/signals/current?day=5")["id"]


@pytest.mark.parametrize("query", ["", "?day=0", "?day=6"])
def test_demo_summary_rejects_invalid_day(seeded_client: TestClient, query: str) -> None:
    assert seeded_client.get(f"/api/demo/summary{query}").status_code == 422


# --- read-only ---------------------------------------------------------------


@pytest.mark.parametrize(
    "path", ["/api/facilities", "/api/observations", "/api/signals", "/api/facilities/1"]
)
@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_data_api_is_read_only(seeded_client: TestClient, method: str, path: str) -> None:
    assert getattr(seeded_client, method)(path).status_code == 405
