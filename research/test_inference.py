import requests
import time
import sys


def test_inference():
    url = "http://127.0.0.1:5000"

    # Wait for server to be ready
    print("Checking health...")
    success = False
    for i in range(45):
        try:
            resp = requests.get(f"{url}/health", timeout=2)
            if resp.status_code == 200:
                data = resp.json()
                print(f"[{i}] Status: {data['status']}")
                if data["status"] == "online":
                    success = True
                    break
        except Exception as e:
            print(f"[{i}] Waiting for server... {str(e)}")
        time.sleep(2)

    if not success:
        print("Server failed to start or load model in time.")
        sys.exit(1)

    payload = {
        "history": [10.5, 11.2, 10.8, 12.1, 11.5, 12.0, 11.8, 12.5, 13.0, 12.8],
        "prediction_length": 5,
        "quantiles": [0.1, 0.5, 0.9],
    }

    print("Sending forecast request...")
    response = requests.post(f"{url}/forecast", json=payload)

    if response.status_code == 200:
        print("Success! Response received.")
        print(response.json())
    else:
        print(f"Failed with status {response.status_code}:")
        print(response.text)
        sys.exit(1)


if __name__ == "__main__":
    test_inference()
