from typing import Any, Dict

from backup.const import SOURCE_FILEN
from backup.exceptions import ensureKey
from backup.time import Time

from .backups import AbstractBackup, PROP_NOTE, PROP_PROTECTED, PROP_RETAINED, PROP_TYPE, PROP_VERSION

FILEN_KEY_TEXT = "Filen backup metadata"


class FilenBackup(AbstractBackup):
    def __init__(self, data: Dict[Any, Any]):
        metadata = ensureKey("metadata", data, FILEN_KEY_TEXT)
        super().__init__(
            name=ensureKey("name", metadata, FILEN_KEY_TEXT),
            slug=ensureKey("slug", metadata, FILEN_KEY_TEXT),
            date=Time.parse(ensureKey("date", metadata, FILEN_KEY_TEXT)),
            size=int(ensureKey("size", data, FILEN_KEY_TEXT)),
            source=SOURCE_FILEN,
            backupType=metadata.get(PROP_TYPE, "?"),
            version=metadata.get(PROP_VERSION),
            protected=bool(metadata.get(PROP_PROTECTED, False)),
            retained=bool(metadata.get(PROP_RETAINED, False)),
            uploadable=False,
            details=None,
            note=metadata.get(PROP_NOTE),
            pending=False,
        )
        self._id = ensureKey("uuid", data, FILEN_KEY_TEXT)
        self._region = data.get("region")
        self._key = metadata.get("file_key")

    def id(self) -> str:
        return self._id

    def region(self) -> str | None:
        return self._region

    def fileKey(self) -> str | None:
        return self._key

    def __str__(self) -> str:
        return "<Filen: {0} Name: {1} Id: {2}>".format(self.slug(), self.name(), self.id())
