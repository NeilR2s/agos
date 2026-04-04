import pandas as pd
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import MinMaxScaler
from config import Config

# Automatically use GPU if available, otherwise fall back to CPU
# This is what "CUDA-ready" means - it works on both without code changes
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {DEVICE}")

# ── Define the Autoencoder as a proper PyTorch class ─────────────────────────
# In PyTorch, models are defined as classes that inherit from nn.Module
# This is the standard pattern used in real ML engineering
class Autoencoder(nn.Module):
    def __init__(self, input_dim):
        # Always call the parent class constructor first
        super(Autoencoder, self).__init__()

        # The encoder compresses 5 features → 3 → 2
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 3),
            nn.ReLU(),
            nn.Linear(3, 2),
            nn.ReLU()
        )

        # The decoder tries to reconstruct 2 → 3 → 5
        self.decoder = nn.Sequential(
            nn.Linear(2, 3),
            nn.ReLU(),
            nn.Linear(3, input_dim)
        )

    def forward(self, x):
        # forward() defines what happens when data passes through the model
        encoded = self.encoder(x)
        decoded = self.decoder(encoded)
        return decoded

# ── Load and prepare data ─────────────────────────────────────────────────────
cfg = Config()

try:
    data = pd.read_csv(cfg.LAYER1_OUTPUT)
    print(f"Loaded {len(data)} rows from {cfg.LAYER1_OUTPUT}")
except FileNotFoundError:
    print(f"Error: Could not find {cfg.LAYER1_OUTPUT}. Run layer1_data.py first.")
    exit()

features = ['Open', 'High', 'Low', 'Close', 'Volume']
market_data = data[features].copy().dropna()

# Scale data to 0-1 range
scaler = MinMaxScaler()
scaled = scaler.fit_transform(market_data)

# Convert to PyTorch tensors and move to GPU/CPU
tensor_data = torch.FloatTensor(scaled).to(DEVICE)
dataset = TensorDataset(tensor_data, tensor_data)
loader = DataLoader(dataset, batch_size=cfg.BATCH_SIZE, shuffle=True)

# ── Build and train the model ─────────────────────────────────────────────────
model = Autoencoder(input_dim=len(features)).to(DEVICE)
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
loss_fn = nn.MSELoss()

print(f"\nTraining Autoencoder for {cfg.EPOCHS} epochs...")

for epoch in range(cfg.EPOCHS):
    total_loss = 0
    for batch_input, batch_target in loader:
        optimizer.zero_grad()           # Clear old gradients
        output = model(batch_input)     # Forward pass
        loss = loss_fn(output, batch_target)  # Calculate loss
        loss.backward()                 # Backpropagation
        optimizer.step()                # Update weights
        total_loss += loss.item()

    # Print progress every 10 epochs
    if (epoch + 1) % 10 == 0:
        print(f"  Epoch {epoch+1}/{cfg.EPOCHS} — Loss: {total_loss/len(loader):.6f}")

print("Training complete!")

# ── Detect anomalies ──────────────────────────────────────────────────────────
model.eval()  # Switch model to evaluation mode (disables dropout etc.)

with torch.no_grad():  # Don't calculate gradients during inference
    reconstructed = model(tensor_data).cpu().numpy()

original = scaled
mse = np.mean(np.power(original - reconstructed, 2), axis=1)

threshold = np.percentile(mse, cfg.ANOMALY_THRESHOLD_PERCENTILE)

data['Anomaly_Score'] = mse
data['Is_Anomaly'] = data['Anomaly_Score'] > threshold

anomalies = data[data['Is_Anomaly'] == True]
print(f"\nFound {len(anomalies)} anomalous days")
print(anomalies[['Date', 'Close', 'Volume', 'Anomaly_Score']])

data.to_csv(cfg.LAYER2_OUTPUT, index=False)
print(f"\nSaved to {cfg.LAYER2_OUTPUT}")