import json

import matplotlib.pyplot as plt
import pandas as pd
from chronos import Chronos2Pipeline


def main():
    # You can change this to your finetuned model directory (e.g. './chronos-pse-finetuned/final')
    model_path = "amazon/chronos-2"
    print(f"Loading {model_path} for visualization...")

    pipeline = Chronos2Pipeline.from_pretrained(model_path, device_map="cpu")

    # Load one time series from our generated validation dataset
    with open("data/val.jsonl") as f:
        item = json.loads(f.readline())

    prediction_length = 24
    # Use the last 200 points as context, reserving the final 24 as ground truth
    full_series = item["target"]
    history = full_series[-200:-prediction_length]
    ground_truth = full_series[-prediction_length:]

    df = pd.DataFrame(
        {
            "timestamp": pd.date_range(start="2023-01-01", periods=len(history), freq="D"),
            "target": history,
            "id": "pse_stock",
        }
    )

    print("Generating probabilistic forecasts...")
    quantiles = [0.1, 0.5, 0.9]
    pred_df = pipeline.predict_df(
        df,
        prediction_length=prediction_length,
        quantile_levels=quantiles,
        id_column="id",
        timestamp_column="timestamp",
        target="target",
    )

    # Visualization setup
    plt.figure(figsize=(12, 6))

    # X-axis indices
    hist_x = range(len(history))
    future_x = range(len(history), len(history) + prediction_length)

    # Plot historical data
    plt.plot(hist_x, history, label="Historical PSE Data", color="blue")

    # Plot ground truth
    plt.plot(future_x, ground_truth, label="Ground Truth", color="green")

    # Plot forecast median and intervals
    plt.plot(future_x, pred_df["0.5"], label="Median Forecast (q=0.5)", color="purple")
    plt.fill_between(
        future_x,
        pred_df["0.1"],
        pred_df["0.9"],
        color="purple",
        alpha=0.3,
        label="80% Prediction Interval (0.1 to 0.9)",
    )

    plt.title("PSE Stock Forecasting with Chronos-2")
    plt.legend()
    plt.grid(True, alpha=0.3)

    output_img = "forecast_visualization.png"
    plt.savefig(output_img)
    print(f"Saved visualization to {output_img}")


if __name__ == "__main__":
    main()
