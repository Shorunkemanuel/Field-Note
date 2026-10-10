from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ObservationStatus(str, Enum):
    DRAFT = "DRAFT"
    REVIEW = "REVIEW"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"


class EvidenceType(str, Enum):
    PHOTO = "PHOTO"
    AUDIO = "AUDIO"
    TEXT = "TEXT"


class FindingStatus(str, Enum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"


class CreateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class EvidenceCreate(CreateSchema):
    type: EvidenceType
    uri: str = Field(min_length=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class EvidenceResponse(EvidenceCreate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    observation_id: UUID
    created_at: datetime


class FindingCreate(CreateSchema):
    category: str = Field(min_length=1)
    observation: str = Field(min_length=1)
    issue: str = Field(min_length=1)
    suggested_action: str = Field(min_length=1)
    confidence: float | None = Field(default=None, ge=0, le=1)
    status: FindingStatus = FindingStatus.DRAFT


class FindingResponse(FindingCreate):
    id: UUID
    observation_id: UUID
    created_at: datetime


class ObservationCreate(CreateSchema):
    title: str = Field(min_length=1, max_length=200)
    text_note: str = ""
    status: ObservationStatus = ObservationStatus.DRAFT


class ObservationResponse(ObservationCreate):
    id: UUID
    created_at: datetime
    evidence: list[EvidenceResponse] = Field(default_factory=list)
    findings: list[FindingResponse] = Field(default_factory=list)
