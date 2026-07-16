from __future__ import annotations

import asyncio
import ipaddress
import logging
import socket
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import httpx

from penguin_translator_api.config import Settings

SUPPORTED_IMAGE_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})

# HTTPX's informational request log includes the complete URL. Keep the transport loggers above
# INFO so image query strings cannot appear when Uvicorn configures application logging.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


class ImageFetchError(RuntimeError):
    code = "IMAGE_FETCH_FAILED"


class UnsafeImageUrlError(ImageFetchError):
    code = "IMAGE_URL_BLOCKED"


class ImageRedirectError(ImageFetchError):
    code = "IMAGE_REDIRECT_FAILED"


class ImageFetchTimeoutError(ImageFetchError):
    code = "IMAGE_FETCH_TIMEOUT"


class ImageTooLargeError(ImageFetchError):
    code = "IMAGE_TOO_LARGE"


class UnsupportedImageTypeError(ImageFetchError):
    code = "IMAGE_CONTENT_TYPE_UNSUPPORTED"


@dataclass(frozen=True)
class FetchedImage:
    content: bytes
    content_type: str


Resolver = Callable[[str, int], Awaitable[list[ipaddress.IPv4Address | ipaddress.IPv6Address]]]


async def resolve_host(
    hostname: str, port: int
) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    records = await asyncio.to_thread(
        socket.getaddrinfo,
        hostname,
        port,
        socket.AF_UNSPEC,
        socket.SOCK_STREAM,
    )
    return list(dict.fromkeys(ipaddress.ip_address(record[4][0]) for record in records))


class ImageFetcher:
    def __init__(
        self,
        settings: Settings,
        *,
        resolver: Resolver = resolve_host,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._settings = settings
        self._resolver = resolver
        self._transport = transport

    async def fetch(self, source: str) -> FetchedImage:
        logical_url = source
        timeout = httpx.Timeout(self._settings.image_fetch_timeout_seconds)
        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                transport=self._transport,
                follow_redirects=False,
                trust_env=False,
            ) as client:
                for redirect_count in range(self._settings.image_fetch_max_redirects + 1):
                    request_url, host_header, sni_hostname = await self._validated_request_target(
                        logical_url
                    )
                    headers = {
                        "Accept": ", ".join(sorted(SUPPORTED_IMAGE_TYPES)),
                        "Host": host_header,
                        "User-Agent": "penguin-translator-image-fetcher/0.1",
                    }
                    extensions: dict[str, object] = {}
                    if sni_hostname is not None:
                        extensions["sni_hostname"] = sni_hostname
                    async with client.stream(
                        "GET", request_url, headers=headers, extensions=extensions
                    ) as response:
                        if response.is_redirect:
                            if redirect_count >= self._settings.image_fetch_max_redirects:
                                raise ImageRedirectError("Image redirect limit exceeded")
                            location = response.headers.get("location")
                            if not location:
                                raise ImageFetchError("Image redirect omitted Location")
                            logical_url = urljoin(logical_url, location)
                            continue

                        response.raise_for_status()
                        content_type = (
                            response.headers.get("content-type", "")
                            .split(";", 1)[0]
                            .strip()
                            .lower()
                        )
                        if content_type not in SUPPORTED_IMAGE_TYPES:
                            raise UnsupportedImageTypeError(
                                "Image response Content-Type is not supported"
                            )
                        content_length = response.headers.get("content-length")
                        if (
                            content_length is not None
                            and content_length.isdigit()
                            and int(content_length) > self._settings.image_fetch_max_bytes
                        ):
                            raise ImageTooLargeError("Image response exceeds maximum bytes")

                        content = bytearray()
                        async for chunk in response.aiter_bytes():
                            content.extend(chunk)
                            if len(content) > self._settings.image_fetch_max_bytes:
                                raise ImageTooLargeError("Image response exceeds maximum bytes")
                        return FetchedImage(bytes(content), content_type)
        except httpx.TimeoutException as error:
            raise ImageFetchTimeoutError("Image request timed out") from error
        except httpx.HTTPStatusError as error:
            raise ImageFetchError(
                f"Image server returned HTTP {error.response.status_code}"
            ) from error
        except httpx.RequestError as error:
            raise ImageFetchError("Image transport failed") from error

        raise ImageFetchError("Image request did not produce a response")

    async def _validated_request_target(self, value: str) -> tuple[str, str, str | None]:
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise UnsafeImageUrlError("Only HTTP(S) image URLs are allowed")
        if parsed.username is not None or parsed.password is not None:
            raise UnsafeImageUrlError("Image URLs must not contain credentials")

        hostname = parsed.hostname.lower()
        try:
            hostname.encode("ascii")
        except UnicodeEncodeError as error:
            raise UnsafeImageUrlError("Image hostname must use ASCII") from error
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        try:
            addresses = await self._resolver(hostname, port)
        except (OSError, ValueError) as error:
            raise UnsafeImageUrlError("Image host could not be safely resolved") from error
        if not addresses:
            raise UnsafeImageUrlError("Image host resolved to no addresses")

        target_host = f"[{hostname}]" if ":" in hostname else hostname
        development_exception = f"{target_host}:{port}" in self._settings.dev_allowed_image_targets
        if not development_exception and any(not address.is_global for address in addresses):
            raise UnsafeImageUrlError("Image host resolved to a non-public address")

        selected = addresses[0]
        netloc = f"[{selected}]" if selected.version == 6 else str(selected)
        if parsed.port is not None:
            netloc = f"{netloc}:{parsed.port}"
        request_url = parsed._replace(netloc=netloc).geturl()

        default_port = 443 if parsed.scheme == "https" else 80
        host_header = hostname if port == default_port else f"{hostname}:{port}"
        sni_hostname = hostname if parsed.scheme == "https" else None
        return request_url, host_header, sni_hostname
