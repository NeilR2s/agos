import pandas as pd
from config import Config

class RiskEngine:
    """
    Validates whether a proposed trade passes all risk checks.
    Mirrors the zero-trust trading engine concept from the AGOS proposal.
    """

    def __init__(self, config):
        self.cfg = config

    def check_capital(self, capital, price):
        if capital < price:
            return False, f"Insufficient capital (${capital:.2f}) to buy at ${price:.2f}"
        return True, "OK"

    def calculate_position_size(self, capital, price):
        stop_loss = price * (1 - self.cfg.STOP_LOSS_PERCENT)
        risk_per_share = price - stop_loss
        max_risk = capital * self.cfg.MAX_RISK_PERCENT
        size = int(max_risk / risk_per_share)
        if size < 1:
            return 0, "Position size too small"
        return size, "OK"


class TradingEngine:
    """
    Makes final BUY/SELL/HOLD decisions by combining
    the ANN anomaly signal with the LLM sentiment signal.
    """

    def __init__(self):
        self.cfg = Config()
        self.risk = RiskEngine(self.cfg)
        self.capital = self.cfg.STARTING_CAPITAL
        self.shares_held = 0
        self.trade_log = []

    def process(self, date, close_price, sentiment, reason, anomaly_score):
        print(f"\n--- {date} ---")
        print(f"  Price: ${close_price:.2f} | Score: {anomaly_score:.6f} | Sentiment: {sentiment}")

        # Risk check 1: capital
        ok, msg = self.risk.check_capital(self.capital, close_price)
        if not ok:
            print(f"  REJECTED: {msg}")
            self._log(date, 'REJECTED', msg)
            return

        # Risk check 2: position size
        size, msg = self.risk.calculate_position_size(self.capital, close_price)
        if size < 1:
            print(f"  REJECTED: {msg}")
            self._log(date, 'REJECTED', msg)
            return

        # Decision
        if sentiment == "Bullish":
            cost = min(size, int(self.capital / close_price)) * close_price
            size = int(cost / close_price)
            self.capital -= cost
            self.shares_held += size
            print(f"  BUY {size} shares — Cost: ${cost:.2f} | Cash left: ${self.capital:.2f}")
            self._log(date, f'BUY {size}', reason, close_price, cost)

        elif sentiment == "Bearish" and self.shares_held > 0:
            value = self.shares_held * close_price
            self.capital += value
            print(f"  SELL {self.shares_held} shares — Value: ${value:.2f} | Cash: ${self.capital:.2f}")
            self._log(date, f'SELL {self.shares_held}', reason, close_price, value)
            self.shares_held = 0

        else:
            print(f"  HOLD — {reason}")
            self._log(date, 'HOLD', reason)

    def _log(self, date, action, reason, price=None, amount=None):
        self.trade_log.append({
            'date': date,
            'action': action,
            'price': price,
            'amount': amount,
            'reason': reason,
            'capital_after': self.capital,
            'shares_held': self.shares_held
        })

    def summary(self):
        cfg = self.cfg
        last_price = pd.read_csv(cfg.LAYER3_OUTPUT, index_col=0)['Close'].iloc[-1]
        total = self.capital + (self.shares_held * last_price)
        print("\n" + "=" * 40)
        print("FINAL PORTFOLIO SUMMARY")
        print("=" * 40)
        print(f"Starting Capital : ${cfg.STARTING_CAPITAL:.2f}")
        print(f"Remaining Cash   : ${self.capital:.2f}")
        print(f"Shares Held      : {self.shares_held} (${self.shares_held * last_price:.2f})")
        print(f"Total Value      : ${total:.2f}")
        print(f"Net Change       : ${total - cfg.STARTING_CAPITAL:.2f}")
        print("=" * 40)
        print("*** PAPER TRADE SIMULATION — NO REAL MONEY ***")

    def save(self):
        pd.DataFrame(self.trade_log).to_csv(self.cfg.LAYER4_OUTPUT, index=False)
        print(f"\nTrade log saved to {self.cfg.LAYER4_OUTPUT}")


def run_layer4():
    cfg = Config()
    df = pd.read_csv(cfg.LAYER3_OUTPUT, index_col=0)

    engine = TradingEngine()
    print("=== MINI-AGOS PAPER TRADING ENGINE ===")

    for date, row in df.iterrows():
        engine.process(
            date=date,
            close_price=row['Close'],
            sentiment=row['sentiment'],
            reason=row['reason'],
            anomaly_score=row['Anomaly_Score']
        )

    engine.summary()
    engine.save()


if __name__ == "__main__":
    run_layer4()