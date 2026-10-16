# Architecture

One FastAPI process serves the built Tabler client and a typed JSON API. Plain
Python functions implement schedule changes. SQLite stores imported source
revisions, baseline versions, preview proposals, draft alternatives and save keys.

The importer reads a configured folder and ignores ALL, archives, technical-scope
exports and unapproved file types. Original Markdown and the scenario seed are
versioned in the private database. Local image bytes are copied to private asset
storage. Remote photos remain references. Source paths are provenance, never
browser URLs or model-controlled read paths.

Imports never alter source files. Reimport is idempotent. A changed source
increments the library revision and invalidates unsaved previews. Baseline
scenario history is retained; previously saved drafts are not overwritten.

Calendar dates use datetime.date; receipt timestamps use UTC. A changed stay
moves subsequent blocks while preserving their durations and imported gaps.
Unknown passage allowances and month windows remain unresolved. A draft can be
saved with unresolved planning conditions; saving cannot grant permission.

Terra Draw emits a LineString preview through an adapter ported from Helm. It
has no navigation socket or boat endpoint. Rendering and transient drag feedback
stay in the browser; the backend owns schedule values and saved state.

Saving requires the stored proposal, base revision and library revision to remain
current. An idempotency key binds the proposal and name to one resulting draft.
No model tool or browser argument can select another principal.

This is a single-owner local pilot. It binds to loopback, rejects unknown Host
and browser Origin values, disables cross-origin access and accepts JSON mutations
only. Hosted identity, HTTPS, backups and access review precede external hosting.
The local assistant adapter spawns the user's authenticated Codex app-server over
stdio. It disables inherited MCP servers/apps, web search, memories and execution
environments. Only bounded planner dynamic tools are exposed. Unexpected server
requests fail closed. There is no provider billing fallback or credential in the
browser. Codex owns inference and thread history; SQLite stores chat transcripts
and opaque thread mappings. Each chat serializes its turns and each turn receives
the current view context. Previews compose through the same service as manual
controls; model text does not directly update the map or save records. The browser
applies typed selection/proposal events. Interrupted turns remain incomplete.
Weather, booking and clearance services are not connected.

Map imagery is fetched directly by the browser from two explicitly allowed tile
origins. Providers never receive the private library, chat transcript or scenario
database. The local coastline stays underneath online basemaps. Layer switching
changes visibility without replacing MapLibre's style, so camera, draft geometry
and Terra Draw remain intact. Map and layer preferences are local browser state.
Measurements use bounded Geometry input and a stateless Python great-circle
calculation. Editing a draft chains onto its existing proposal through the same
revision-checked service as chat. Map clicks prefill a question only; they do not
send a model request. See MAPS.md for sources and operational limits.
