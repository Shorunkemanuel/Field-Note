# Architecture

## Request and persistence flow

M1 observations use the React API module in `frontend/src/api/client.ts` to call FastAPI. FastAPI validates requests and responses with Pydantic schemas, then calls SQLite persistence functions in `backend/app/database.py`. The data layer uses Python's standard-library `sqlite3`; the local development database is `data/field_note.db`.

```text
M1: React API module → FastAPI API → SQLite data layer → SQLite
M2: Capture UI → IndexedDB (observation metadata and photo/audio blobs)
```

The application creates the M1 database and required tables at startup. Tests supply a temporary database path so they never use the development database. M2 capture records and photo/audio blobs are persisted in browser IndexedDB and do not sync to the API. While the application is already loaded, capture and retrieval use IndexedDB without a network request, so local capture records can be created and viewed offline. The app shell is not cached: there is no service worker or PWA configuration, so an offline cold start or reload cannot load the frontend. M1 observations still require the API and are unavailable if it cannot be reached. Data remains in the browser profile; clearing site data removes the capture and media.

## Domain relationships

An **Observation** represents something captured in the physical world. It has a title, text note, creation time, and an explicit lifecycle status: `DRAFT`, `REVIEW`, `CONFIRMED`, or `REJECTED`.

```text
Observation → zero or more Evidence records
Observation → zero or more Finding records
```

An **Evidence** record references an observation and stores a type (`PHOTO`, `AUDIO`, or `TEXT`), a URI/path, creation time, and optional JSON metadata. M1 API evidence records may reference local paths. M2 browser captures store photo/audio blobs alongside their observation in IndexedDB and preview them from that record.

A **Finding** is a persisted domain object associated with an observation. It holds a category, observation text, issue, suggested action, optional confidence, status, and creation time. M1 does not generate findings with AI.

## Product principle

> AI proposes. Evidence proves. Humans verify.

Camera/microphone capture and optional geolocation are initiated only by user action. Location is stored with the local capture only after the browser grants permission. There is no transcription, AI/model call, report generation, authentication, or cloud service.
