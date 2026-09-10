"""Stateless internal document processing service; never logs request bodies."""
import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    document_processor_secret: SecretStr = Field(min_length=32)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.settings = Settings()
    yield


app = FastAPI(title="MedMemory internal processor", lifespan=lifespan)


def authenticate(x_service_secret: str = Header(default="")) -> None:
    expected = app.state.settings.document_processor_secret.get_secret_value()
    if not secrets.compare_digest(x_service_secret, expected):
        raise HTTPException(status_code=401, detail={"code": "AUTH_REQUIRED"})


@app.get("/health", dependencies=[Depends(authenticate)])
def health():
    return {"ok": True, "data": {"service": "document-processor", "status": "healthy"}}
