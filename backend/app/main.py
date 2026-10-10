import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import database
from app.api.observations import router as observations_router


def create_app(database_path: str | Path | None = None) -> FastAPI:
    resolved_path = database.resolve_database_path(database_path)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        database.initialize_database(resolved_path)
        yield

    application = FastAPI(title="Field-Note API", lifespan=lifespan)
    application.state.database_path = resolved_path
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(observations_router)
    return application


app = create_app(os.getenv("FIELD_NOTE_DATABASE_PATH"))
