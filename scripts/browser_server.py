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
from server.main import create_app
from tests.fake_codex import FakeCodex
uvicorn.run(create_app(assistant_factory=FakeCodex), host="127.0.0.1", port=9082, log_level="warning")
