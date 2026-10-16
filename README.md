# SV Itineris

A private voyage-planning workspace with a Tabler interface, MapLibre map and
code-owned scenarios. This first slice imports a local source library, compares
route options, previews duration and geometry changes, and saves draft alternatives.

Chat uses a local Codex app-server signed in with ChatGPT. It can search/read
guides with source receipts, display existing route options, preview date/stay
changes and draw destination routes. Manual controls use the same Python services.
Planning geometry is not a validated passage. The model has no save tool.

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

Install a current official Codex CLI and run `codex login` with ChatGPT first.
The app uses that existing subscription session and configured model, with no
API-key fallback. Usage shares your plan limits. On macOS it prefers the runtime
already bundled with ChatGPT; `SVITINERIS_CODEX_BIN` can select a current binary.
Credentials remain in Codex's credential store and never reach the browser, Git
or public CI. Chat history is private local data. Only retrieved guide excerpts
and planning data requested during chat are sent through Codex to the model.
New chat starts a separate conversation while preserving the current map view.
Date edits chain onto the displayed preview. Route sketches change geometry only;
their calendar is unchanged. Unknown and month-level dates remain unresolved.

See [the assistant contract](docs/ASSISTANT.md) and [hosting options](docs/HOSTING.md).
The [interactive map](docs/MAPS.md) adds satellite/coastal/street views, selectable
overlays, point inspection, measurement and editable draft routes. Public imagery
loads online with provider attribution; Simple overview stays local. No tile key
is required for this personal pilot.

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
