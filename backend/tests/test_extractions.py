import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.schemas.extraction import DraftFinding
from app.services.ai_extraction import (
    EvidencePayload,
    InvalidModelResponse,
    ProviderError,
    ProviderTimeout,
    extract_drafts,
)
from app.schemas.extraction import CaptureExtractionInput
from app.services.openai_compatible import (
    OpenAICompatibleProvider,
    ProviderSettings,
)


def capture_payload(
    *,
    photo_id: str | None = None,
    mime_type: str = "image/png",
    evidence_type: str = "PHOTO",
) -> dict:
    evidence = []
    if photo_id:
        evidence.append(
            {
                "id": photo_id,
                "type": evidence_type,
                "name": "site.png",
                "mime_type": mime_type,
                "created_at": "2026-10-11T05:00:00Z",
            }
        )
    return {
        "id": str(uuid4()),
        "title": "West entrance",
        "text_note": "Pooling water near the door.",
        "created_at": "2026-10-11T05:00:00Z",
        "location": {"latitude": 47.6, "longitude": -122.3, "accuracy": 8},
        "evidence": evidence,
    }


def draft_payload(evidence_id: str | None = None) -> dict:
    return {
        "findings": [
            {
                "title": "Water pooling near entrance",
                "description": "Water is visible on the ground near the entrance.",
                "category": "Water accumulation",
                "supporting_evidence": [evidence_id] if evidence_id else [],
                "reasoning": "The field note describes pooling water.",
                "uncertainty": "The source and depth of the water are unknown.",
                "confidence": 0.7,
                "suggested_actions": [
                    {
                        "title": "Inspect drainage",
                        "description": "A person may inspect the nearby drainage.",
                    }
                ],
                "safety_concerns": ["The wet surface may be slippery."],
            }
        ]
    }


class FakeProvider:
    name = "test-provider"
    model = "open-weight-vision-test"
    transcription_model: str | None = None

    def __init__(
        self,
        response: str | Exception,
        *,
        transcription_model: str | None = None,
        transcription_response: str | Exception = "A pump is making a rattling sound.",
    ):
        self.response = response
        self.transcription_model = transcription_model
        self.transcription_response = transcription_response
        self.context = ""
        self.images: list[EvidencePayload] = []
        self.transcribed: list[EvidencePayload] = []

    async def analyze(self, context: str, images: list[EvidencePayload]) -> str:
        self.context = context
        self.images = images
        if isinstance(self.response, Exception):
            raise self.response
        return self.response

    async def transcribe(self, audio: EvidencePayload) -> str:
        self.transcribed.append(audio)
        if isinstance(self.transcription_response, Exception):
            raise self.transcription_response
        return self.transcription_response


def post_capture(client: TestClient, capture: dict, file_data: bytes = b"image") :
    files: list[tuple[str, tuple]] = [
        ("capture", (None, json.dumps(capture), "application/json"))
    ]
    for item in capture["evidence"]:
        files.append(
            (
                f"evidence:{item['id']}",
                (item["name"], file_data, item["mime_type"]),
            )
        )
    return client.post("/api/extractions", files=files)


def test_draft_finding_schema_is_explicit_and_validated():
    candidate = draft_payload()["findings"][0]
    assert DraftFinding.model_validate(candidate).status == "AI_DRAFT"

    with pytest.raises(ValidationError):
        DraftFinding.model_validate({**candidate, "confidence": 1.1})
    with pytest.raises(ValidationError):
        DraftFinding.model_validate({**candidate, "untrusted_field": True})


@pytest.mark.anyio
async def test_extraction_rejects_references_not_in_submitted_evidence():
    capture_data = capture_payload(photo_id=str(uuid4()))
    capture = CaptureExtractionInput.model_validate(capture_data)
    provider = FakeProvider(json.dumps(draft_payload(str(uuid4()))))
    payload = capture.evidence[0]

    with pytest.raises(InvalidModelResponse):
        await extract_drafts(
            capture,
            {
                payload.id: EvidencePayload(
                    payload.id, payload.mime_type, b"image", payload.name
                )
            },
            provider,
        )


@pytest.mark.anyio
async def test_audio_is_transcribed_when_available_and_reported_when_not():
    audio_data = capture_payload(
        photo_id=str(uuid4()),
        mime_type="audio/webm",
        evidence_type="AUDIO",
    )
    audio_data["evidence"][0]["name"] = "pump.webm"
    capture = CaptureExtractionInput.model_validate(audio_data)
    item = capture.evidence[0]
    payload = EvidencePayload(item.id, item.mime_type, b"audio", item.name)
    provider = FakeProvider(
        json.dumps(draft_payload(str(item.id))),
        transcription_model="open-weight-whisper",
    )

    result = await extract_drafts(capture, {item.id: payload}, provider)

    assert provider.transcribed == [payload]
    assert "A pump is making a rattling sound." in provider.context
    assert result.findings[0].supporting_evidence == [item.id]
    assert result.limitations == []

    unavailable_provider = FakeProvider(json.dumps({"findings": []}))
    unavailable = await extract_drafts(
        capture, {item.id: payload}, unavailable_provider
    )
    assert unavailable_provider.transcribed == []
    assert "no transcription model is configured" in unavailable.limitations[0]

    failed_provider = FakeProvider(
        json.dumps({"findings": []}),
        transcription_model="open-weight-whisper",
        transcription_response=ProviderError("transcription unavailable"),
    )
    failed = await extract_drafts(capture, {item.id: payload}, failed_provider)
    assert "could not be transcribed" in failed.limitations[0]


def test_extraction_endpoint_returns_validated_drafts_and_traceability(tmp_path):
    capture_data = capture_payload(photo_id=str(uuid4()))
    provider = FakeProvider(
        json.dumps(draft_payload(capture_data["evidence"][0]["id"]))
    )
    app = create_app(tmp_path / "test.db")
    app.state.extraction_provider = provider

    with TestClient(app) as client:
        response = post_capture(client, capture_data)

    assert response.status_code == 200
    body = response.json()
    assert body["capture_id"] == capture_data["id"]
    assert body["status"] == "AI_DRAFT"
    assert body["provider"] == provider.name
    assert body["model"] == provider.model
    assert body["findings"][0]["supporting_evidence"] == [
        capture_data["evidence"][0]["id"]
    ]
    assert str(provider.images[0].evidence_id) == capture_data["evidence"][0]["id"]
    assert "Pooling water near the door." in provider.context
    assert "-122.3" in provider.context


def test_extraction_endpoint_rejects_malformed_provider_output(tmp_path):
    capture_data = capture_payload()
    app = create_app(tmp_path / "test.db")
    app.state.extraction_provider = FakeProvider("not json")

    with TestClient(app) as client:
        response = post_capture(client, capture_data)

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "AI provider returned an invalid structured response"
    )


@pytest.mark.parametrize(
    ("failure", "expected_status"),
    [(ProviderTimeout(), 504), (ProviderError("private provider details"), 502)],
)
def test_extraction_endpoint_handles_provider_failures(
    tmp_path, failure: Exception, expected_status: int
):
    capture_data = capture_payload()
    app = create_app(tmp_path / "test.db")
    app.state.extraction_provider = FakeProvider(failure)

    with TestClient(app) as client:
        response = post_capture(client, capture_data)

    assert response.status_code == expected_status
    assert "private provider details" not in response.text


def test_extraction_endpoint_reports_unsupported_evidence(tmp_path):
    capture_data = capture_payload(
        photo_id=str(uuid4()), mime_type="image/heic"
    )
    provider = FakeProvider(json.dumps({"findings": []}))
    app = create_app(tmp_path / "test.db")
    app.state.extraction_provider = provider

    with TestClient(app) as client:
        response = post_capture(client, capture_data)

    assert response.status_code == 200
    assert response.json()["findings"] == []
    assert "was not analyzed" in response.json()["limitations"][0]
    assert provider.images == []


def test_extraction_endpoint_requires_uploaded_files_to_match_capture(tmp_path):
    capture_data = capture_payload(photo_id=str(uuid4()))
    app = create_app(tmp_path / "test.db")
    app.state.extraction_provider = FakeProvider(json.dumps({"findings": []}))

    with TestClient(app) as client:
        response = client.post(
            "/api/extractions",
            files=[
                ("capture", (None, json.dumps(capture_data), "application/json"))
            ],
        )

    assert response.status_code == 422


def test_extraction_requires_a_note_or_media(tmp_path):
    capture_data = capture_payload()
    capture_data["text_note"] = "  "
    app = create_app(tmp_path / "test.db")
    app.state.extraction_provider = FakeProvider(json.dumps({"findings": []}))

    with TestClient(app) as client:
        response = post_capture(client, capture_data)

    assert response.status_code == 422


def test_extraction_endpoint_reports_missing_provider_configuration(
    tmp_path, monkeypatch
):
    monkeypatch.delenv("FIELD_NOTE_AI_API_KEY", raising=False)
    monkeypatch.delenv("FIELD_NOTE_AI_MODEL", raising=False)
    app = create_app(tmp_path / "test.db")

    with TestClient(app) as client:
        response = post_capture(client, capture_payload())

    assert response.status_code == 503
    assert response.json()["detail"] == "AI extraction is not configured on this server"


@pytest.mark.anyio
async def test_provider_sends_images_and_uses_only_backend_credentials(monkeypatch):
    captured: dict = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": '{"findings":[]}'}}]}

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, headers, **kwargs):
            captured.update(url=url, headers=headers, payload=kwargs["json"])
            return FakeResponse()

    monkeypatch.setattr("app.services.openai_compatible.httpx.AsyncClient", FakeClient)
    provider = OpenAICompatibleProvider(
        ProviderSettings(
            api_key="server-secret",
            base_url="https://model.example/v1",
            model="open-weight-vision",
            transcription_model=None,
            timeout_seconds=12,
            provider_name="test",
        )
    )
    image = EvidencePayload(uuid4(), "image/png", b"png", "evidence.png")

    result = await provider.analyze("capture context", [image])

    assert result == '{"findings":[]}'
    assert captured["url"] == "https://model.example/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer server-secret"
    assert "not instructions" in captured["payload"]["messages"][0]["content"]
    content = captured["payload"]["messages"][1]["content"]
    assert str(image.evidence_id) in content[1]["text"]
    image_part = content[2]
    assert image_part["image_url"]["url"].startswith("data:image/png;base64,")


@pytest.mark.anyio
async def test_provider_timeout_is_reported(monkeypatch):
    class FakeClient:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, *args, **kwargs):
            import httpx

            request = httpx.Request("POST", "https://model.example")
            raise httpx.ReadTimeout("timed out", request=request)

    monkeypatch.setattr("app.services.openai_compatible.httpx.AsyncClient", FakeClient)
    provider = OpenAICompatibleProvider(
        ProviderSettings("secret", "https://model.example/v1", "model", None, 1, "test")
    )

    with pytest.raises(ProviderTimeout):
        await provider.analyze("context", [])
