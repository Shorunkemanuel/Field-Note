# Architecture

## Request and persistence flow

M1 observations use the React API module in `frontend/src/api/client.ts` to call FastAPI. FastAPI validates requests and responses with Pydantic schemas, then calls SQLite persistence functions in `backend/app/database.py`. The data layer uses Python's standard-library `sqlite3`; the local development database is `data/field_note.db`.

```text
M1: React API module → FastAPI API → SQLite data layer → SQLite
M2: Capture UI → IndexedDB (observation metadata and photo/audio blobs)
M3: Saved M2 capture → explicit multipart request → FastAPI extraction service → configured model provider
    → validated AI draft → IndexedDB capture (replace prior extraction on retry)
```

The application creates the M1 database and required tables at startup. Tests supply a temporary database path so they never use the development database. M2 capture records and photo/audio blobs are persisted in browser IndexedDB. Capture and retrieval remain local, so records can be created and viewed offline while the app is loaded. The app shell is not cached: there is no service worker or PWA configuration, so an offline cold start or reload cannot load the frontend. M1 observations still require the API and are unavailable if it cannot be reached. Data remains in the browser profile; clearing site data removes captures, media, and their AI drafts.

M3 analysis is initiated from a saved local capture detail page. The browser sends that capture's metadata and media to `POST /api/extractions` only after the user requests analysis; the backend does not sync or persist those media files. The endpoint checks that uploaded file fields match the capture's evidence IDs, enforces per-file and total upload limits, processes supported image types, and reports when audio cannot be transcribed. Its provider adapter sends an OpenAI-compatible multimodal request to the configured model and optionally uses the provider's transcription endpoint. API keys and model configuration are read only by the backend. The result must pass strict Pydantic validation, including evidence-reference checks, before it is returned. The frontend stores the latest result with the local capture, replacing it on retry; it is labeled as an AI draft, separate from SQLite-backed Findings. No finding is confirmed and no suggested action is executed.

The default provider URL in `.env.example` is OpenRouter, with an example open-weight vision model. The configured model must support image input and JSON-mode chat completions. Audio transcription is optional and requires a model supported by the configured provider. The API key is configured per backend process, shared by requests to that process, and never sent to the frontend. Authentication, per-user BYOK settings, server-side capture/media storage, and rate limiting are not implemented; deployments must protect the backend endpoint from unauthorized use.

## Domain relationships

An **Observation** represents something captured in the physical world. It has a title, text note, creation time, and an explicit lifecycle status: `DRAFT`, `REVIEW`, `CONFIRMED`, or `REJECTED`.

```text
Observation → zero or more Evidence records
Observation → zero or more Finding records
```

An **Evidence** record references an observation and stores a type (`PHOTO`, `AUDIO`, or `TEXT`), a URI/path, creation time, and optional JSON metadata. M1 API evidence records may reference local paths. M2 browser captures store photo/audio blobs alongside their observation in IndexedDB and preview them from that record.

A **Finding** is a persisted domain object associated with an M1 observation. It holds a category, observation text, issue, suggested action, optional confidence, status, and creation time. M3 AI draft findings are a separate validated response stored with an M2 capture in IndexedDB; they include a title/description, category, cited evidence IDs, reasoning, uncertainty, optional confidence, suggested actions, safety concerns, and provider/model metadata. They are not inserted into the persisted Finding table.

## Product principle

> AI proposes. Evidence proves. Humans verify.

Camera/microphone capture and optional geolocation are initiated only by user action. Location is stored with the local capture only after the browser grants permission; if the user requests AI analysis, that location is included in the request context. The backend provider secret is never exposed to the browser. Model calls and transcription are optional and require configured provider credentials. AI output is untrusted, validated structured draft content only. There is no report generation, authentication, or general cloud storage.
