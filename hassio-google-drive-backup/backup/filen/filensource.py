import io
from typing import Dict

from injector import inject, singleton

from backup.config import Config, Setting
from backup.const import SOURCE_FILEN
from backup.exceptions import LogicError
from backup.model import Backup, BackupDestination, FilenBackup

from .filenrequests import FilenRequests
from .folderfinder import FilenFolderFinder


@singleton
class FilenSource(BackupDestination):
    @inject
    def __init__(self, config: Config, requests: FilenRequests, folder_finder: FilenFolderFinder):
        super().__init__()
        self.config = config
        self.requests = requests
        self.folder_finder = folder_finder

    def name(self) -> str:
        return SOURCE_FILEN

    def title(self) -> str:
        return "Filen"

    def icon(self) -> str:
        return "cloud_upload"

    def upload(self) -> bool:
        return self.config.get(Setting.ENABLE_FILEN_UPLOAD)

    def maxCount(self) -> int:
        return self.config.get(Setting.MAX_BACKUPS_IN_FILEN)

    def _api_key(self) -> str:
        return self.config.get(Setting.FILEN_API_KEY)

    def enabled(self) -> bool:
        return self.upload() and bool(self._api_key())

    async def get(self) -> Dict[str, FilenBackup]:
        if not self.enabled():
            return {}
        folder_uuid = await self.folder_finder.get(self._api_key())
        listing = await self.requests.list_dir(self._api_key(), folder_uuid)

        files = listing.get("files", [])
        ret: Dict[str, FilenBackup] = {}
        for file_obj in files:
            metadata = file_obj.get("metadata")
            if isinstance(metadata, dict) and "slug" in metadata:
                backup = FilenBackup(file_obj)
                ret[backup.slug()] = backup
        return ret

    async def save(self, backup: Backup, source):
        raise LogicError("Filen upload flow is not implemented yet")

    async def delete(self, backup: FilenBackup):
        await self.requests.delete_file(self._api_key(), backup.id())

    async def read(self, backup: FilenBackup):
        if not backup.region():
            raise LogicError("Filen backup is missing region")
        data = await self.requests.download_chunk(self._api_key(), backup.region(), backup.id(), 0)
        return io.BytesIO(data)

    async def freeSpace(self):
        if not self.enabled():
            return None
        info = await self.requests.validate_api_key(self._api_key())
        storage = info.get("storage", {})
        max_bytes = int(storage.get("max", 0))
        used = int(storage.get("used", 0))
        if max_bytes <= 0:
            return None
        return max_bytes - used
