import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import Settings, app


def test_secret_required(monkeypatch):
    monkeypatch.delenv("DOCUMENT_PROCESSOR_SECRET", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_health_requires_internal_auth(monkeypatch):
    monkeypatch.setenv("DOCUMENT_PROCESSOR_SECRET", "a" * 32)
    with TestClient(app) as client:
        assert client.get("/health").status_code == 401
        response = client.get("/health", headers={"x-service-secret": "a" * 32})
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "healthy"
