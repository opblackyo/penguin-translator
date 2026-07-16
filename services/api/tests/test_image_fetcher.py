from __future__ import annotations

import ipaddress

import httpx
import pytest

from penguin_translator_api.services.image_fetcher import (
    ImageFetcher,
    ImageFetchError,
    ImageFetchTimeoutError,
    ImageRedirectError,
    ImageTooLargeError,
    UnsafeImageUrlError,
    UnsupportedImageTypeError,
)
from tests.helpers import make_settings

IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address
PUBLIC_IP: IPAddress = ipaddress.ip_address("93.184.216.34")
PRIVATE_IP: IPAddress = ipaddress.ip_address("127.0.0.1")


class InspectableImageFetcher(ImageFetcher):
    async def validated_target(self, value: str) -> tuple[str, str, str | None]:
        return await self._validated_request_target(value)


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
        assert request.extensions["sni_hostname"] == "images.example.com"
        assert isinstance(request.extensions["sni_hostname"], str)
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


async def test_validated_request_target_preserves_https_sni_host_and_non_default_port() -> None:
    fetcher = InspectableImageFetcher(make_settings(), resolver=public_resolver)

    request_url, host_header, sni_hostname = await fetcher.validated_target(
        "https://images.example.com:8443/page.png?chapter=1"
    )

    assert request_url == f"https://{PUBLIC_IP}:8443/page.png?chapter=1"
    assert host_header == "images.example.com:8443"
    assert sni_hostname == "images.example.com"
    assert isinstance(sni_hostname, str)
    assert not isinstance(sni_hostname, bytes)


async def test_validated_http_target_has_no_sni_hostname() -> None:
    fetcher = InspectableImageFetcher(make_settings(), resolver=public_resolver)

    request_url, host_header, sni_hostname = await fetcher.validated_target(
        "http://images.example.com/page.png"
    )

    assert request_url == f"http://{PUBLIC_IP}/page.png"
    assert host_header == "images.example.com"
    assert sni_hostname is None


async def test_rejects_idn_before_transport_until_an_explicit_policy_is_added() -> None:
    fetcher = InspectableImageFetcher(make_settings(), resolver=public_resolver)

    with pytest.raises(UnsafeImageUrlError, match="ASCII"):
        await fetcher.validated_target("https://例え.テスト/page.png")


async def test_rejects_loopback_and_url_credentials() -> None:
    fetcher = ImageFetcher(make_settings(), resolver=private_resolver)

    with pytest.raises(UnsafeImageUrlError):
        await fetcher.fetch("http://127.0.0.1/image.png")
    with pytest.raises(UnsafeImageUrlError):
        await fetcher.fetch("https://user:password@example.com/image.png")


async def test_allows_only_an_exact_dev_host_and_port_exception() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200, headers={"Content-Type": "image/png"}, content=b"png", request=request
        )
    )
    fetcher = ImageFetcher(
        make_settings(dev_allowed_image_targets=frozenset({"m1-test.local:4173"})),
        resolver=private_resolver,
        transport=transport,
    )

    result = await fetcher.fetch("http://m1-test.local:4173/image.png")

    assert result.content == b"png"

    with pytest.raises(UnsafeImageUrlError):
        await fetcher.fetch("http://m1-test.local:8000/image.png")


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


async def test_rejects_private_redirect_to_a_different_port_on_an_allowed_host() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            302,
            headers={"Location": "http://m1-test.local:8000/private"},
            request=request,
        )
    )
    fetcher = ImageFetcher(
        make_settings(dev_allowed_image_targets=frozenset({"m1-test.local:4173"})),
        resolver=private_resolver,
        transport=transport,
    )

    with pytest.raises(UnsafeImageUrlError):
        await fetcher.fetch("http://m1-test.local:4173/page.png")


async def test_normalizes_redirect_limit_as_a_fetch_failure() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            302,
            headers={"Location": "/next"},
            request=request,
        )
    )
    fetcher = ImageFetcher(
        make_settings(image_fetch_max_redirects=1),
        resolver=public_resolver,
        transport=transport,
    )

    with pytest.raises(ImageRedirectError, match="limit"):
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


@pytest.mark.parametrize(
    "error_type",
    [httpx.ConnectError, httpx.ReadError, httpx.RemoteProtocolError],
)
async def test_normalizes_transport_failures(
    error_type: type[httpx.RequestError],
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise error_type("transport failed", request=request)

    fetcher = ImageFetcher(
        make_settings(),
        resolver=public_resolver,
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(ImageFetchError, match="transport"):
        await fetcher.fetch("https://images.example.com/page.png?secret=query")
