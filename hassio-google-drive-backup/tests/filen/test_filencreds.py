from tests.faketime import FakeTime
from backup.filen import FilenCreds, KEY_API_KEY, KEY_CREATED


def test_serialize_round_trip():
    time = FakeTime()
    creds = FilenCreds(time=time, api_key="abc123")
    serialized = creds.serialize()

    loaded = FilenCreds.load(time=time, data=serialized)

    assert loaded.api_key == "abc123"
    assert loaded.is_configured is True


def test_load_requires_api_key():
    time = FakeTime()

    try:
        FilenCreds.load(time=time, data={KEY_CREATED: time.asRfc3339String(time.now())})
        assert False
    except BaseException as e:
        assert str(e).find(KEY_API_KEY) >= 0


def test_load_invalid_created_falls_back_to_now():
    time = FakeTime()
    loaded = FilenCreds.load(time=time, data={KEY_API_KEY: "k", KEY_CREATED: "not-a-date"})
    assert loaded.created == time.now()
