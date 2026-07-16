from fastapi import FastAPI

from penguin_translator_api.api.health import router as health_router
from penguin_translator_api.api.translate_image import router as translate_image_router

app = FastAPI(
    title="Penguin Translator API",
    summary="Private-LAN manga translation with M0 compatibility and M2.1 page batching",
    version="0.3.0-m2.1",
)
app.include_router(health_router)
app.include_router(translate_image_router)
