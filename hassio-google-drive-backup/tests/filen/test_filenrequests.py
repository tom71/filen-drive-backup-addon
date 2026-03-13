from unittest.mock import AsyncMock

import pytest

from backup.filen import FilenRequests


class _JsonResponse:
    def __init__(self, value):
        self._value = value

    async def json(self):
        return self._value

    async def read(self):
        return self._value


@pytest.mark.asyncio
async def test_validate_api_key_calls_user_info():
    requester = AsyncMock()
    requester.request = AsyncMock(return_value=_JsonResponse({"ok": True}))
    api = FilenRequests(requester=requester, gateway="https://gateway.filen.io")

    result = await api.validate_api_key("my-key")

    assert result == {"ok": True}
    requester.request.assert_awaited_once_with(
        "GET",
        "https://gateway.filen.io/v3/user/info",
        headers={"Authorization": "my-key"},
    )


@pytest.mark.asyncio
async def test_create_dir_payload():
    requester = AsyncMock()
    requester.request = AsyncMock(return_value=_JsonResponse({"uuid": "dir-id"}))
    api = FilenRequests(requester=requester, gateway="https://gateway.filen.io")

    await api.create_dir("my-key", "Home Assistant Backups", "base")

    requester.request.assert_awaited_once_with(
        "POST",
        "https://gateway.filen.io/v3/dir/create",
        headers={"Authorization": "my-key"},
        json={"name": "Home Assistant Backups", "parent": "base"},
    )


@pytest.mark.asyncio
async def test_upload_chunk_endpoint_mapping():
    requester = AsyncMock()
    requester.request = AsyncMock(return_value=_JsonResponse({"ok": True}))
    api = FilenRequests(requester=requester, gateway="https://gateway.filen.io")

    await api.upload_chunk("my-key", "u1", 3, "p1", "k1", b"data")

    requester.request.assert_awaited_once_with(
        "PUT",
        "https://gateway.filen.io/v3/file/upload/chunk/u1/3/p1/k1",
        headers={"Authorization": "my-key"},
        data=b"data",
    )


@pytest.mark.asyncio
async def test_download_chunk_reads_bytes():
    requester = AsyncMock()
    requester.request = AsyncMock(return_value=_JsonResponse(b"chunk"))
    api = FilenRequests(requester=requester, gateway="https://gateway.filen.io")

    result = await api.download_chunk("my-key", "de-1", "f-uuid", 4)

    assert result == b"chunk"
    requester.request.assert_awaited_once_with(
        "GET",
        "https://gateway.filen.io/v3/file/download/chunk/de-1/f-uuid/4",
        headers={"Authorization": "my-key"},
    )
