import yfinance as yf
import pandas as pd

# EPHE added as the primary target for clean, high-volume data
# The others remain as your brilliant fallback safety net
TICKERS_TO_TRY = ["EPHE", "PSEI.PS", "BDOUY", "BPHLY"]

data = None
used_ticker = None

# Loop through each ticker and stop at the first one that returns data
for ticker in TICKERS_TO_TRY:
    print(f"Trying {ticker}...")
    
    # We use Ticker().history() because it creates a much cleaner CSV for Layer 2
    stock = yf.Ticker(ticker)
    downloaded = stock.history(period="6mo")
    
    # Check if the dataframe actually has rows
    if not downloaded.empty:
        data = downloaded
        used_ticker = ticker
        print(f"Success! Got data for {ticker}")
        break  # Exit the loop immediately since we found good data
    else:
        print(f"{ticker} returned no data, trying next...")

# If the loop finished and we actually got data, show it and save it
if data is not None:
    print("\nData Preview:")
    print(data.head())
    
    # Save with a clear filename so Layer 2 knows exactly where to look
    filename = f"layer1_{used_ticker.replace('.', '_')}_data.csv"
    data.to_csv(filename)
    print(f"\nData saved to {filename}")
else:
    print("\nAll tickers failed. Check your internet connection.")