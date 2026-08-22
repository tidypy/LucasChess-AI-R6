import uvicorn
import sys
import os
import socket
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0

def start_sidecar(port=8000):
    print(f"Booting DeepScout Production Sidecar on port {port}...")
    if is_port_in_use(port):
        print(f"Notice: Port {port} is already active. Sidecar is running.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            return
    uvicorn.run("core.api.main:app", host="127.0.0.1", port=port, reload=False)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    start_sidecar(port)
