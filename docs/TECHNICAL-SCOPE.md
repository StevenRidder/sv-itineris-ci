# Technical scope — engineering source

This repository is the engineering authority from bootstrap onward. The original
discussion document remains in the private SimpleMark library as a review source.
Its private voyage examples and screenshot are not published to public CI.

## Product boundary

Private household planning first: import guides and scenario seeds, compare
alternative destination orders, inspect source-linked places, preview changes,
and save named draft scenarios. Every route and date stays uncommitted until the
user explicitly changes that state in a future supported workflow.

## Foundation implemented here

- FastAPI/Pydantic contracts and plain Python date rules.
- SQLite source revisions, scenario history, proposals and idempotent saves.
- Read-only Markdown/JSON import with local assets and source provenance.
- Tabler/TypeScript interface, MapLibre destination overview and Terra Draw adapter.
- A–E scenario import and independent R/F/H route families where supplied.
- Exact-day duration changes; month-window scenarios retain their precision.
- Source-library search and sanitized document display.
- Private canonical repository and exact-SHA public CI, using synthetic fixtures.

## Next milestones

1. Add arrival locks, explicit passage/buffer editing and richer comparison.
2. Connect a server-side LLM adapter to search/get/compare/preview tools.
3. Add preparation evidence states, planning-pack export, private pilot access
   and a tested backup/restore flow.
4. Inventory Wix content and URLs, then build a separate public projection.
5. Add offline packs, weather adapters and deliberate Helm export when needed.

The next model integration must be evaluated on correct tool use, source support,
ambiguous requests, missing inputs, latency and cost. A model never owns date
arithmetic or direct writes. Manual controls remain useful on provider failure.

## Data ownership

Guide prose stays in its configured source folder during this release. Signed
forms and issued evidence stay in their original archive. Backend records own new
web scenarios. Generated exports will be labelled snapshots. No two-way document
sync or public access to the private library is part of the foundation.

## Validation

Use synthetic fixtures in Git and public CI. Validate dates across leap years,
preserved durations/gaps, stale previews, save retries, changed imports, source
paths, script injection, unsupported precision, route geometry and browser flows.
Any private-data acceptance check runs locally with its output outside Git.
