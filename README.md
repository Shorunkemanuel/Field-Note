# Field-Note

Field-Note is an AI-assisted field evidence and action management application for people who work outside the office. Its product principle is: **AI structures what happened. Evidence shows what was observed. A human decides what becomes official.**

## Milestones

**M1** establishes the core Observation, Evidence, and Finding data model, SQLite persistence, a small API, and a mobile-first interface to create and review observations.

**M2 field capture** adds a local capture flow for photos, voice recordings, text notes, timestamps, and optional location. Captured records and media blobs are stored in the browser's IndexedDB and can be reopened from the same browser profile after refresh, provided the application shell can be loaded. Location and microphone access are requested only when explicitly selected.

**M3 AI evidence extraction** adds an explicit user-triggered workflow for M2 captures. The backend sends supported photos and capture context to a configured open-weight multimodal model; audio is transcribed only when a transcription model is configured. Results are validated AI drafts stored with the capture in IndexedDB and replaced, not duplicated, when analysis is retried. Drafts are not persisted as official findings, confirmed, or acted upon.

M2 captures can be created and viewed offline while the application is already open; capture itself remains local and does not require the API. When the user chooses **Analyze with AI**, the note, selected media, capture time, and location if present are sent to the Field-Note backend and then to its configured provider. The backend API key is shared by that server process; the application has no authentication or per-user key settings. Use a protected backend and do not expose the API publicly without adding appropriate access controls. **The application shell is not cached for offline reload**: there is no service worker or PWA configuration, so reopening or reloading after losing access to the frontend host is not supported. M1 observations continue to use the FastAPI API and cannot be loaded offline. M2 captures remain local to the browser profile and are not synchronized with the backend except for media/context sent for an explicit extraction request; clearing browser site data removes the local capture and its drafts. Report generation, authentication, general cloud storage, deployment, and multi-tenancy are not implemented.

## Architecture and technology

- **Frontend:** React, TypeScript, Vite
- **Backend:** Python, FastAPI, Pydantic
- **Persistence:** SQLite via Python's standard library `sqlite3`
- **M1 architecture:** React API module → FastAPI → SQLite data layer
- **M2 capture storage:** Browser IndexedDB for capture records and media blobs

See [docs/architecture.md](docs/architecture.md) for the domain relationships, persistence boundaries, and request/data flow.

## Run locally

From the repository root, start the backend in one terminal:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn app.main:app --app-dir backend --reload
```

The API is available at `http://localhost:8000`; interactive API documentation is at `http://localhost:8000/docs`. The default database is created at `data/field_note.db`. Set `FIELD_NOTE_DATABASE_PATH` to use a different database file.

In another terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite. Its development server proxies `/api` requests to the backend at `http://localhost:8000`.

Use **Capture field note** to record photos and audio locally. When the app is already loaded, captures can be saved and viewed offline in the same browser profile. Reopening the app offline after a reload is not supported; the frontend host must be reachable to load the app shell. Browser microphone and geolocation APIs generally require a secure context (localhost is allowed); location is optional and requested only by pressing **Add location**.

### Configure AI extraction

Copy the values in `.env.example` into the backend process environment (the application reads environment variables; it does not automatically load `.env` files). Set `FIELD_NOTE_AI_API_KEY` to your provider key and `FIELD_NOTE_AI_MODEL` to a model or router supported by the configured OpenAI-compatible API. The example uses OpenRouter's `openrouter/free` router, which routes requests to an available free model. Actual model availability, usage limits, and structured-output behavior can vary. `FIELD_NOTE_AI_BASE_URL` and `FIELD_NOTE_AI_PROVIDER_NAME` select/name the API. To enable audio transcription, also set `FIELD_NOTE_AI_TRANSCRIPTION_MODEL` to a transcription model supported by that provider's `/audio/transcriptions` endpoint. Without it, audio is explicitly reported as unanalyzed.

A manual live test observed during this session returned HTTP 200 from `POST /api/extractions` and produced an AI draft using OpenRouter's free router. Automated repository tests do not establish live provider inference; provider behavior can vary as described above.

Credentials belong only in the backend environment. The API accepts up to 10 evidence files, each up to 10 MB, with a 20 MB total limit. JPEG, PNG, and WebP images are sent for visual analysis; unsupported image formats are reported in the result. Analysis requires network access and is available only for saved M2 browser captures.

## Tests and build

Run backend tests from the repository root:

```bash
pip install -r backend/requirements.txt
pytest
```

Build the frontend:

```bash
cd frontend
npm install
npm test
npm run build
```
