import argparse
import json
import os

from server.adapters.importer import import_folder
from server.adapters.store import Store


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["import"])
    parser.add_argument("--root", required=True)
    args = parser.parse_args()
    store = Store(os.environ.get("SVITINERIS_DATA_DIR", ".data"))
    print(json.dumps(import_folder(store, args.root), indent=2))


if __name__ == "__main__":
    main()
