from fastapi import FastAPI

from penguin_translator_api.api.health import router as health_router
from penguin_translator_api.api.translate_image import router as translate_image_router

app = FastAPI(
    title="Penguin Translator API",
    summary="M0 shortcut round-trip mock API",
    version="0.1.0",
)
app.include_router(health_router)
app.include_router(translate_image_router)
