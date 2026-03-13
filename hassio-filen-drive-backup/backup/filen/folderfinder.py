from backup.config import Config, Setting
from backup.file import File
from injector import inject, singleton

from .filenrequests import FilenRequests

FOLDER_NAME = "Home Assistant Backups"


@singleton
class FilenFolderFinder():
    @inject
    def __init__(self, config: Config, requests: FilenRequests):
        self.config = config
        self.requests = requests
        self._use_existing = None

    async def get(self, api_key: str) -> str:
        cached = self._read_cached_folder()
        if cached is not None:
            return cached

        found = await self._find_existing(api_key)
        if found is not None:
            self._save_cached_folder(found)
            return found

        created = await self.requests.create_dir(api_key, FOLDER_NAME, "base")
        folder_uuid = created.get("uuid")
        if folder_uuid:
            self._save_cached_folder(folder_uuid)
            return folder_uuid
        raise ValueError("Filen folder create did not return a uuid")

    def reset(self):
        if File.exists(self.config.get(Setting.FILEN_FOLDER_FILE_PATH)):
            File.delete(self.config.get(Setting.FILEN_FOLDER_FILE_PATH))

    def resolveExisting(self, val):
        # Retained for UI compatibility. Filen currently only has one target folder mode.
        self._use_existing = val

    async def save(self, folder_uuid: str) -> None:
        if folder_uuid is None:
            return
        self._save_cached_folder(str(folder_uuid))

    def getCachedFolder(self) -> str | None:
        return self._read_cached_folder()

    def _read_cached_folder(self) -> str | None:
        path = self.config.get(Setting.FILEN_FOLDER_FILE_PATH)
        if not File.exists(path):
            return None
        return File.read(path).strip()

    def _save_cached_folder(self, folder_uuid: str) -> None:
        File.write(self.config.get(Setting.FILEN_FOLDER_FILE_PATH), folder_uuid)

    async def _find_existing(self, api_key: str) -> str | None:
        listing = await self.requests.list_dir(api_key, "base")
        items = listing.get("folders", [])
        for folder in items:
            if folder.get("name") == FOLDER_NAME and folder.get("uuid"):
                return folder.get("uuid")
        return None
