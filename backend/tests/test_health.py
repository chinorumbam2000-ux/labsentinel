from fastapi.testclient import TestClient

from app import __version__


def test_health_reports_service_and_version(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "service": "LabSentinel API",
        "version": __version__,
    }
    assert __version__ == "0.1.0"


def test_health_does_not_need_a_database(client: TestClient) -> None:
    # The default DATABASE_URL points at a PostgreSQL that is not running in
    # the test environment; liveness must still answer.
    assert client.get("/api/health").status_code == 200


def test_cors_allows_the_vite_dev_origin(client: TestClient) -> None:
    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_does_not_allow_unknown_origins(client: TestClient) -> None:
    response = client.get("/api/health", headers={"Origin": "https://example.com"})

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_openapi_docs_are_served(client: TestClient) -> None:
    assert client.get("/docs").status_code == 200
    paths = client.get("/openapi.json").json()["paths"]
    assert {"/api/health", "/api/health/database"} <= set(paths)
