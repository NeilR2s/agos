import requests
import pandas as pd
import time
from config import settings

class SentimentAgent:
    """
    Handles all communication with the LLM API.
    Class-based so it can be easily swapped for a different provider later.
    """

    def __init__(self):
        # Validate key on startup
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY not found in .env file")
        self.url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.AI_MODEL_VERSION}:generateContent?key={settings.GEMINI_API_KEY}"
        print(f"SentimentAgent initialized with model: {settings.AI_MODEL_VERSION}")

    def build_prompt(self, date, close_price, volume):
        # Builds the prompt string for a given anomalous date
        return f"""
        You are a financial analyst assistant.

        On {date}, the iShares MSCI Philippines ETF (EPHE) showed unusual trading activity.
        - Closing price: {close_price:.2f}
        - Volume: {volume:,.0f}

        Based on your knowledge of Philippine market events around this date,
        what was the likely market sentiment?

        Reply with ONLY this format, nothing else:
        SENTIMENT: [Bullish/Bearish/Uncertain]
        REASON: [One sentence explanation]
        """

    def call_api(self, prompt):
        # Sends one prompt to the LLM and returns the raw text response
        payload = {
            "contents": [{"parts": [{"text": prompt}]}]
        }
        response = requests.post(self.url, json=payload)

        if response.status_code == 200:
            return response.json()['candidates'][0]['content']['parts'][0]['text'].strip()
        else:
            print(f"  API error {response.status_code}: {response.text}")
            return "SENTIMENT: Uncertain\nREASON: API call failed."

    def parse_response(self, text):
        # Extracts sentiment and reason from the LLM's formatted response
        sentiment = "Uncertain"
        reason = "Could not parse response"
        for line in text.split('\n'):
            if line.startswith("SENTIMENT:"):
                sentiment = line.replace("SENTIMENT:", "").strip()
            if line.startswith("REASON:"):
                reason = line.replace("REASON:", "").strip()
        return sentiment, reason

    def analyze(self, date, close_price, volume):
        # Full pipeline: build prompt → call API → parse → return result
        prompt = self.build_prompt(date, close_price, volume)
        raw_response = self.call_api(prompt)
        sentiment, reason = self.parse_response(raw_response)
        return sentiment, reason


def run_layer3():

    # Load anomalies from Layer 2
    df = pd.read_csv(settings.LAYER2_OUTPUT, index_col=0)
    anomalies = df[df['Is_Anomaly'] == True].copy()
    print(f"Found {len(anomalies)} anomalous dates to analyze")

    # Create agent and analyze each date
    agent = SentimentAgent()
    sentiments, reasons = [], []

    for date in anomalies.index:
        close = anomalies.loc[date, 'Close']
        volume = anomalies.loc[date, 'Volume']

        print(f"\nAnalyzing {date}...")
        sentiment, reason = agent.analyze(date, close, volume)
        print(f"  {sentiment} — {reason}")

        sentiments.append(sentiment)
        reasons.append(reason)

        # Wait 2 seconds between calls to avoid hitting rate limits
        time.sleep(2)

    anomalies['sentiment'] = sentiments
    anomalies['reason'] = reasons
    anomalies.to_csv(settings.LAYER3_OUTPUT)
    print(f"\nSaved to {settings.LAYER3_OUTPUT}")


if __name__ == "__main__":
    run_layer3()