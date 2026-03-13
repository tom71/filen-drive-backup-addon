class FilenError(Exception):
    pass


class FilenAuthError(FilenError):
    pass


class FilenRateLimitError(FilenError):
    pass


class FilenTimeoutError(FilenError):
    pass


class FilenConnectionError(FilenError):
    pass


class FilenUnexpectedResponseError(FilenError):
    pass
