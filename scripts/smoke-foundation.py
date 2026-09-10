"""Start both services using isolated synthetic configuration, then stop them."""
import os
import secrets
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
secret = secrets.token_urlsafe(32)
env = dict(os.environ, NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321",
           NEXT_PUBLIC_SUPABASE_ANON_KEY="synthetic-smoke-only",
           SUPABASE_SERVICE_ROLE_KEY="synthetic-smoke-only",
           DOCUMENT_PROCESSOR_URL="http://127.0.0.1:18000",
           DOCUMENT_PROCESSOR_SECRET=secret)
processes = []
try:
    processes.append(subprocess.Popen(
        ["node", str(root / "node_modules/next/dist/bin/next"), "start", "-p", "13000"],
        cwd=root / "apps/web", env=env))
    processes.append(subprocess.Popen(
        [str(root / "services/document-processor/.venv/bin/uvicorn"), "app.main:app",
         "--host", "127.0.0.1", "--port", "18000"],
        cwd=root / "services/document-processor", env=env))
    for url, headers, expected in [
        ("http://127.0.0.1:13000", {}, b"MedMemory"),
        ("http://127.0.0.1:18000/health", {"x-service-secret": secret}, b"healthy"),
    ]:
        for attempt in range(30):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=headers)) as response:
                    assert response.status == 200
                    assert expected in response.read()
                break
            except urllib.error.URLError:
                if attempt == 29:
                    raise
                time.sleep(0.2)
        print(f"PASS startup: {url}")
finally:
    for process in processes:
        process.terminate()
    for process in processes:
        process.wait(timeout=10)
