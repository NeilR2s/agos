import pandas as pd

# ── Step 1: Load the results from Layer 3 ────────────────────────────────────
# This reads the CSV that layer3_llm.py saved, which contains:
# - The 7 anomalous dates detected by our Autoencoder
# - The closing price on each date
# - The sentiment (Bullish/Bearish/Uncertain) from the LLM
df = pd.read_csv("layer3_llm_analysis.csv", index_col=0)

print("=== MINI-AGOS PAPER TRADING ENGINE ===")
print(f"Analyzing {len(df)} anomalous trading days...\n")

# ── Step 2: Define our simulated portfolio ────────────────────────────────────
# This is fake money - no real trades are being made
STARTING_CAPITAL = 200000  # PHP equivalent in mind, but EPHE trades in USD
CAPITAL = STARTING_CAPITAL
SHARES_HELD = 0
TRADE_LOG = []

# ── Step 3: Define the risk management rules ─────────────────────────────────
# These are the hard-coded safeguards, just like the real AGOS trading engine
MAX_RISK_PERCENT = 0.10   # Never risk more than 10% of capital on one trade
STOP_LOSS_PERCENT = 0.05  # Assume a 5% stop loss below entry price

# ── Step 4: Loop through each anomalous date and make a decision ──────────────
# This is the "zero-trust validation layer" - every proposed trade must
# pass all checks before it gets approved

for date, row in df.iterrows():
    close_price = row['Close']
    sentiment = row['sentiment']
    reason = row['reason']
    anomaly_score = row['Anomaly_Score']

    print(f"--- Date: {date} ---")
    print(f"  Close Price : ${close_price:.2f}")
    print(f"  Anomaly Score: {anomaly_score:.6f}")
    print(f"  LLM Sentiment: {sentiment}")
    print(f"  LLM Reason   : {reason}")

    # ── Risk Check 1: Capital sufficiency ─────────────────────────────────
    # Can we even afford to buy at least 1 share?
    if CAPITAL < close_price:
        print(f"  RISK CHECK FAILED: Not enough capital (${CAPITAL:.2f}) to buy at ${close_price:.2f}")
        print(f"  DECISION: REJECTED\n")
        TRADE_LOG.append({
            'date': date,
            'action': 'REJECTED',
            'reason': 'Insufficient capital',
            'capital_after': CAPITAL,
            'shares_held': SHARES_HELD
        })
        continue

    # ── Risk Check 2: Position sizing ─────────────────────────────────────
    # How many shares can we buy without risking more than 10% of capital?
    # Formula: position_size = (capital x max_risk) / (entry - stop_loss)
    stop_loss_price = close_price * (1 - STOP_LOSS_PERCENT)
    risk_per_share = close_price - stop_loss_price
    max_risk_amount = CAPITAL * MAX_RISK_PERCENT
    position_size = int(max_risk_amount / risk_per_share)  # round down to whole shares

    if position_size < 1:
        print(f"  RISK CHECK FAILED: Position size too small (would be 0 shares)")
        print(f"  DECISION: REJECTED\n")
        TRADE_LOG.append({
            'date': date,
            'action': 'REJECTED',
            'reason': 'Position size too small',
            'capital_after': CAPITAL,
            'shares_held': SHARES_HELD
        })
        continue

    # ── Decision logic: combine ANN signal + LLM sentiment ────────────────
    # This is the core of the engine - both signals must agree to trade
    #
    # BUY  condition: sentiment is Bullish  AND anomaly score is high
    # SELL condition: sentiment is Bearish  AND we actually own shares
    # HOLD condition: sentiment is Uncertain OR signals disagree

    if sentiment == "Bullish":
        # Calculate cost of this trade
        trade_cost = position_size * close_price

        if trade_cost > CAPITAL:
            # Adjust position size down if needed
            position_size = int(CAPITAL / close_price)
            trade_cost = position_size * close_price

        # Execute the simulated BUY
        CAPITAL -= trade_cost
        SHARES_HELD += position_size

        print(f"  DECISION: BUY {position_size} shares at ${close_price:.2f}")
        print(f"  Trade Cost   : ${trade_cost:.2f}")
        print(f"  Capital Left : ${CAPITAL:.2f}")
        print(f"  Shares Held  : {SHARES_HELD}\n")

        TRADE_LOG.append({
            'date': date,
            'action': f'BUY {position_size} shares',
            'price': close_price,
            'trade_cost': trade_cost,
            'capital_after': CAPITAL,
            'shares_held': SHARES_HELD
        })

    elif sentiment == "Bearish" and SHARES_HELD > 0:
        # Sell all shares we currently hold
        trade_value = SHARES_HELD * close_price
        CAPITAL += trade_value

        print(f"  DECISION: SELL {SHARES_HELD} shares at ${close_price:.2f}")
        print(f"  Trade Value  : ${trade_value:.2f}")
        print(f"  Capital Now  : ${CAPITAL:.2f}")
        print(f"  Shares Held  : 0\n")

        TRADE_LOG.append({
            'date': date,
            'action': f'SELL {SHARES_HELD} shares',
            'price': close_price,
            'trade_value': trade_value,
            'capital_after': CAPITAL,
            'shares_held': 0
        })
        SHARES_HELD = 0

    else:
        # Uncertain sentiment or Bearish but no shares to sell - do nothing
        print(f"  DECISION: HOLD — signals not strong enough to act\n")

        TRADE_LOG.append({
            'date': date,
            'action': 'HOLD',
            'capital_after': CAPITAL,
            'shares_held': SHARES_HELD
        })

# ── Step 5: Final portfolio summary ──────────────────────────────────────────
print("=" * 40)
print("FINAL PORTFOLIO SUMMARY")
print("=" * 40)

# Calculate the current value of any shares still held
# Using the last known closing price
last_price = df['Close'].iloc[-1]
portfolio_value = CAPITAL + (SHARES_HELD * last_price)

print(f"Starting Capital : ${STARTING_CAPITAL:.2f}")
print(f"Remaining Cash   : ${CAPITAL:.2f}")
print(f"Shares Still Held: {SHARES_HELD} (valued at ${SHARES_HELD * last_price:.2f})")
print(f"Total Portfolio  : ${portfolio_value:.2f}")
print(f"Net Change       : ${portfolio_value - STARTING_CAPITAL:.2f}")
print("=" * 40)
print("*** THIS IS A PAPER TRADE SIMULATION - NO REAL MONEY WAS USED ***")

# ── Step 6: Save the trade log ────────────────────────────────────────────────
trade_df = pd.DataFrame(TRADE_LOG)
trade_df.to_csv("layer4_trade_log.csv", index=False)
print("\nTrade log saved to layer4_trade_log.csv")
