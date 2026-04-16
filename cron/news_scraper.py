import asyncio
import os
from datetime import datetime
from typing import List, Optional

from langchain_tavily import TavilySearch
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from base_scraper import BaseScraper
from config import settings


class NewsArticle(BaseModel):
    """Schema for news articles that impact stock prices."""

    date: str = Field(description="The date of the news in YYYY-MM-DD format.")
    url: str = Field(description="The source URL of the news article.")
    title: str = Field(description="The title of the news article.")
    source: str = Field(description="The name of the news organization.")
    tickers: List[str] = Field(
        description="A list of stock ticker symbols affected by this news (e.g., ['SM', 'BDO'], ['TEL'])."
    )
    ticker: str = Field(
        description="The primary stock ticker symbol for database partitioning. Use the most relevant one from the tickers list."
    )
    sentiment_label: str = Field(
        description="The overall sentiment of the news: 'Positive', 'Neutral', or 'Negative'."
    )
    sentiment_score: float = Field(
        description="A sentiment score from -1.0 (very negative) to 1.0 (very positive)."
    )
    summary: str = Field(
        description="A brief summary (1-2 sentences) of why this news impacts the stock price."
    )
    category: str = Field(description="The industry or news category this article belongs to.")


class NewsArticlesResponse(BaseModel):
    """Response model containing a list of news articles."""

    articles: List[NewsArticle]


class NewsScraper(BaseScraper):
    """
    Scraper for news sentiment analysis using Tavily and Gemini.
    """

    TRUSTED_SOURCES = ["philstar.com", "inquirer.net", "businessinsider.com", "bworldonline.com"]
    CATEGORIES = [
        "Financials",
        "Industrial",
        "Holding Firms",
        "Property",
        "Services",
        "Mining&Oil",
        "Regulatory Changes (philippines)",
        "Political (Global News)",
    ]

    def __init__(self, db_client):
        super().__init__(db_client)
        self.tavily = TavilySearch(
            max_results=5, include_domains=self.TRUSTED_SOURCES, search_depth="advanced", tavily_api_key=settings.TAVILY_API_KEY
        )
        self.llm = (
            ChatGoogleGenerativeAI(
                model="gemini-3.1-flash-lite-preview",
                temperature=1,
                google_api_key=settings.GEMINI_API_KEY,
            )
            .bind_tools([{"google_search": {}}])
            .with_structured_output(NewsArticlesResponse)
        )

    async def _scrape_category_agent(self, category: str) -> int:
        """
        An agent dedicated to scraping and analyzing news for a specific category.
        """
        self.logger.info(f"Agent starting for category: {category}")
        try:
            # 1. Search for category-specific news
            query = (
                f"latest Philippine stock market news regarding {category} category "
                f"impacting specific company prices " + " ".join(self.TRUSTED_SOURCES)
            )
            # TavilySearch ainvoke is used for concurrent execution
            search_results = await self.tavily.ainvoke({"query": query})

            if not search_results or "results" not in search_results:
                self.logger.warning(f"No results found for category: {category}")
                return 0

            # 2. Process with Gemini
            context = "\n---\n".join(
                [
                    f"Source: {res['url']}\nContent: {res['content']}"
                    for res in search_results["results"]
                ]
            )

            prompt = f"""
            Analyze the following news context regarding the '{category}' sector in the Philippines.
            Identify specific news articles that significantly impact the stock price of individual companies listed on the Philippine Stock Exchange (PSE).
            
            Rules:
            1. Only include news that is likely to move the stock price of a specific company.
            2. Extract all affected ticker symbols accurately as a list (e.g., ["SM", "BDO"]).
            3. Provide a single primary ticker symbol (the most relevant one) in the 'ticker' field for database partitioning.
            4. Provide a sentiment label and a score between -1.0 and 1.0.
            4. Summarize the impact in 1-2 sentences.
            5. Ensure the date is in YYYY-MM-DD format.
            6. Assign the category as '{category}'.
            7. Use your internal knowledge or Google Search grounding (if available) to verify facts if the context is ambiguous.

            Context:
            {context}
            """

            response = await self.llm.ainvoke(prompt)

            if not response or not response.articles:
                self.logger.info(f"No relevant news found for category: {category}")
                return 0

            # 3. Save to database
            count = 0
            for article in response.articles:
                article_dict = article.model_dump()
                # Use sorted tickers to create a stable hash
                tickers_str = ",".join(sorted(article.tickers))
                article_dict["hash"] = self.generate_hash(article.date, article.url, tickers_str)
                await self.upsert(settings.COSMOS_NEWS_CONTAINER, article_dict)
                count += 1

            self.logger.info(f"Agent for {category} processed {count} news items.")
            return count

        except Exception as e:
            self.logger.error(f"Agent for {category} failed: {e}")
            return 0

    async def scrape_and_process(self) -> bool:
        self.logger.info("Starting multi-agent news sentiment scraping...")

        try:
            tasks = []
            async with asyncio.TaskGroup() as tg:
                for category in self.CATEGORIES:
                    tasks.append(tg.create_task(self._scrape_category_agent(category)))

            total_items = sum(t.result() for t in tasks)
            self.logger.info(f"Multi-agent news scraping completed. Total processed: {total_items}")
            return True

        except Exception as e:
            self.logger.error(f"Error in multi-agent news sentiment scraper: {e}")
            return False
