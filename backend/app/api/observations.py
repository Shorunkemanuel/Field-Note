from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, status

from app import database
from app.schemas.observation import (
    EvidenceCreate,
    EvidenceResponse,
    FindingCreate,
    FindingResponse,
    ObservationCreate,
    ObservationResponse,
)

router = APIRouter(prefix="/api/observations", tags=["observations"])


def _database_path(request: Request):
    return request.app.state.database_path


@router.post(
    "",
    response_model=ObservationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_observation(
    payload: ObservationCreate, request: Request
) -> ObservationResponse:
    observation = database.create_observation(payload, _database_path(request))
    return ObservationResponse(**observation)


@router.get("", response_model=list[ObservationResponse])
def list_observations(request: Request) -> list[ObservationResponse]:
    return [
        ObservationResponse(**observation)
        for observation in database.list_observations(_database_path(request))
    ]


@router.get("/{observation_id}", response_model=ObservationResponse)
def get_observation(observation_id: UUID, request: Request) -> ObservationResponse:
    observation = database.get_observation(str(observation_id), _database_path(request))
    if observation is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    return ObservationResponse(**observation)


@router.post(
    "/{observation_id}/evidence",
    response_model=EvidenceResponse,
    status_code=status.HTTP_201_CREATED,
)
def attach_evidence(
    observation_id: UUID, payload: EvidenceCreate, request: Request
) -> EvidenceResponse:
    evidence = database.add_evidence(
        str(observation_id), payload, _database_path(request)
    )
    if evidence is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    return EvidenceResponse(**evidence)


@router.post(
    "/{observation_id}/findings",
    response_model=FindingResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_finding(
    observation_id: UUID, payload: FindingCreate, request: Request
) -> FindingResponse:
    finding = database.add_finding(
        str(observation_id), payload, _database_path(request)
    )
    if finding is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    return FindingResponse(**finding)
