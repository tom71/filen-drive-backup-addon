from backup.model import FilenBackup


def test_filenbackup_parses_required_fields():
    backup = FilenBackup({
        "uuid": "file-1",
        "region": "de-1",
        "size": 123,
        "metadata": {
            "name": "HA Backup",
            "slug": "abc",
            "date": "2026-03-13T11:12:13Z",
            "type": "full",
            "retained": True,
            "protected": False,
        },
    })

    assert backup.id() == "file-1"
    assert backup.region() == "de-1"
    assert backup.slug() == "abc"
    assert backup.name() == "HA Backup"
    assert backup.size() == 123
    assert backup.retained() is True
