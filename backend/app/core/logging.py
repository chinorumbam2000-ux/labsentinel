"""
Application logging.

Uvicorn configures only its own loggers, so without this LabSentinel's
``app.*`` INFO messages (for example FHIR ingestion outcomes) would be
dropped. Messages carry resource types, source ids, facilities and outcomes
only — never payloads or patient data.
"""

import logging

_HANDLER_NAME = "labsentinel-app"


def configure_logging(level: int = logging.INFO) -> None:
    logger = logging.getLogger("app")
    logger.setLevel(level)
    if not any(handler.get_name() == _HANDLER_NAME for handler in logger.handlers):
        handler = logging.StreamHandler()
        handler.set_name(_HANDLER_NAME)
        handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s: %(message)s"))
        logger.addHandler(handler)
