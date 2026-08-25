# Google integrations — ALL of them

**Owner:** unassigned
**Created:** 2026-08-18
**Scope:** every Google integration in the platform, in every repo. Not just Google Workspace.

This document exists because the parts were built in isolation and nobody held the whole
picture. Read the map first; it is the point of the doc. Everything else is detail.

---

## The map — what is wired to what

**One canonical connection is the hub:** `aidream/aidream/services/google_integrations/`,
table `users.integration_connections`, refresh token in the vault, resources in
`users.integration_connection_resources`. Scope registries are mirrored in exactly two
places and must stay in lockstep: `google_integrations/scopes.py` and
`matrx-frontend/lib/googleScopes.ts`.

### Wired into the hub (these talk to each other)

| Integration | Scope | State |
|---|---|---|
| Docs / Sheets / Gmail-send | `drive.file`, `gmail.send` | **DONE.** Server tools, chat attach, in-app export, three client surfaces. |
| Search Console | `webmasters.readonly` | **Live**, 33 properties, nightly sync. |
| GA4 | `analytics.readonly` | Built, deliberately **paused** at two layers, pending its own approval campaign. |
| YouTube | `youtube.readonly` | Built; **no live grant** since the Aug 8/9 credential cleanup. |
| Outreach reply ingestion | `gmail.readonly` | Built and deployed, **100% blocked** — scope never requested. See below. |

### Islands (own credentials, no shared code — correct or not, know they exist)

| Island | Credential | Verdict |
|---|---|---|
| PageSpeed Insights | `GOOGLE_PSI_API_KEY` | Correct — it is a keyed public API, not OAuth. Healthy. |
| Google Business Profile / Local Listings | DataForSEO proxy | **Real gap.** Reads the same real-world Google listing a first-party GBP integration would, sharing nothing with the hub. See below. |
| Google search results | SerpAPI key | Correct — different question from Search Console (rank vs. impressions). Never cross-referenced; know that "what does Google say about this URL" lives in two systems. |
| Gemini / Vertex | Provider key | Correct and clean. A model provider, not a user integration. Do not merge it. |
| AI Matrx's own GA4 tag | Our own property | Correct. Our telemetry, not the customer GA4 feature. Do not confuse them. |
| Google Fonts | none | Not an integration. |

---

## DONE — do not re-open

**Google Workspace (Docs, Sheets, Gmail send) is complete and verified against a real
account.** Two canonical tools (`google_workspace` server-side; `google_email_send` with
**no server executor at all** — that absence is the Gmail boundary). Bound and offered on
all four agent surfaces. In-app: "Send to Google Doc" on the shared content-action registry,
"Send to Google Sheet" on the shared export menu, Google in the canonical attach menu, a
connect-anywhere floating window, and a config-driven connector strip under every composer.
Large-file paging is honest (`has_more` + the exact next call). Contracts:
`aidream/aidream/services/google_workspace/FEATURE.md` and
`matrx-frontend/features/google-workspace/FEATURE.md`.

**One gate remains and only Arman can close it:** connect a genuinely fresh Google identity
and send one reviewed message. Tracked in
`common-docs/projects/google-oauth-verification/PRODUCTION-ROLLOUT.md`.

---

## OPEN — ranked by what actually costs us

### 1. `gmail.readonly` is dark, and it is holding the whole outreach product hostage
The largest live blockage in the inventory. `aidream/aidream/services/outreach_inbound/` is
fully built and deployed; the send cadence **refuses to send un-listened**, so outreach stays
dark until the scope lands. This is a provider-approval campaign, not engineering. Arman has
already ruled it the next campaign. Nothing to build — someone has to run the campaign.

### 2. Google Business Profile has no first-party integration
`aidream/aidream/services/seo/local_listings.py` reads public GBP data through DataForSEO and
says so in its own docstring. First-party GBP management needs the Google-approved GBP API and
a human-gated application. **If it is ever built, it must go on the hub** — otherwise we get
two disjoint "Google Business Profile" systems. Belongs to the Local Listings program.

### 3. Google Slides is a registered promise, not a feature
The export was built against `auth/presentations`, which is **not on our production OAuth
client** — Google refuses consent for every user. Closed honestly 2026-08-18: it is now a
registered coming-soon with the real blocker named (`presentations.google-slides-export`),
so the button explains itself instead of failing. The code is intact; un-gating is one line
once the scope is approved. **Opening that campaign is Arman's call.** `FOUND_DEFECTS` D214.

### 4. Two chips are out for genuinely unfinished work
- **The agency Search Console credential path.** `aidream/aidream/services/web_credentials/`
  implements a complete second GSC OAuth flow plus service-account support (`google_gsc_sa`,
  documented as "advanced — agencies"), with live routes — and **zero rows, zero UI callers**.
  Needs a ruling. Do not delete it. **Audited 2026-08-19 — the framing above was wrong in one
  load-bearing way:** the hub *does* express per-site override and org ownership already (each
  site carries its own `credential_ref` + `resource_ref`; live: 429 resource rows, 7/22 sites
  bound), and this module's own site-pinning path is **broken** — `web.site` has none of the
  columns it writes. The genuinely missing capability is narrower: **service-account** (rather
  than OAuth-grant) authentication, which belongs ON the hub, not in a parallel resolver.
  Three options and the live evidence: `aidream/FOUND_DEFECTS.md` § "web_credentials GSC half";
  wiring truth: `aidream/aidream/services/web_credentials/FEATURE.md`.
- **`aidream/seo/utils/google_suggest_keyword_tool.py`** — VERDICT DELIVERED 2026-08-19, awaiting
  Arman. Orphan status confirmed (no importer, router, tool registration, ORM entry or scheduler
  handler anywhere). The capability is superseded by written design:
  `common-docs/systems/marketing/seo/seo-keywords/seo-keyword-agent-guide.md:60` names DataForSEO Labs Keyword
  Ideas / Suggestions / Related as the supplier, and those operations are already declared in
  `packages/matrx-seo/matrx_seo/providers/dataforseo/`. Separately it is not compliant to run —
  Google's terms bar automated queries, and the file's own TODO proposes proxy/UA rotation and
  CAPTCHA solving to get around detection. Recommendation is to retire it; only Arman may say the
  word. Full reasoning + the two follow-on items: `aidream/FOUND_DEFECTS.md` (2026-08-19).

### 5. Deeper Workspace capabilities, deliberately scoped out
Separate doc, still accurate: `docs/handoffs/google-workspace-deeper-integrations.md` —
Notes ↔ Docs both directions, Workbooks ↔ Sheets, widening `drive.file` past Docs/Sheets, and
a connections directory page. Each carries a real design question stated there.

### 6. Smaller, known
- ~~Attach is web-only~~ **DONE 2026-08-24 — all three clients attach.** Extension: a Files
  chip in the composer toolbar, conversation-scoped tray, failure state distinct from empty
  (`matrx-extend` commits `e7c11ca` + `bc5a561`; contract in its
  `/Users/armanisadeghi/code/common-docs/systems/clients/extension/WIRE_CONTRACT.md` §2.2). Desktop: a "Google files" plus-menu section,
  cloud-target-only with an explicit `Cloud only` state, context plumbing added to the request
  builder (`matrx-local` commits `06167f7ea` + `de39914a9`; `docs/CLOUD_CHAT_SURFACE.md`).
  Both list registered resources only and door out to the web for Picker; both send the raw
  `__google_files` id array; both adversarially reviewed and unit-tested. Still unproven: a
  live attach-and-ask against a connected account (review-queue rows exist for Arman).
  Related ruling filed as feedback `543af8aa`: should Doc/Sheet WRITES get a review card like
  Gmail send, or is attach-is-consent the contract?
- ~~The connector strip's directory half has no page~~ **DONE 2026-08-22.** The claim was also
  half-wrong: `/user-settings/integrations` existed all along (MCP catalog + GitHub) but never
  consumed the connectors registry. Now `features/connectors/DirectoryConnectorCards.tsx`
  renders the Google connectors there via the shared scope mapping
  (`features/connectors/google-status.ts`, also used by the chat strip), and Search Console's
  manage door points at `/marketing/connections/google` where its OAuth actually lives.
  Browser-verified desktop + mobile.
- **YouTube's grant was revoked and never restored** — restoring it is part of that campaign.

---

## Rules for whoever picks this up

- **Everything user-connected goes on the hub.** A new per-feature Google client is the exact
  pattern the canonical connection exists to replace. Slides is the cautionary tale.
- **Never widen a scope without its campaign.** The two registries and the live consent screen
  must agree. A scope in code that Google has not approved is a button that silently fails.
- **The Gmail send boundary is load-bearing.** `google_email_send` has no server executor by
  design. Bulk, scheduled, or background sending is outside the approval — do not add one.
- **Never recommend deleting a built-but-unwired Google artifact.** Read
  `common-docs/policies/unfinished-work-alarm.md` first. Two such artifacts are named above.
