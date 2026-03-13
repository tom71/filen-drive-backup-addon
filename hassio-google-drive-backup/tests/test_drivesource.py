from unittest.mock import AsyncMock

import pytest

from backup.config import Config, Setting
from backup.filen import FilenSource


def _config(api_key="key", enabled=True):
    return Config.withOverrides({
        Setting.ENABLE_FILEN_UPLOAD: enabled,
        Setting.FILEN_API_KEY: api_key,
        Setting.MAX_BACKUPS_IN_FILEN: 3,
    })


def test_filensource_enabled_and_identity():
    source = FilenSource(config=_config(), requests=AsyncMock(), folder_finder=AsyncMock())
    assert source.enabled() is True
    assert source.name() == "Filen"
    assert source.title() == "Filen"


@pytest.mark.asyncio
async def test_filensource_get_reads_filen_folder_listing():
    requests = AsyncMock()
    requests.list_dir = AsyncMock(return_value={
        "files": [
            {
                "uuid": "f1",
                "region": "de-1",
                "size": 11,
                "metadata": {
                    "slug": "slug-1",
                    "date": "2026-03-13T00:00:00Z",
                    "name": "Backup",
                    "file_key": "a2V5",
                },
            }
        ]
    })
    folder = AsyncMock()
    folder.get = AsyncMock(return_value="folder-1")
    source = FilenSource(config=_config(), requests=requests, folder_finder=folder)

    backups = await source.get()

    assert "slug-1" in backups
    assert backups["slug-1"].id() == "f1"
