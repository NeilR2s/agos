# PSE Chronos-2 Time-Series Forecasting Pipeline

This repository contains the end-to-end pipeline for fine-tuning, evaluating, and serving the `amazon/chronos-2` foundation model for univariate Philippine Stock Exchange (PSE) time-series forecasting.

## 🚀 Overview

- **`prepare_pse_data.py`**: Generates mock PSE stock trajectories (using a random walk model) and stores them in GluonTS JSONLines (`.jsonl`) format. 
- **`train_chronos2.py`**: Fine-tunes the `amazon/chronos-2` model utilizing the official `Chronos2Dataset` and `Chronos2Trainer` hooks. Ready for Colab H100 execution.
- **`app.py`**: A FastAPI application providing a REST interface (`/forecast`). Configured strictly for CPU deployments via **PyTorch 8-bit dynamic quantization**, significantly reducing the RAM footprint.
- **`visualize.py`**: Validates the model outputs graphically with Matplotlib, showing standard and `0.9` upper-bound quantiles against the ground truth.

## 💻 1. Local Testing

To test the workflow on your local machine:

1. **Install Dependencies:**
   Ensure you have the dependencies from `requirements.txt`.
   ```bash
   pip install -r requirements.txt
   pip install "chronos-forecasting>=2.0"
   ```

2. **Generate Mock Data:**
   ```bash
   python prepare_pse_data.py
   ```
   This will create a `data/` folder with `train.jsonl` and `val.jsonl`.

3. **Run a Quick Fine-Tuning Test:**
   ```bash
   python train_chronos2.py
   ```
   *Note: This runs for 3 epochs with a small batch size. The output model is saved to `./chronos-pse-finetuned/final/`.*

4. **Visualize the Results:**
   ```bash
   python visualize.py
   ```
   Check out `forecast_visualization.png` to review the probabilistic bands (including your specified `q=0.9`).

## ☁️ 2. Scaling up on Google Colab (H100)

1. Upload the `data/` folder and `train_chronos2.py` script to your Google Colab environment.
2. Inside the Colab Notebook, install the packages:
   ```bash
   !pip install "chronos-forecasting>=2.0" transformers torch pandas
   ```
3. Update `train_chronos2.py` if desired:
   - Increase `batch_size` (e.g., 32 or 64).
   - Increase `num_train_epochs`.
   - Ensure the runtime is set to **H100**. `torch.cuda.is_bf16_supported()` will automatically enable BF16 precision for faster training.
4. Run the training script via bash cell:
   ```bash
   !python train_chronos2.py
   ```
5. Download the `./chronos-pse-finetuned/final/` directory upon completion.

## 🌐 3. Deploying to Azure App Service (CPU)

Your target Azure App Service runs FastAPI on a CPU-only environment with limited RAM.

1. Ensure the `app.py` script is set as your application entry point.
2. The `app.py` script automatically runs `torch.ao.quantization.quantize_dynamic`, converting the model from FP32 to INT8. This fits perfectly within restrictive memory bounds while preserving inference speed.
3. Start the application locally to test the API:
   ```bash
   uvicorn app:app --host 0.0.0.0 --port 5000
   ```
4. Query the API:
   ```bash
   curl -X POST http://localhost:5000/forecast \
        -H "Content-Type: application/json" \
        -d '{
              "history": [100.1, 101.2, 100.5, 99.8, 102.1, 103.5, 104.2, 105.1, 104.8, 106.2, 107.1],
              "prediction_length": 5,
              "quantiles": [0.1, 0.5, 0.9]
            }'
   ```
