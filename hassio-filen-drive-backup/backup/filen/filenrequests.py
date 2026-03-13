from typing import Any
from aiohttp import ContentTypeError

from injector import singleton, inject

from .filenrequester import FilenRequester


@singleton
class FilenRequests():
    @inject
    def __init__(self, requester: FilenRequester, gateway: str = "https://gateway.filen.io"):
        self.requester = requester
        self.gateway = gateway.rstrip("/")

    async def validate_api_key(self, api_key: str) -> dict[str, Any]:
        response = await self.requester.request(
            "GET",
            self._url("/v3/user/info"),
            headers=self._headers(api_key),
        )
        return await response.json()

    async def list_dir(self, api_key: str, uuid: str) -> dict[str, Any]:
        response = await self.requester.request(
            "POST",
            self._url("/v3/dir/content"),
            headers=self._headers(api_key),
            json={"uuid": uuid},
        )
        return await response.json()

    async def create_dir(self, api_key: str, name: str, parent_uuid: str = "base") -> dict[str, Any]:
        response = await self.requester.request(
            "POST",
            self._url("/v3/dir/create"),
            headers=self._headers(api_key),
            json={"name": name, "parent": parent_uuid},
        )
        return await response.json()

    async def start_upload(self, api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.requester.request(
            "POST",
            self._url("/v3/file/upload"),
            headers=self._headers(api_key),
            json=payload,
        )
        return await response.json()

    async def upload_chunk(self, api_key: str, uuid: str, index: int, parent: str,
                           upload_key: str, data: bytes) -> dict[str, Any]:
        response = await self.requester.request(
            "PUT",
            self._url(f"/v3/file/upload/chunk/{uuid}/{index}/{parent}/{upload_key}"),
            headers=self._headers(api_key),
            data=data,
        )
        return await self._safe_json(response)

    async def complete_upload(self, api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.requester.request(
            "POST",
            self._url("/v3/file/upload/done"),
            headers=self._headers(api_key),
            json=payload,
        )
        return await self._safe_json(response)

    async def delete_file(self, api_key: str, uuid: str) -> dict[str, Any]:
        response = await self.requester.request(
            "POST",
            self._url("/v3/file/delete/permanent"),
            headers=self._headers(api_key),
            json={"uuid": uuid},
        )
        return await response.json()

    async def download_chunk(self, api_key: str, region: str, uuid: str,
                             index: int) -> bytes:
        response = await self.requester.request(
            "GET",
            self._url(f"/v3/file/download/chunk/{region}/{uuid}/{index}"),
            headers=self._headers(api_key),
        )
        return await response.read()

    def _url(self, path: str) -> str:
        return f"{self.gateway}{path}"

    def _headers(self, api_key: str) -> dict[str, str]:
        return {"Authorization": api_key}

    async def _safe_json(self, response) -> dict[str, Any]:
        try:
            return await response.json()
        except (ContentTypeError, ValueError):
            return {}
