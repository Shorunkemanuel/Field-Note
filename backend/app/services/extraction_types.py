from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class EvidencePayload:
    evidence_id: UUID
    mime_type: str
    data: bytes
    filename: str
