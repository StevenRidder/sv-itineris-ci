import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
os.environ["SVITINERIS_DATA_DIR"] = str(root / ".data/browser")
from server.adapters.importer import import_folder
from server.adapters.store import Store
import_folder(Store(os.environ["SVITINERIS_DATA_DIR"]), root / "tests/fixtures")
import uvicorn
uvicorn.run("server.main:app", host="127.0.0.1", port=9082, log_level="warning")
