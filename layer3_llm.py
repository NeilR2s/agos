import requests
import pandas as pd
import os
from dotenv import load_dotenv

# ── Step 1: Load the API key from the .env file ──────────────────────────────
# This reads your .env file and makes GEMINI_API_KEY available to Python
# Your key never appears anywhere in this code file
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    print("ERROR: No API key found. Make sure your .env file is set up correctly.")
    exit()

print("API key loaded successfully")

# ── Step 2: Load the anomalies from Layer 2 ──────────────────────────────────
# Read the CSV that layer2_ann.py saved
df = pd.read_csv("layer2_anomalies.csv", index_col=0)

# Filter to only the rows flagged as anomalies
anomalies = df[df['Is_Anomaly'] == True].copy()

print(f"\nFound {len(anomalies)} anomalous dates to analyze:")
print(anomalies.index.tolist())

# ── Step 3: Define a function that asks Gemini about one date ────────────────
def ask_gemini(date, close_price, volume):
    # This is the Gemini API endpoint
    url = f"https://generativelanguage.googleapis.com/v1beta/models/3.1-flash-lite-preview:generateContent?key={API_KEY}"

    # This is the question we ask the LLM for each anomalous date
    prompt = f"""
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

    # Package the prompt into the format Gemini expects
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
    }

    # Send the request to Gemini
    response = requests.post(url, json=payload)

    # Check if the request worked
    if response.status_code == 200:
        # Dig into the response to get the text
        result = response.json()
        text = result['candidates'][0]['content']['parts'][0]['text']
        return text.strip()
    else:
        # If something went wrong, show the error
        print(f"API error for {date}: {response.status_code} - {response.text}")
        return "SENTIMENT: Uncertain\nREASON: API call failed."

# ── Step 4: Loop through each anomaly and ask Gemini ─────────────────────────
print("\nAsking Gemini about each anomalous date...")

sentiments = []
reasons = []

for date in anomalies.index:
    close = anomalies.loc[date, 'Close']
    volume = anomalies.loc[date, 'Volume']

    print(f"\nAnalyzing {date}...")
    response_text = ask_gemini(date, close, volume)
    print(response_text)

    # Parse the response to extract sentiment and reason
    sentiment = "Uncertain"
    reason = "Could not parse response"

    for line in response_text.split('\n'):
        if line.startswith("SENTIMENT:"):
            sentiment = line.replace("SENTIMENT:", "").strip()
        if line.startswith("REASON:"):
            reason = line.replace("REASON:", "").strip()

    sentiments.append(sentiment)
    reasons.append(reason)

# ── Step 5: Save the results ─────────────────────────────────────────────────
anomalies['sentiment'] = sentiments
anomalies['reason'] = reasons

anomalies.to_csv("layer3_llm_analysis.csv")
print("\nResults saved to layer3_llm_analysis.csv")
print("\nFinal sentiment summary:")
print(anomalies[['Close', 'sentiment', 'reason']])