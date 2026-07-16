from __future__ import annotations

import ipaddress

import httpx
import pytest

from penguin_translator_api.services.image_fetcher import (
    ImageFetcher,
    ImageFetchTimeoutError,
    ImageTooLargeError,
    UnsafeImageUrlError,
    UnsupportedImageTypeError,
)
from tests.helpers import make_settings

IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address
PUBLIC_IP: IPAddress = ipaddress.ip_address("93.184.216.34")
PRIVATE_IP: IPAddress = ipaddress.ip_address("127.0.0.1")


async def public_resolver(hostname: str, port: int) -> list[IPAddress]:
    _ = hostname, port
    return [PUBLIC_IP]


async def private_resolver(hostname: str, port: int) -> list[IPAddress]:
    _ = hostname, port
    return [PRIVATE_IP]


async def test_fetches_supported_image_through_pinned_public_address() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == str(PUBLIC_IP)
        assert request.headers["host"] == "images.example.com"
        assert "authorization" not in request.headers
        assert "cookie" not in request.headers
        return httpx.Response(200, headers={"Content-Type": "image/png"}, content=b"png")

    fetcher = ImageFetcher(
        make_settings(),
        resolver=public_resolver,
        transport=httpx.MockTransport(handler),
    )

    result = await fetcher.fetch("https://images.example.com/page.png?private=query")

    assert result.content == b"png"
    assert result.content_type == "image/png"


async def test_rejects_loopback_and_url_credentials() -> None:
    fetcher = ImageFetcher(make_settings(), resolver=private_resolver)

    with pytest.raises(UnsafeImageUrlError):
        await fetcher.fetch("http://127.0.0.1/image.png")
    with pytest.raises(UnsafeImageUrlError):
        await fetcher.fetch("https://user:password@example.com/image.png")


async def test_allows_only_an_exact_dev_host_exception() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200, headers={"Content-Type": "image/png"}, content=b"png", request=request
        )
    )
    fetcher = ImageFetcher(
        make_settings(dev_allowed_image_hosts=frozenset({"m1-test.local"})),
        resolver=private_resolver,
        transport=transport,
    )

    result = await fetcher.fetch("http://m1-test.local/image.png")

    assert result.content == b"png"


async def test_revalidates_redirect_targets_and_blocks_private_redirect() -> None:
    async def resolver(hostname: str, port: int) -> list[IPAddress]:
        _ = port
        return [PRIVATE_IP if hostname == "metadata.example" else PUBLIC_IP]

    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            302,
            headers={"Location": "http://metadata.example/latest"},
            request=request,
        )
    )
    fetcher = ImageFetcher(make_settings(), resolver=resolver, transport=transport)

    with pytest.raises(UnsafeImageUrlError):
        await fetcher.fetch("https://images.example.com/page.png")


async def test_rejects_oversize_invalid_mime_and_timeout() -> None:
    oversize = ImageFetcher(
        make_settings(image_fetch_max_bytes=2),
        resolver=public_resolver,
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200, headers={"Content-Type": "image/png"}, content=b"123", request=request
            )
        ),
    )
    invalid_mime = ImageFetcher(
        make_settings(),
        resolver=public_resolver,
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200, headers={"Content-Type": "text/html"}, content=b"no", request=request
            )
        ),
    )

    def timeout_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timeout", request=request)

    timeout = ImageFetcher(
        make_settings(),
        resolver=public_resolver,
        transport=httpx.MockTransport(timeout_handler),
    )

    with pytest.raises(ImageTooLargeError):
        await oversize.fetch("https://images.example.com/page.png")
    with pytest.raises(UnsupportedImageTypeError):
        await invalid_mime.fetch("https://images.example.com/page.png")
    with pytest.raises(ImageFetchTimeoutError):
        await timeout.fetch("https://images.example.com/page.png")
