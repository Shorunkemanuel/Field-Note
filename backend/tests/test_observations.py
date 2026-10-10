from fastapi.testclient import TestClient

from app.database import initialize_database
from app.main import create_app


def test_database_initializes(tmp_path):
    database_path = tmp_path / "test.db"

    initialize_database(database_path)

    assert database_path.exists()
    from app.database import connect

    with connect(database_path) as connection:
        table_names = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    assert {"observations", "evidence", "findings"} <= table_names


def test_observation_and_related_records_persist(tmp_path):
    database_path = tmp_path / "test.db"
    app = create_app(database_path)
    with TestClient(app) as client:
        created = client.post(
            "/api/observations",
            json={"title": "Cracked paving", "text_note": "Crack near north gate"},
        )
        assert created.status_code == 201
        observation = created.json()
        observation_id = observation["id"]
        assert observation["status"] == "DRAFT"

        retrieved = client.get(f"/api/observations/{observation_id}")
        assert retrieved.status_code == 200
        assert retrieved.json()["title"] == "Cracked paving"
        assert retrieved.json()["text_note"] == "Crack near north gate"
        assert retrieved.json()["evidence"] == []
        assert retrieved.json()["findings"] == []

        evidence_response = client.post(
            f"/api/observations/{observation_id}/evidence",
            json={
                "type": "PHOTO",
                "uri": "local://placeholder/north-gate.jpg",
                "metadata": {"caption": "North gate"},
            },
        )
        assert evidence_response.status_code == 201
        assert evidence_response.json()["metadata"] == {"caption": "North gate"}

        finding_response = client.post(
            f"/api/observations/{observation_id}/findings",
            json={
                "category": "Surface condition",
                "observation": "A crack is present near the north gate.",
                "issue": "The cracked paving may present a trip hazard.",
                "suggested_action": "Inspect and repair the paving.",
                "confidence": 0.8,
            },
        )
        assert finding_response.status_code == 201
        assert finding_response.json()["status"] == "DRAFT"

        detail = client.get(f"/api/observations/{observation_id}")
        assert detail.status_code == 200
        assert len(detail.json()["evidence"]) == 1
        assert detail.json()["evidence"][0]["uri"] == "local://placeholder/north-gate.jpg"
        assert len(detail.json()["findings"]) == 1
        assert detail.json()["findings"][0]["suggested_action"] == (
            "Inspect and repair the paving."
        )

        listed = client.get("/api/observations")
        assert listed.status_code == 200
        assert [item["id"] for item in listed.json()] == [observation_id]

    with TestClient(create_app(database_path)) as client:
        persisted = client.get(f"/api/observations/{observation_id}")
        assert persisted.status_code == 200
        assert len(persisted.json()["evidence"]) == 1
        assert len(persisted.json()["findings"]) == 1


def test_empty_observation_list_and_invalid_input(tmp_path):
    app = create_app(tmp_path / "test.db")
    with TestClient(app) as client:
        assert client.get("/api/observations").json() == []
        assert client.get("/api/observations/not-a-uuid").status_code == 422

        blank_title = client.post(
            "/api/observations", json={"title": "   ", "text_note": ""}
        )
        assert blank_title.status_code == 422
        assert client.post(
            "/api/observations", json={"title": "Valid", "status": "UNKNOWN"}
        ).status_code == 422
        assert client.post(
            "/api/observations",
            json={
                "title": "Valid",
                "unexpected": "value",
            },
        ).status_code == 422


def test_related_records_require_existing_observation(tmp_path):
    app = create_app(tmp_path / "test.db")
    with TestClient(app) as client:
        missing_id = "00000000-0000-0000-0000-000000000000"
        response = client.get(f"/api/observations/{missing_id}")
        assert response.status_code == 404
        evidence_response = client.post(
            f"/api/observations/{missing_id}/evidence",
            json={"type": "TEXT", "uri": "local://note.txt"},
        )
        assert evidence_response.status_code == 404
        finding_response = client.post(
            f"/api/observations/{missing_id}/findings",
            json={
                "category": "Surface condition",
                "observation": "A crack is present.",
                "issue": "Potential trip hazard.",
                "suggested_action": "Inspect the area.",
            },
        )
        assert finding_response.status_code == 404
