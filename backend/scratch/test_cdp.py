import socket
import urllib.request
import json
import sys

print("Testing connection to Chrome Remote Debugging port 9222...")

# 1. Test socket connection to 127.0.0.1
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1.0)
    s.connect(("127.0.0.1", 9222))
    print("[SUCCESS] Socket connected to 127.0.0.1:9222 successfully.")
    s.close()
except Exception as e:
    print(f"[FAIL] Socket connection to 127.0.0.1:9222 failed: {e}")

# 2. Test socket connection to localhost
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1.0)
    s.connect(("localhost", 9222))
    print("[SUCCESS] Socket connected to localhost:9222 successfully.")
    s.close()
except Exception as e:
    print(f"[FAIL] Socket connection to localhost:9222 failed: {e}")

# 3. Test HTTP /json/version
for url in ["http://127.0.0.1:9222/json/version", "http://localhost:9222/json/version"]:
    try:
        print(f"Fetching {url}...")
        with urllib.request.urlopen(url, timeout=2.0) as response:
            body = response.read().decode('utf-8')
            print(f"[SUCCESS] HTTP response status: {response.status}")
            data = json.loads(body)
            print(f"Browser version info: {data.get('Browser')}")
    except Exception as e:
        print(f"[FAIL] HTTP fetch to {url} failed: {e}")

print("CDP Diagnostic complete.")
