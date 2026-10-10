# Field-Note

Field-Note is an AI-assisted field evidence and action management application for people who work outside the office. Its product principle is: **AI structures what happened. Evidence shows what was observed. A human decides what becomes official.**

## Milestones

**M1** establishes the core Observation, Evidence, and Finding data model, SQLite persistence, a small API, and a mobile-first interface to create and review observations.

**M2 field capture** adds a local capture flow for photos, voice recordings, text notes, timestamps, and optional location. Captured records and media blobs are stored in the browser's IndexedDB and can be reopened from the same browser profile after refresh, provided the application shell can be loaded. Location and microphone access are requested only when explicitly selected.

M2 captures can be created and viewed offline while the application is already open; they are stored locally and do not require the API. **The application shell is not cached for offline reload**: there is no service worker or PWA configuration, so reopening or reloading after losing access to the frontend host is not supported. M1 observations continue to use the FastAPI API and cannot be loaded offline. M2 browser captures are local to the browser profile and are not uploaded, synchronized with the backend, or shared across devices. Clearing browser site data removes them. AI/model calls, transcription, report generation, authentication, cloud storage, deployment, and multi-tenancy are not implemented.

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
npm run build
```
