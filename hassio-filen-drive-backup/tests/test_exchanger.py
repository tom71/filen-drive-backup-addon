from unittest.mock import AsyncMock

import pytest

from backup.filen import FilenAuthError, FilenRequests


class _JsonResponse:
    def __init__(self, value):
        self._value = value

    async def json(self):
        return self._value


@pytest.mark.asyncio
async def test_filen_validate_api_key_success():
    requester = AsyncMock()
    requester.request = AsyncMock(return_value=_JsonResponse({"storage": {"max": 10, "used": 1}}))
    api = FilenRequests(requester=requester)

    info = await api.validate_api_key("api-key")

    assert info["storage"]["max"] == 10
    requester.request.assert_awaited_once()


@pytest.mark.asyncio
async def test_filen_validate_api_key_invalid_key():
    requester = AsyncMock()
    requester.request = AsyncMock(side_effect=FilenAuthError())
    api = FilenRequests(requester=requester)

    with pytest.raises(FilenAuthError):
        await api.validate_api_key("bad-key")
