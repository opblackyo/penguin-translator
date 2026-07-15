from httpx import ASGITransport, AsyncClient

from penguin_translator_api.api.health import HealthResponse
from penguin_translator_api.main import app


async def test_healthz() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/healthz")

    assert response.status_code == 200
    assert HealthResponse.model_validate_json(response.text) == HealthResponse(status="ok")
