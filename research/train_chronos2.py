import json

import numpy as np
import torch
from chronos import Chronos2Pipeline
from chronos.chronos2.dataset import Chronos2Dataset, DatasetMode
from chronos.chronos2.trainer import Chronos2Trainer
from transformers import TrainingArguments


def load_jsonl(path):
    """
    Reads the JSONLines file and extracts the target arrays.
    Returns a list of dictionaries as expected by Chronos2Dataset.
    """
    data = []
    with open(path) as f:
        for line in f:
            item = json.loads(line)
            # Chronos2Dataset expects a 1-d or 2-d target tensor/array for each series
            data.append({"target": np.array(item["target"], dtype=np.float32)})
    return data


def main():
    model_id = "amazon/chronos-2"

    print("Loading datasets...")
    train_inputs = load_jsonl("data/train.jsonl")
    val_inputs = load_jsonl("data/val.jsonl")

    # Initialize pipeline to get model and config
    print(f"Loading base model {model_id}...")
    pipeline = Chronos2Pipeline.from_pretrained(model_id, device_map="auto")
    model = pipeline.model
    config = pipeline.model.config

    # Define forecasting parameters
    prediction_length = 24
    context_length = 512  # Truncate context to recent history
    batch_size = 64

    print("Preparing Chronos2Dataset for training and validation...")
    train_dataset = Chronos2Dataset(
        inputs=train_inputs,
        context_length=context_length,
        prediction_length=prediction_length,
        batch_size=batch_size,
        output_patch_size=config.chronos_config["output_patch_size"],
        min_past=64,  # Minimum sequence length
        mode=DatasetMode.TRAIN,
    )

    val_dataset = Chronos2Dataset(
        inputs=val_inputs,
        context_length=context_length,
        prediction_length=prediction_length,
        batch_size=batch_size,
        output_patch_size=config.chronos_config["output_patch_size"],
        min_past=64,
        mode=DatasetMode.VALIDATION,
    )

    training_args = TrainingArguments(
        output_dir="./chronos-pse-finetuned",
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        learning_rate=1e-4,
        lr_scheduler_type="cosine",
        max_steps=500,  # Set max_steps for infinite IterableDataset
        save_strategy="steps",
        save_steps=25,
        eval_strategy="steps",
        eval_steps=25,
        logging_steps=5,
        # Check if BF16 is supported (useful for H100)
        bf16=torch.cuda.is_bf16_supported(),
        dataloader_num_workers=2,
        report_to="none",  # Disable wandb/tensorboard for clean local test
    )

    trainer = Chronos2Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
    )

    print("Starting training loop...")
    trainer.train()

    print("Saving fine-tuned model...")
    save_path = "./chronos-pse-finetuned/final"
    model.save_pretrained(save_path)
    print(f"Model successfully saved to {save_path}.")
    print("You can load this via Chronos2Pipeline.from_pretrained().")


if __name__ == "__main__":
    main()
