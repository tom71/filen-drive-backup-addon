from unittest.mock import AsyncMock
from datetime import datetime
from io import BytesIO

import pytest
import pytz

from backup.config import Config, Setting
from backup.filen import FilenSource
from backup.filen.encryption import encrypt_chunk


def _config(enabled=True, key="k"):
    return Config.withOverrides({
        Setting.ENABLE_FILEN_UPLOAD: enabled,
        Setting.FILEN_API_KEY: key,
        Setting.MAX_BACKUPS_IN_FILEN: 7,
    })


def test_enabled_depends_on_flag_and_key():
    source = FilenSource(config=_config(enabled=True, key="abc"), requests=AsyncMock(), folder_finder=AsyncMock())
    assert source.enabled() is True

    source = FilenSource(config=_config(enabled=False, key="abc"), requests=AsyncMock(), folder_finder=AsyncMock())
    assert source.enabled() is False

    source = FilenSource(config=_config(enabled=True, key=""), requests=AsyncMock(), folder_finder=AsyncMock())
    assert source.enabled() is False


def test_max_count_reads_config():
    source = FilenSource(config=_config(), requests=AsyncMock(), folder_finder=AsyncMock())
    assert source.maxCount() == 7


def test_free_space_is_optional_in_status_path():
    source = FilenSource(config=_config(), requests=AsyncMock(), folder_finder=AsyncMock())
    assert source.freeSpace() is None


class _UploadSource:
    def __init__(self, chunks):
        self._chunks = chunks
        self._idx = 0
        self._size = sum(map(len, chunks))

    def size(self):
        return self._size

    async def read(self, _count):
        if self._idx >= len(self._chunks):
            return BytesIO(b"")
        value = self._chunks[self._idx]
        self._idx += 1
        return BytesIO(value)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False


class _BackupOptions:
    def __init__(self):
        self.retain_sources = {"Filen": True}


class _Backup:
    def __init__(self):
        self._status = None
        self._upload = None

    def slug(self):
        return "slug-1"

    def date(self):
        return datetime(2026, 3, 13, 12, 0, 0, tzinfo=pytz.utc)

    def name(self):
        return "My Backup"

    def backupType(self):
        return "full"

    def version(self):
        return "1.0"

    def protected(self):
        return False

    def note(self):
        return ""

    def getOptions(self):
        return _BackupOptions()

    def overrideStatus(self, *_args):
        self._status = True

    def setUploadSource(self, *_args):
        self._upload = True


@pytest.mark.asyncio
async def test_save_uploads_encrypted_chunks_and_returns_backup():
    requests = AsyncMock()
    requests.start_upload = AsyncMock(return_value={"uuid": "u-1", "uploadKey": "up-key", "parent": "folder-1", "region": "de-1"})
    requests.upload_chunk = AsyncMock(return_value={})
    requests.complete_upload = AsyncMock(return_value={"uuid": "file-1", "region": "de-1"})
    folder = AsyncMock()
    folder.get = AsyncMock(return_value="folder-1")

    source = FilenSource(config=_config(), requests=requests, folder_finder=folder)
    upload = _UploadSource([b"abc", b"def"])
    backup = _Backup()

    created = await source.save(backup, upload)

    assert created.id() == "file-1"
    assert created.region() == "de-1"
    assert requests.upload_chunk.await_count == 2
    assert requests.complete_upload.await_count == 1


@pytest.mark.asyncio
async def test_read_decrypts_chunk_data():
    requests = AsyncMock()
    folder = AsyncMock()
    source = FilenSource(config=_config(), requests=requests, folder_finder=folder)

    key = b"k" * 32
    iv, cipher = encrypt_chunk(b"hello", key)
    payload = iv + cipher
    requests.download_chunk = AsyncMock(side_effect=[payload, b""])

    class _Remote:
        def region(self):
            return "de-1"

        def id(self):
            return "file-1"

        def fileKey(self):
            import base64
            return base64.urlsafe_b64encode(key).decode("ascii")

    stream = await source.read(_Remote())
    assert stream.read() == b"hello"
