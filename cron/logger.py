import logging
import sys


def setup_logger(name="Pipeline", level=logging.INFO):
    """
    Sets up a standardized logger for the application.

    Args:
        name (str): Name of the logger, typically __name__ or class name.
        level (int): Logging level (default: logging.INFO).

    Returns:
        logging.Logger: Configured logger instance.
    """
    logger = logging.getLogger(name)

    # Avoid adding multiple handlers if logger is already set up
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(level)

    return logger

# Create a root logger configuration that other modules can inherit from
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
