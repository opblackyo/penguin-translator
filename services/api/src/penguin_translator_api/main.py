from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from penguin_translator_api.api.health import router as health_router
from penguin_translator_api.api.translate_image import router as translate_image_router
from penguin_translator_api.config import Settings

app = FastAPI(
    title="Penguin Translator API",
    summary="Private-LAN manga translation with M0 compatibility and M2.2 thin transports",
    version="0.3.0-m2.2",
)
development_settings = Settings.from_environment()
if development_settings.dev_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(development_settings.dev_cors_origins),
        allow_methods=["POST"],
        allow_headers=["Authorization", "Content-Type"],
    )
app.include_router(health_router)
app.include_router(translate_image_router)
