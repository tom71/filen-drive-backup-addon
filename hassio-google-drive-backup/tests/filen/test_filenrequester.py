from unittest.mock import AsyncMock

import pytest

from backup.filen import (FilenAuthError, FilenRateLimitError,
                          FilenRequester, FilenTimeoutError,
                          FilenUnexpectedResponseError)


class _DummyResponse:
    def __init__(self, status):
        self.status = status

    def raise_for_status(self):
        raise RuntimeError("unexpected raise_for_status call")


@pytest.mark.asyncio
async def test_request_success_returns_response():
    session = AsyncMock()
    response = _DummyResponse(200)
    session.request = AsyncMock(return_value=response)
    requester = FilenRequester(session=session)

    actual = await requester.request("GET", "https://gateway.filen.io/v3/user/info")

    assert actual is response


@pytest.mark.asyncio
async def test_request_raises_auth_error_for_401():
    session = AsyncMock()
    session.request = AsyncMock(return_value=_DummyResponse(401))
    requester = FilenRequester(session=session)

    with pytest.raises(FilenAuthError):
        await requester.request("GET", "https://gateway.filen.io/v3/user/info")


@pytest.mark.asyncio
async def test_request_raises_rate_limit_for_429():
    session = AsyncMock()
    session.request = AsyncMock(return_value=_DummyResponse(429))
    requester = FilenRequester(session=session)

    with pytest.raises(FilenRateLimitError):
        await requester.request("GET", "https://gateway.filen.io/v3/user/info")


@pytest.mark.asyncio
async def test_request_raises_timeout_for_408():
    session = AsyncMock()
    session.request = AsyncMock(return_value=_DummyResponse(408))
    requester = FilenRequester(session=session)

    with pytest.raises(FilenTimeoutError):
        await requester.request("GET", "https://gateway.filen.io/v3/user/info")


@pytest.mark.asyncio
async def test_request_raises_unexpected_for_500():
    session = AsyncMock()
    session.request = AsyncMock(return_value=_DummyResponse(500))
    requester = FilenRequester(session=session)

    with pytest.raises(FilenUnexpectedResponseError):
        await requester.request("GET", "https://gateway.filen.io/v3/user/info")
