# Codex subscription assistant

The backend uses the official Codex app-server protocol over local stdio with an
existing ChatGPT sign-in. This is a single-owner private local pilot. It does not
copy tokens, use API-key billing, share a subscription with visitors or expose
Codex directly to the network. The selected configured model is preserved; a
successful inference turn, rather than a model catalog, proves request access.

Supported tools are search_guides, read_guide, get_plans, show_scenario,
preview_plan and preview_route. There is no save, shell, filesystem, raw SQL,
network, booking or vessel tool. Inherited MCP servers/apps, web search, memories
and execution environments are disabled. Unrecognized server requests are denied.

Guide reads are bounded by lines and characters. Source receipts include the actual
source ID, revision and line range read, and link back to the imported guide.
Receipts establish retrieval, not that every model claim is source-supported.
Guide prose is untrusted evidence. Current regulations and conditions need a
separate verified source workflow.

The view supplies a scenario revision and optional proposal ID. Follow-up edits
chain onto the active proposal and remain anchored to the original scenario and
library revisions. Changed sources invalidate a pending composition/save.
Switching scenarios clears a preview and displays the selected source option.
Date tools preserve stay durations and protected arrival locks. Month/unknown
scenarios reject exact recalculation until their missing inputs are modelled.
Destination route sketches change draft geometry only and leave dates unchanged.

The app streams typed tool effects to the browser. A model sentence alone cannot
move the map. Only the existing Save new option control persists a draft. Chats
and thread IDs are local private records, excluded from export. Errors and
interrupted turns do not produce a completed response. One turn per chat runs at
a time. A stopped browser reply terminates the request's owned Codex process.

Public CI uses a synthetic transport substitute and synthetic guides; it does
not sign into Codex or consume a personal subscription. Local acceptance must
separately prove successful inference, guide reads, date previews and map effects.

Official references:
- https://learn.chatgpt.com/docs/app-server
- https://learn.chatgpt.com/docs/auth
- https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms
