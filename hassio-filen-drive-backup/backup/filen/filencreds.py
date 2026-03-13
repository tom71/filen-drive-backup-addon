from datetime import datetime

from backup.exceptions import ensureKey
from backup.time import Time

KEY_API_KEY = "api_key"
KEY_CREATED = "created"


class FilenCreds():
    def __init__(self, time: Time, api_key: str, created: datetime = None):
        self.time = time
        self._api_key = api_key
        self._created = created if created is not None else time.now()

    @property
    def api_key(self) -> str:
        return self._api_key

    @property
    def created(self) -> datetime:
        return self._created

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    def serialize(self) -> dict:
        return {
            KEY_API_KEY: self.api_key,
            KEY_CREATED: self.time.asRfc3339String(self.created),
        }

    @classmethod
    def load(cls, time: Time, data: dict, api_key: str = None):
        key = api_key if api_key is not None else ensureKey(KEY_API_KEY, data, "filen credentials")
        created = time.now()
        if KEY_CREATED in data:
            try:
                created = time.parse(data[KEY_CREATED])
            except BaseException:
                created = time.now()
        return cls(time=time, api_key=key, created=created)
