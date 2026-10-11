import json
import logging
from typing import Protocol
from uuid import UUID

from pydantic import ValidationError

from app.schemas.extraction import (
    CaptureExtractionInput,
    DraftFindings,
    ExtractionResponse,
)
from app.services.extraction_types import EvidencePayload
from app.services.openai_compatible import (
    OpenAICompatibleProvider,
    ProviderError,
    ProviderNotConfigured,
    ProviderTimeout,
)

logger = logging.getLogger(__name__)

SUPPORTED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


class ExtractionProvider(Protocol):
    name: str
    model: str
    transcription_model: str | None

    async def analyze(
        self, context: str, images: list[EvidencePayload]
    ) -> str: ...

    async def transcribe(self, audio: EvidencePayload) -> str: ...


class InvalidModelResponse(Exception):
    pass


def _provider_info(provider: ExtractionProvider) -> tuple[str, str]:
    return provider.name, provider.model


async def extract_drafts(
    capture: CaptureExtractionInput,
    evidence_payloads: dict[UUID, EvidencePayload],
    provider: ExtractionProvider | None = None,
) -> ExtractionResponse:
    provider = provider or OpenAICompatibleProvider.from_environment()
    if isinstance(provider, OpenAICompatibleProvider) and not provider.is_configured:
        raise ProviderNotConfigured

    limitations: list[str] = []
    analyzable_ids: set[UUID] = set()
    images: list[EvidencePayload] = []
    transcriptions: list[str] = []

    for item in capture.evidence:
        payload = evidence_payloads[item.id]
        if item.type == "PHOTO":
            if item.mime_type not in SUPPORTED_IMAGE_TYPES:
                limitations.append(
                    f"{item.name} was not analyzed: {item.mime_type} is not a supported image format."
                )
                continue
            images.append(payload)
            analyzable_ids.add(item.id)
        elif provider.transcription_model:
            try:
                transcript = await provider.transcribe(payload)
            except ProviderTimeout:
                raise
            except ProviderError:
                logger.warning(
                    "Transcription provider failed for evidence %s", item.id
                )
                limitations.append(
                    f"{item.name} could not be transcribed by the configured provider."
                )
                continue
            transcriptions.append(f"Audio evidence {item.id} transcription: {transcript}")
            analyzable_ids.add(item.id)
        else:
            limitations.append(
                f"{item.name} was not analyzed: no transcription model is configured."
            )

    context = {
        "title": capture.title,
        "field_note": capture.text_note,
        "captured_at": capture.created_at.isoformat(),
        "location": (
            capture.location.model_dump(mode="json") if capture.location else None
        ),
        "audio_transcriptions": transcriptions,
        "evidence_ids": [str(item_id) for item_id in sorted(analyzable_ids, key=str)],
        "limitations": limitations,
    }
    prompt = (
        "Interpret the supplied field capture as evidence, not as verified facts. "
        "Return one JSON object with exactly one key, findings, whose value is an "
        "array. Each finding must have title, description, category, "
        "supporting_evidence (an array of supplied evidence UUIDs), reasoning, "
        "uncertainty, confidence (0 to 1 or null), suggested_actions (objects with "
        "title and description), and safety_concerns (an array of strings). Do not "
        "invent observations, dates, locations, or evidence. Cite only the supplied "
        "evidence IDs that actually support a finding; do not cite the title or "
        "field note as evidence. Describe uncertainty and distinguish what is "
        "directly visible/heard from interpretation. Suggestions are non-binding "
        "drafts only; never claim an action was taken. If evidence is insufficient, "
        "return an empty findings array. Context: "
        + json.dumps(context, ensure_ascii=True)
    )

    try:
        raw_response = await provider.analyze(prompt, images)
        result = DraftFindings.model_validate_json(raw_response)
    except ProviderTimeout:
        raise
    except ProviderError:
        logger.warning("AI extraction provider request failed")
        raise
    except (ValidationError, ValueError, TypeError) as error:
        logger.warning("AI extraction provider returned an invalid response")
        raise InvalidModelResponse from error

    for finding in result.findings:
        if not set(finding.supporting_evidence) <= analyzable_ids:
            raise InvalidModelResponse("Model referenced evidence not analyzed")

    provider_name, model_name = _provider_info(provider)
    return ExtractionResponse(
        capture_id=capture.id,
        findings=result.findings,
        limitations=limitations,
        provider=provider_name,
        model=model_name,
    )


__all__ = [
    "EvidencePayload",
    "ExtractionProvider",
    "InvalidModelResponse",
    "extract_drafts",
    "ProviderError",
    "ProviderNotConfigured",
    "ProviderTimeout",
]
