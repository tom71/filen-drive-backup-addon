from unittest.mock import AsyncMock

import pytest

from backup.config import Config, Setting
from backup.filen import FilenFolderFinder


@pytest.mark.asyncio
async def test_folderfinder_reuses_existing_folder(tmp_path):
    config = Config.withOverrides({Setting.FILEN_FOLDER_FILE_PATH: str(tmp_path / "filen-folder.dat")})
    requests = AsyncMock()
    requests.list_dir = AsyncMock(return_value={
        "folders": [
            {"uuid": "x", "name": "Other"},
            {"uuid": "wanted", "name": "Home Assistant Backups"},
        ]
    })
    finder = FilenFolderFinder(config=config, requests=requests)

    got = await finder.get("key")

    assert got == "wanted"
    requests.list_dir.assert_awaited_once_with("key", "base")
    requests.create_dir.assert_not_called()


@pytest.mark.asyncio
async def test_folderfinder_creates_folder_when_missing(tmp_path):
    config = Config.withOverrides({Setting.FILEN_FOLDER_FILE_PATH: str(tmp_path / "filen-folder.dat")})
    requests = AsyncMock()
    requests.list_dir = AsyncMock(return_value={"folders": []})
    requests.create_dir = AsyncMock(return_value={"uuid": "new-folder"})
    finder = FilenFolderFinder(config=config, requests=requests)

    got = await finder.get("key")

    assert got == "new-folder"
    requests.create_dir.assert_awaited_once()
