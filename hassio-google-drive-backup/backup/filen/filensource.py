import io
import base64
from typing import Dict

from injector import inject, singleton

from backup.config import Config, Setting
from backup.const import SOURCE_FILEN
from backup.exceptions import LogicError
from backup.model import Backup, BackupDestination, FilenBackup

from .encryption import decrypt_chunk, encrypt_chunk, encrypt_string, generate_file_key
from .filenrequests import FilenRequests
from .folderfinder import FilenFolderFinder

MIME_TYPE = "application/tar"


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
        if self.config.get(Setting.MAX_BACKUPS_IN_FILEN) != Setting.MAX_BACKUPS_IN_FILEN.default():
            return self.config.get(Setting.MAX_BACKUPS_IN_FILEN)
        return self.config.get(Setting.MAX_BACKUPS_IN_GOOGLE_DRIVE)

    def _api_key(self) -> str:
        return self.config.get(Setting.FILEN_API_KEY)

    def enabled(self) -> bool:
        return self.upload() and bool(self._api_key())

    def isCustomCreds(self) -> bool:
        # Filen uses API keys, there is no managed/default credential pair.
        return True

    def saveCreds(self, _creds):
        # OAuth credentials do not apply to Filen.
        return

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
        api_key = self._api_key()
        folder_uuid = await self.folder_finder.get(api_key)

        file_key = generate_file_key()
        file_key_encoded = base64.urlsafe_b64encode(file_key).decode("ascii")
        encrypted_name = encrypt_string(str(backup.name()) + ".tar", file_key)
        backup_note = backup.note() or ""
        metadata = {
            "slug": backup.slug(),
            "date": str(backup.date()),
            "name": str(backup.name()),
            "size": source.size(),
            "type": str(backup.backupType()),
            "version": str(backup.version()),
            "protected": bool(backup.protected()),
            "retained": bool(backup.getOptions() and backup.getOptions().retain_sources.get(self.name(), False)),
            "note": backup_note,
            "file_key": file_key_encoded,
        }

        start_payload = {
            "parent": folder_uuid,
            "name": encrypted_name,
            "mime": MIME_TYPE,
            "size": source.size(),
            "metadata": metadata,
        }

        async with source:
            if hasattr(backup, "overrideStatus"):
                backup.overrideStatus("Uploading {0}%", source)
            if hasattr(backup, "setUploadSource"):
                backup.setUploadSource(self.title(), source)

            start = await self.requests.start_upload(api_key, start_payload)
            upload_uuid = self._pick(start, ["uuid", "fileUuid", "file_uuid"]) 
            upload_key = self._pick(start, ["uploadKey", "upload_key", "key"]) 
            parent = self._pick(start, ["parent", "parentUuid", "parent_uuid"], folder_uuid)
            region = self._pick(start, ["region"], None)

            if not upload_uuid or not upload_key:
                raise LogicError("Filen upload start response is missing required fields")

            index = 0
            chunk_size = self.config.get(Setting.DEFAULT_CHUNK_SIZE)
            while True:
                chunk = await source.read(chunk_size)
                data = self._to_bytes(chunk)
                if len(data) == 0:
                    break
                iv, cipher = encrypt_chunk(data, file_key)
                await self.requests.upload_chunk(api_key, upload_uuid, index, parent, upload_key, iv + cipher)
                index += 1

            done_payload = {
                "uuid": upload_uuid,
                "parent": parent,
                "uploadKey": upload_key,
                "metadata": metadata,
                "name": encrypted_name,
                "chunks": index,
                "mime": MIME_TYPE,
                "size": source.size(),
            }
            done = await self.requests.complete_upload(api_key, done_payload)

            file_data = {
                "uuid": self._pick(done, ["uuid", "fileUuid", "file_uuid"], upload_uuid),
                "region": self._pick(done, ["region"], region),
                "size": source.size(),
                "metadata": metadata,
            }
            return FilenBackup(file_data)

    async def delete(self, backup: FilenBackup):
        await self.requests.delete_file(self._api_key(), backup.id())

    async def read(self, backup: FilenBackup):
        if not backup.region():
            raise LogicError("Filen backup is missing region")
        if not backup.fileKey():
            raise LogicError("Filen backup is missing file key")

        key = base64.urlsafe_b64decode(backup.fileKey().encode("ascii"))
        data = io.BytesIO()
        index = 0
        while True:
            try:
                chunk = await self.requests.download_chunk(self._api_key(), backup.region(), backup.id(), index)
            except Exception:
                if index == 0:
                    raise
                break

            if len(chunk) == 0:
                break

            iv = chunk[:12]
            cipher = chunk[12:]
            data.write(decrypt_chunk(cipher, key, iv))
            index += 1

        data.seek(0)
        return data

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

    def _pick(self, data: dict, keys: list[str], default=None):
        for key in keys:
            if key in data and data[key] is not None:
                return data[key]
        return default

    def _to_bytes(self, chunk) -> bytes:
        if chunk is None:
            return b""
        if isinstance(chunk, bytes):
            return chunk
        if hasattr(chunk, "getbuffer"):
            return bytes(chunk.getbuffer())
        if hasattr(chunk, "read"):
            value = chunk.read()
            if isinstance(value, bytes):
                return value
        return bytes(chunk)
