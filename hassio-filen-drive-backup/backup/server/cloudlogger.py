import json
from backup.logger import getLogger, StandardLogger
from injector import inject, singleton

basic_logger = getLogger(__name__)


@singleton
class CloudLogger(StandardLogger):
    @inject
    def __init__(self):
        super().__init__(__name__)
        # Filen builds don't use a cloud logging backend; keep structured logs local.
        self._structured_sink = None

    def log_struct(self, data):
        if self._structured_sink is not None:
            self._structured_sink.log_struct(data)
        else:
            basic_logger.info(json.dumps(data))
