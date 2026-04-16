import json
import os

import numpy as np
import pandas as pd


def generate_mock_pse_data(num_series=50, length=1000):
    """
    Generates mock PSE stock data (univariate time-series).
    Uses a random walk to simulate realistic stock trajectories.
    """
    data = []
    # Arbitrary start date for the simulation
    start_date = pd.Timestamp("2020-01-01 00:00:00")

    for i in range(num_series):
        # Random walk with some volatility (2% daily) and drift (0.05% daily)
        returns = np.random.normal(loc=0.0005, scale=0.02, size=length)
        # Starting price at 100 PHP
        prices = 100 * np.exp(np.cumsum(returns))

        data.append(
            {
                "start": str(start_date),
                "target": prices.tolist(),
                "item_id": f"PSE_STOCK_{i}",
            }
        )
    return data


def save_jsonl(data, path):
    """
    Saves the data list of dictionaries into a GluonTS-compatible JSONLines format.
    """
    with open(path, "w") as f:
        for item in data:
            f.write(json.dumps(item) + "\n")


if __name__ == "__main__":
    print("Generating mock PSE data...")
    # Generate 40 series for training and 10 series for validation
    train_data = generate_mock_pse_data(num_series=40, length=1000)
    val_data = generate_mock_pse_data(num_series=10, length=1000)

    os.makedirs("data", exist_ok=True)
    save_jsonl(train_data, "data/train.jsonl")
    save_jsonl(val_data, "data/val.jsonl")
    print("Data successfully saved to data/train.jsonl and data/val.jsonl.")
