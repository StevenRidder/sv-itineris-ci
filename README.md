# SV Itineris

A private voyage-planning workspace with a Tabler interface, MapLibre map and
code-owned scenarios. This first slice imports a local source library, compares
route options, previews duration and geometry changes, and saves draft alternatives.

The assistant is not connected yet. Manual controls call the same typed services
that model tools will use. Planning geometry is not a validated passage.

## Local start

Requires Node 22.12+, Python 3.12 or 3.13, uv and npm.

```sh
uv sync --frozen
npm ci
npm run build
uv run python -m server.cli import --root "/path/to/approved/cruising/folder"
uv run uvicorn server.main:app --host 127.0.0.1 --port 9072
```

Open http://127.0.0.1:9072. The build and API share one origin. For frontend
development, run npm run dev in another terminal and open port 9073.

An empty database shows an import prompt; production never loads synthetic data
automatically. For an isolated demo, import tests/fixtures with a separate
SVITINERIS_DATA_DIR. Runtime data defaults to .data and stays outside Git.

```sh
SVITINERIS_DATA_DIR=.data/demo uv run python -m server.cli import --root tests/fixtures
npm run check
python3 scripts/source_policy.py
```

## Repository roles

- Private canonical: https://github.com/StevenRidder/sv-itineris
- Public CI only: https://github.com/StevenRidder/sv-itineris-ci
- Required status: sv-itineris-ci/gate

Read [the CI runbook](docs/CI.md) before exporting source. Neither repository
contains the private source library or voyage database. The application has no
external hosting or domain changes in this milestone.

See [technical scope](docs/TECHNICAL-SCOPE.md), [architecture](docs/ARCHITECTURE.md)
and [upstream register](docs/UPSTREAM.md).
