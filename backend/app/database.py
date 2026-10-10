import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4

from app.schemas.observation import (
    EvidenceCreate,
    FindingCreate,
    ObservationCreate,
)


DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[2] / "data" / "field_note.db"


def resolve_database_path(database_path: str | Path | None = None) -> Path:
    configured_path = database_path or os.getenv(
        "FIELD_NOTE_DATABASE_PATH", str(DEFAULT_DATABASE_PATH)
    )
    return Path(configured_path).expanduser().resolve()


@contextmanager
def connect(database_path: str | Path | None = None) -> Iterator[sqlite3.Connection]:
    path = resolve_database_path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database(database_path: str | Path | None = None) -> None:
    with connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS observations (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                title TEXT NOT NULL,
                text_note TEXT NOT NULL,
                status TEXT NOT NULL CHECK (
                    status IN ('DRAFT', 'REVIEW', 'CONFIRMED', 'REJECTED')
                )
            );

            CREATE TABLE IF NOT EXISTS evidence (
                id TEXT PRIMARY KEY,
                observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
                type TEXT NOT NULL CHECK (type IN ('PHOTO', 'AUDIO', 'TEXT')),
                uri TEXT NOT NULL,
                created_at TEXT NOT NULL,
                metadata TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS findings (
                id TEXT PRIMARY KEY,
                observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
                category TEXT NOT NULL,
                observation TEXT NOT NULL,
                issue TEXT NOT NULL,
                suggested_action TEXT NOT NULL,
                confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
                status TEXT NOT NULL CHECK (status IN ('DRAFT', 'CONFIRMED', 'REJECTED')),
                created_at TEXT NOT NULL
            );
            """
        )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_observation(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "title": row["title"],
        "text_note": row["text_note"],
        "status": row["status"],
    }


def _to_evidence(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "observation_id": row["observation_id"],
        "type": row["type"],
        "uri": row["uri"],
        "created_at": row["created_at"],
        "metadata": json.loads(row["metadata"]),
    }


def _to_finding(row: sqlite3.Row) -> dict[str, Any]:
    return dict(row)


def create_observation(
    observation: ObservationCreate, database_path: str | Path | None = None
) -> dict[str, Any]:
    result = {
        "id": str(uuid4()),
        "created_at": _now(),
        **observation.model_dump(mode="json"),
    }
    with connect(database_path) as connection:
        connection.execute(
            "INSERT INTO observations (id, created_at, title, text_note, status) "
            "VALUES (:id, :created_at, :title, :text_note, :status)",
            result,
        )
    return result


def list_observations(database_path: str | Path | None = None) -> list[dict[str, Any]]:
    with connect(database_path) as connection:
        rows = connection.execute(
            "SELECT id, created_at, title, text_note, status "
            "FROM observations ORDER BY created_at DESC, id"
        ).fetchall()
    return [_to_observation(row) for row in rows]


def get_observation(
    observation_id: str, database_path: str | Path | None = None
) -> dict[str, Any] | None:
    with connect(database_path) as connection:
        observation = connection.execute(
            "SELECT id, created_at, title, text_note, status "
            "FROM observations WHERE id = ?",
            (observation_id,),
        ).fetchone()
        if observation is None:
            return None
        evidence = connection.execute(
            "SELECT id, observation_id, type, uri, created_at, metadata "
            "FROM evidence WHERE observation_id = ? ORDER BY created_at, id",
            (observation_id,),
        ).fetchall()
        findings = connection.execute(
            "SELECT id, observation_id, category, observation, issue, suggested_action, "
            "confidence, status, created_at FROM findings "
            "WHERE observation_id = ? ORDER BY created_at, id",
            (observation_id,),
        ).fetchall()
    return {
        **_to_observation(observation),
        "evidence": [_to_evidence(row) for row in evidence],
        "findings": [_to_finding(row) for row in findings],
    }


def add_evidence(
    observation_id: str,
    evidence: EvidenceCreate,
    database_path: str | Path | None = None,
) -> dict[str, Any] | None:
    result = {
        "id": str(uuid4()),
        "observation_id": observation_id,
        "created_at": _now(),
        **evidence.model_dump(mode="json", exclude={"metadata"}),
        "metadata": json.dumps(evidence.metadata),
    }
    with connect(database_path) as connection:
        exists = connection.execute(
            "SELECT 1 FROM observations WHERE id = ?", (observation_id,)
        ).fetchone()
        if exists is None:
            return None
        connection.execute(
            "INSERT INTO evidence (id, observation_id, type, uri, created_at, metadata) "
            "VALUES (:id, :observation_id, :type, :uri, :created_at, :metadata)",
            result,
        )
    result["metadata"] = evidence.metadata
    return result


def add_finding(
    observation_id: str,
    finding: FindingCreate,
    database_path: str | Path | None = None,
) -> dict[str, Any] | None:
    result = {
        "id": str(uuid4()),
        "observation_id": observation_id,
        "created_at": _now(),
        **finding.model_dump(mode="json"),
    }
    with connect(database_path) as connection:
        exists = connection.execute(
            "SELECT 1 FROM observations WHERE id = ?", (observation_id,)
        ).fetchone()
        if exists is None:
            return None
        connection.execute(
            "INSERT INTO findings "
            "(id, observation_id, category, observation, issue, suggested_action, "
            "confidence, status, created_at) "
            "VALUES (:id, :observation_id, :category, :observation, :issue, "
            ":suggested_action, :confidence, :status, :created_at)",
            result,
        )
    return result
