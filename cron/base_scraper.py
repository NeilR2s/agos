import asyncio
import hashlib
import logging
from abc import ABC, abstractmethod
from contextlib import asynccontextmanager

from curl_cffi.requests import AsyncSession as CurlSession
from curl_cffi.requests.exceptions import RequestException
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession as SQLASession
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from logger import setup_logger


class BaseScraper(ABC):
    """
    Abstract base class for all data scrapers.

    Provides standard database session injection, initialized logging,
    concurrency control, and robust async HTTP client with retries.
    """

    def __init__(self, db_session: SQLASession, max_concurrency: int = 10):
        self.db_session = db_session
        self.logger = setup_logger(self.__class__.__name__)
        self._semaphore = asyncio.Semaphore(max_concurrency)

    @property
    def name(self) -> str:
        """Returns the class name for logging purposes."""
        return self.__class__.__name__

    @asynccontextmanager
    async def get_http_session(self, impersonate: str = "chrome"):
        """Context manager for curl_cffi AsyncSession."""
        async with CurlSession(impersonate=impersonate) as session:
            yield session

    @retry(
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=1, min=4, max=60),
        retry=retry_if_exception_type((RequestException, ConnectionError, TimeoutError)),
        before_sleep=before_sleep_log(logging.getLogger("BaseScraper"), logging.WARNING)
    )
    async def fetch(self, session: CurlSession, method: str, url: str, **kwargs):
        """
        Executes HTTP requests with concurrency control and exponential backoff.
        """
        async with self._semaphore:
            if method.upper() == "GET":
                response = await session.get(url, **kwargs)
            elif method.upper() == "POST":
                response = await session.post(url, **kwargs)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            response.raise_for_status()
            return response

    def generate_hash(self, *args) -> str:
        """Generates a SHA256 hash from provided string arguments."""
        content = "_".join(str(arg) for arg in args)
        return hashlib.sha256(content.encode()).hexdigest()

    async def upsert(self, model, values: dict):
        """
        Performs a SQLite 'upsert' based on the 'hash' column.
        If hash already exists, this does nothing.
        """
        stmt = sqlite_insert(model).values(**values).on_conflict_do_nothing(index_elements=["hash"])
        await self.db_session.execute(stmt)

    @abstractmethod
    async def scrape_and_process(self) -> bool:
        """Main execution method to be implemented by child classes."""
        pass
