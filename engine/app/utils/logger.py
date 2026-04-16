import logging
import json
import sys
from datetime import datetime, UTC


class JSONFormatter(logging.Formatter):
    """
    Formatter that outputs JSON strings after parsing the LogRecord.
    """

    def format(self, record):
        log_record = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "module": record.module,
            "message": record.getMessage(),
        }
        if hasattr(record, "extra_info"):
            log_record["extra_info"] = record.extra_info

        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_record)


def get_engine_logger(name="agos.engine"):
    from app.core.config import settings
    logger = logging.getLogger(name)
    
    # Avoid adding handlers multiple times if instantiated repeatedly
    if not logger.handlers:
        logger.setLevel(settings.log_level_int)
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JSONFormatter())
        logger.addHandler(handler)
        
    return logger
