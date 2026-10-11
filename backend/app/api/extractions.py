from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError
from starlette.datastructures import UploadFile

from app.schemas.extraction import CaptureExtractionInput, ExtractionResponse
from app.services.ai_extraction import (
    InvalidModelResponse,
    ProviderError,
    ProviderNotConfigured,
    ProviderTimeout,
    extract_drafts,
)
from app.services.extraction_types import EvidencePayload

router = APIRouter(prefix="/api/extractions", tags=["AI extraction"])

MAX_EVIDENCE_COUNT = 10
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_TOTAL_BYTES = 20 * 1024 * 1024


@router.post("", response_model=ExtractionResponse)
async def extract_capture(request: Request) -> ExtractionResponse:
    async with request.form(
        max_files=MAX_EVIDENCE_COUNT, max_fields=1, max_part_size=MAX_TOTAL_BYTES
    ) as form:
        capture_fields: list[str] = []
        file_parts: dict[UUID, UploadFile] = {}
        for name, value in form.multi_items():
            if name == "capture" and isinstance(value, str):
                capture_fields.append(value)
            elif name.startswith("evidence:") and isinstance(value, UploadFile):
                try:
                    evidence_id = UUID(name.removeprefix("evidence:"))
                except ValueError as error:
                    raise HTTPException(
                        status_code=422, detail="Invalid evidence file field"
                    ) from error
                if evidence_id in file_parts:
                    raise HTTPException(
                        status_code=422, detail="Duplicate evidence file"
                    )
                file_parts[evidence_id] = value
            else:
                raise HTTPException(
                    status_code=422, detail="Unexpected extraction request field"
                )

        if len(capture_fields) != 1:
            raise HTTPException(
                status_code=422, detail="Exactly one capture field is required"
            )
        try:
            capture = CaptureExtractionInput.model_validate_json(capture_fields[0])
        except (ValidationError, ValueError) as error:
            raise HTTPException(
                status_code=422, detail="Invalid capture metadata"
            ) from error

        expected_ids = {item.id for item in capture.evidence}
        if set(file_parts) != expected_ids:
            raise HTTPException(
                status_code=422,
                detail="Uploaded files must match the capture evidence",
            )

        payloads: dict[UUID, EvidencePayload] = {}
        total_bytes = 0
        for item in capture.evidence:
            upload = file_parts[item.id]
            actual_mime_type = (upload.content_type or "").split(";", 1)[0].lower()
            declared_mime_type = item.mime_type.split(";", 1)[0].lower()
            if actual_mime_type and actual_mime_type != declared_mime_type:
                raise HTTPException(
                    status_code=422,
                    detail=f"File type does not match evidence {item.id}",
                )
            data = await upload.read(MAX_FILE_BYTES + 1)
            if not data:
                raise HTTPException(
                    status_code=422, detail=f"Evidence file {item.name} is empty"
                )
            if len(data) > MAX_FILE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"Evidence file {item.name} exceeds the 10 MB limit",
                )
            total_bytes += len(data)
            if total_bytes > MAX_TOTAL_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail="Total evidence exceeds the 20 MB request limit",
                )
            payloads[item.id] = EvidencePayload(
                evidence_id=item.id,
                mime_type=declared_mime_type,
                data=data,
                filename=item.name,
            )

        try:
            return await extract_drafts(
                capture,
                payloads,
                getattr(request.app.state, "extraction_provider", None),
            )
        except ProviderNotConfigured as error:
            raise HTTPException(
                status_code=503,
                detail="AI extraction is not configured on this server",
            ) from error
        except ProviderTimeout as error:
            raise HTTPException(
                status_code=504, detail="AI provider request timed out"
            ) from error
        except InvalidModelResponse as error:
            raise HTTPException(
                status_code=502,
                detail="AI provider returned an invalid structured response",
            ) from error
        except ProviderError as error:
            raise HTTPException(
                status_code=502,
                detail="AI provider could not complete the extraction",
            ) from error
