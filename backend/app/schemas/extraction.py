from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ExtractionLocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: float = Field(ge=0)


class ExtractionEvidenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: UUID
    type: Literal["PHOTO", "AUDIO"]
    name: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=100)
    created_at: datetime


class CaptureExtractionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: UUID
    title: str = Field(min_length=1, max_length=200)
    text_note: str = Field(max_length=10_000)
    created_at: datetime
    location: ExtractionLocation | None = None
    evidence: list[ExtractionEvidenceInput] = Field(max_length=10)

    @field_validator("evidence")
    @classmethod
    def evidence_ids_are_unique(
        cls, evidence: list[ExtractionEvidenceInput]
    ) -> list[ExtractionEvidenceInput]:
        ids = [item.id for item in evidence]
        if len(ids) != len(set(ids)):
            raise ValueError("Evidence IDs must be unique")
        return evidence

    @model_validator(mode="after")
    def has_analyzable_content(self) -> "CaptureExtractionInput":
        if not self.text_note and not self.evidence:
            raise ValueError("A note or evidence is required for extraction")
        return self


class SuggestedAction(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2_000)


class DraftFinding(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    status: Literal["AI_DRAFT"] = "AI_DRAFT"
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4_000)
    category: str = Field(min_length=1, max_length=100)
    supporting_evidence: list[UUID] = Field(max_length=10)
    reasoning: str = Field(min_length=1, max_length=4_000)
    uncertainty: str = Field(min_length=1, max_length=2_000)
    confidence: float | None = Field(default=None, ge=0, le=1)
    suggested_actions: list[SuggestedAction] = Field(max_length=10)
    safety_concerns: list[Annotated[str, Field(min_length=1, max_length=500)]] = Field(
        max_length=10
    )


class DraftFindings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    findings: list[DraftFinding] = Field(max_length=20)


class ExtractionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    capture_id: UUID
    status: Literal["AI_DRAFT"] = "AI_DRAFT"
    findings: list[DraftFinding]
    limitations: list[str]
    provider: str
    model: str
