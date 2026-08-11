import uvicorn
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def start_sidecar(port=8000):
    print(f"Booting LuckAI ChessLab Production Sidecar on port {port}...")
    uvicorn.run("core.api.main:app", host="127.0.0.1", port=port, reload=False)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    start_sidecar(port)
