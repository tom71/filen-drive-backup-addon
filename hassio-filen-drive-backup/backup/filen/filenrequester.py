from aiohttp import ClientSession, ClientTimeout, ClientResponse
from aiohttp.client_exceptions import (ClientConnectorError, ClientOSError,
                                       ServerDisconnectedError, ServerTimeoutError)
from injector import singleton, inject

from .errors import (FilenAuthError, FilenConnectionError, FilenRateLimitError,
                     FilenTimeoutError, FilenUnexpectedResponseError)


@singleton
class FilenRequester():
    @inject
    def __init__(self, session: ClientSession):
        self.session = session

    async def request(self, method: str, url: str, headers=None, json=None,
                      data=None, timeout_seconds: float = 30.0) -> ClientResponse:
        if headers is None:
            headers = {}

        try:
            response = await self.session.request(
                method,
                url,
                headers=headers,
                json=json,
                data=data,
                timeout=self.buildTimeout(timeout_seconds),
            )
            if response.status < 400:
                return response
            self._raise_for_status(response.status)
            response.raise_for_status()
            return response
        except (ClientConnectorError, ClientOSError):
            raise FilenConnectionError()
        except ServerTimeoutError:
            raise FilenTimeoutError()
        except ServerDisconnectedError:
            raise FilenUnexpectedResponseError()

    def buildTimeout(self, timeout_seconds: float) -> ClientTimeout:
        return ClientTimeout(sock_connect=timeout_seconds, sock_read=timeout_seconds)

    def _raise_for_status(self, status: int) -> None:
        if status in [401, 403]:
            raise FilenAuthError()
        if status == 429:
            raise FilenRateLimitError()
        if status == 408:
            raise FilenTimeoutError()
        if status >= 500:
            raise FilenUnexpectedResponseError()
