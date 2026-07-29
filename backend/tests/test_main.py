from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_select_folder(monkeypatch) -> None:
    monkeypatch.setattr("app.main.select_folder_path", lambda: "/tmp/media")

    response = client.post("/api/system/select-folder")

    assert response.status_code == 200
    assert response.json() == {"path": "/tmp/media"}
