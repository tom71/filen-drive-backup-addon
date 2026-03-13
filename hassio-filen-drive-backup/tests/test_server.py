
import pytest
from yarl import URL
from dev.simulationserver import SimulationServer
from aiohttp import ClientSession
from backup.config import Config
from .faketime import FakeTime
import json

@pytest.mark.asyncio
async def test_refresh_returns_filen_message(server: SimulationServer, session: ClientSession, config: Config, server_url: URL):
    async with session.post(server_url.with_path("drive/refresh"), json={"blah": "blah"}) as r:
        assert r.status == 400
        data = await r.json()
        assert "Filen API keys do not require refresh" in data["message"]


@pytest.mark.asyncio
async def test_old_auth_method_returns_filen_message(server: SimulationServer, session: ClientSession, server_url: URL):
    start_auth = server_url.with_path("drive/authorize").with_query({
        "redirectbacktoken": "http://example.com"
    })
    async with session.get(start_auth, data={}, allow_redirects=False) as r:
        assert r.status == 400
        data = await r.json()
        assert "Filen authentication does not use OAuth" in data["message"]


@pytest.mark.asyncio
async def test_picker_returns_filen_message(server: SimulationServer, session: ClientSession, server_url: URL):
    async with session.get(server_url.with_path("drive/picker"), data={}, allow_redirects=False) as r:
        assert r.status == 400
        data = await r.json()
        assert "folder picker flow" in data["message"]


async def test_log_to_firestore(time: FakeTime, server: SimulationServer, session: ClientSession, server_url: URL):
    data = {"info": "testing"}
    async with session.post(server_url.with_path("logerror"), data=json.dumps(data)) as r:
        assert r.status == 200
    assert server._authserver.error_store.last_error is not None
    assert server._authserver.error_store.last_error['report'] == data
