import requests
import time
import subprocess
import os

print("--- LuckAI ChessLab Core Smoke Test ---")
sidecar_process = subprocess.Popen([".venv\\Scripts\\python", "core\\sidecar.py"])
time.sleep(3)

try:
    resp = requests.get("http://127.0.0.1:8000/api/v1/system/health")
    print("Health check:", resp.json())
    
    resp = requests.get("http://127.0.0.1:8000/api/v1/games/42")
    if resp.status_code == 200:
        print("Game fetch: SUCCESS")
    else:
        print("Game fetch: FAILED", resp.text)
finally:
    sidecar_process.kill()
