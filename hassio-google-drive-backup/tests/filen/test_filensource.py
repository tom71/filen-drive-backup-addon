from unittest.mock import AsyncMock

import pytest

from backup.config import Config, Setting
from backup.filen import FilenSource


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


@pytest.mark.asyncio
async def test_free_space_uses_user_info_storage_values():
    requests = AsyncMock()
    requests.validate_api_key = AsyncMock(return_value={"storage": {"max": 1000, "used": 300}})
    source = FilenSource(config=_config(), requests=requests, folder_finder=AsyncMock())

    space = await source.freeSpace()

    assert space == 700
