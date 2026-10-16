# SV Itineris contributor guide

Read README.md, docs/TECHNICAL-SCOPE.md, docs/ARCHITECTURE.md and docs/CI.md first.

- Private StevenRidder/sv-itineris is canonical. Public StevenRidder/sv-itineris-ci is verification-only and contains the full source tree.
- Never commit private source documents, photos, itineraries, signed forms, credentials, runtime databases, exports or local browser evidence. Use synthetic fixtures in Git and CI.
- Use Tabler, MapLibre and Terra Draw. Keep the browser thin; Python application services own dates, constraints, provenance and persistence. No React or second design system.
- Planning saves create draft alternatives. Never send route.create, route.activate, boat commands, forms, bookings or messages from this application.
- Preserve source date precision and unresolved conditions. Model text cannot make a route, permission or forecast verified.
- Manual controls and future model tools call the same services. Do not execute model-generated code, SQL or filesystem paths.
- Source prose remains in its configured import root; import is read-only. Saved web scenarios remain in the backend. No bidirectional sync.
- Keep local previews on loopback and a dedicated port. This pilot has no hosted authentication and must not be exposed as a public service.
- Preserve upstream notices and record adapted files in docs/UPSTREAM.md. Do not copy the OpenCPN runtime.
- Run npm run check, python3 scripts/source_policy.py and git diff --check. Public CI must pass for the exact canonical SHA before its status is recorded.
- After initial repository bootstrap, use branches and private PRs. Main requires sv-itineris-ci/gate. Public CI is not merge or deployment authority. A merge or release candidate needs its own exact-SHA proof.
