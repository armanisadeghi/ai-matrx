# The one approval queue — Keyword Intelligence (KI-045)

**Status:** live · **Register:** `common-docs/systems/marketing/seo/seo-keywords/REGISTER.md` KI-045 · **Product SoR:** `common-docs/systems/marketing/seo/seo-keywords/value-system.md` § SUGGESTIONS

Every AI proposal in the keyword system lands in ONE queue a person works through — never a separate review screen per kind. A proposal kind is a registration.

## Parts

| Part | File | Role |
|---|---|---|
| Contract | `types.ts` | `ApprovalKind`, `ApprovalItem`, `ApprovalSource`, `ApprovalDecisions`, `ApprovalScope` |
| Registry | `registry.ts` | `APPROVAL_KINDS` — the one ordered list of kinds |
| Queue | `ApprovalQueue.tsx` | One site's queue: one list, per-item + select-all, consequences re-listed in the confirm, reason captured where kept, `kinds` narrowing |
| Console | `ApprovalsConsole.tsx` | `/marketing/operations/approvals` — the queue for every site the reader can see (RLS site read) |
| Doors | `doors.tsx` | `KeywordDoor` — a keyword opens the Keyword Intelligence window bound to the site |
| Kinds | `kinds/*.tsx` | One module per proposal kind |

Mounted on: the approvals console (all kinds, all sites) · the value workbench (all kinds, one site) · the business guidelines panel (`keyword_meaning:guideline_edit`) · the offering tree (`placement_drift`).

## Kind census (2026-09-14)

| Kind id | What proposes it | Stored as | Approve → write | Reject → write | Before |
|---|---|---|---|---|---|
| `keyword_meaning` (matcher / worth / stamp / guideline_edit) | meaning agent tool `keyword_meaning_suggest`; matcher engine + situational refresh in a waiting mode (`seo.fn_autonomy_propose_stamp`); ruling-session blind check; business discovery's guidelines draft | `platform.assists`, surface `matrx-user/keyword-meaning-review`; read with the complete manager query `queryAssists` (pending, addressed to the reader), never the throttled chip read | `apply_keyword_meaning` via `acceptAssist(assist, note)` → `suggestions/apply.ts` human RPCs | `dismissAssist(assist, note)` (reason required; never re-proposed) | `suggestions/KeywordMeaningSuggestions.tsx` (deleted) |
| `placement_drift` | the Offering assigner moved one of this site's keywords from one offering to another and nobody here has ruled on it (P30a on the canonical model — every placement is the site's own, brand-offerings D4/D10) | derived: `seo.gsc_offering_placement_drift` (bounded by the site's own AI placements and the writer's `metadata.demoted` marker) | Take it → `seo.gsc_confirm_keyword_offering`, reason kept | Keep mine → `setKeywordOffering` earlier offering, reason kept | `topics/PlacementDiffQueue.tsx` (deleted) |
| `topic_placement` | Offering assigner below `confidence_floor`, or any placement in a waiting autonomy mode | `seo.site_keyword_offering.metadata.placement.confirmed = false`; read `seo.gsc_offering_proposed_keywords` (top 25 by demand, 90 days) | Confirm → `seo.gsc_confirm_keyword_offering`: this site's placement only, reason kept, becomes the site's own ruling | this site's offerings list → `setKeywordOffering`, reason kept | offering-tree proposals table only |

**An agent never makes an offering available on a site (brand-offerings D2).** When the Offering assigner places keywords on, or the site valuer values, an offering the site does not offer, nothing is placed and nothing is added: aidream calls `seo.propose_site_offering_from_template` (service role), which writes ONE pending `keyword_meaning:offering` row per site and offering — the same action shape as `seo.keyword_meaning_suggest`, addressed to the site owner, keywords merged across runs, never re-opened once a person ruled. It carries `templateId`, `keywordIds` and up to five `keywordPhrases`. Approve replays `web.adopt_offering_template` (copy-on-adopt, D6), then places the carried keywords through `seo.gsc_set_keyword_offering` as the approver's ruling — a keyword already on another offering stays where it is and the receipt counts it — then worth through `seo.set_site_offering_value` when the valuer gave points. The row's doors: Offerings plus each named keyword.

Not proposal kinds (verified 2026-09-14): `keyword_classifier` and `place_detection` never propose — a waiting mode at their platform rung STOPS the run (`autonomy_review_required`), because a shared dictionary has no owner to ask. The pack wizard's geo "suggestions" (`packs/GeoPlacesStep.tsx`) are input prefills from saved locations, not AI proposals. Business-discovery step 6 (KI-040, `proposed_setup`) feeds this queue as `keyword_meaning:offering` — one row per Offering named in step 4 with its step-5 worth in points (or "not valued"). Approve replays the canonical offering writers (`features/marketing/FEATURE.md` § Canonical offering writers): the site's owning organization is read explicitly, an offering the site already offers is reused by name, otherwise `web.save_site_offering` creates it with site availability, then `seo.set_site_offering_value` sets `p_worth_points` when step 5 valued it. One-click and select-all like a worth; Reject keeps its required reason.

The offering tree's **proposals table** (`topics/ProposedQueue.tsx`, also in the run console) stays: it is the canonical keyword table (P26) over the same set, with server-side sort/filter across all N and "move to another offering" — capabilities a queue page does not replace. The queue's `topic_placement` section links to it when there are more than it shows.

## Registering a proposal kind

**Path A — your proposal is a matcher, worth, stamp or guidelines edit.** Write no frontend code. Emit through `seo.keyword_meaning_suggest` (aidream: `aidream/services/keyword_meaning/service.py` `submit_suggestion`) with human labels on the payload; it lands in `keyword_meaning` for the site's owner.

**Path B — a new shape of proposal.**
1. Build (or confirm) the ordinary HUMAN write path for the change first. A kind never owns a private writer.
2. Add `kinds/<your-kind>.tsx` exporting an `ApprovalKind`:
   - `id` (stable, snake_case), `label` (row badge / section heading);
   - `accept` / `reject`: `{ label, keepsReason, reasonRequired?, reasonPrompt? }` — `keepsReason: true` ONLY if the write stores the reason;
   - `useSource(scope)` hook → `{ items, total, loading, error, refetch, moreHref?, moreLabel? }`; each item: `key = "<id>:<record id>"`, `headline`, `acceptEffect`, `rejectEffect` (exact writes, reader's words), `doors` (every record named opens), `proposedBy`, `proposedAt`, optional `subKind`, `badge`, `individualReview` (a node for items that must be read alone — excluded from select-all);
   - `useDecisions(scope)` hook → `acceptItems(items, reason)` / `rejectItems(items, reason, choice)` returning `{ applied, failures: [{ key, message }] }` — never throw for an item failure;
   - optional `RejectChooser` when Reject needs a choice first (it returns `choice` + reason).
3. Add it to `APPROVAL_KINDS` in `registry.ts`. Every mounted queue and the console now render it.
4. Add a row to the census above and a Change Log line.

## Invariants

- One queue component. A host narrows with `kinds`; it never forks a list.
- Nothing is applied without a person, except mode 3's server-side timeout (`seo.fn_autonomy_apply_timed_out`, which replays the same RPCs).
- A batch confirm re-lists every item's exact effect before anything runs; items run through their kind's single writer, kind by kind.
- The reason field appears only when the write keeps it; a batch that mixes kinds says which kind drops it.
- Rows name records only as doors (keyword window, offering node, dimension value, guidelines, site).

## Known gaps

- The console probes each visible site (16 today); the proposals read is ~4 s per site. A cross-site count read would make it instant.

## Change Log

- 2026-09-14 — Claude (brand-offerings cutover, step 6g): **an unselected offering is a proposal, never a silent availability write (D2).** The assigner and valuer called `seo.fn_site_offering_for_topic`, which adopted the offering and inserted `web.site_offering`. They now read `seo.fn_site_available_offering_for_template` and, when the site does not offer it, propose it through `seo.propose_site_offering_from_template` into `keyword_meaning:offering` (migration `brand_offerings_step6g_assigner_proposes_availability.sql`; aidream `matrx_seo/artifact_writers.py`). `OfferingProposal` gained `templateId` / `keywordIds` / `keywordPhrases`; `suggestions/apply.ts` adopts the template and places the keywords on Approve. Live census before the change: 0 rows carried the helper's adoption marker, so no silent write had landed. Proven in a rolled-back transaction on Data Destruction: first call `created` with 2 keywords, second `already_pending` merged to 3 and took the valuer's +120, 0 `site_offering` rows written.

- 2026-09-14 — Claude (brand-offerings cutover, step 6): **both placement kinds read and write this site's own placements.** `topic_placement` reads `seo.gsc_offering_proposed_keywords` and Confirm now keeps the person's reason on THIS site's placement (`seo.gsc_confirm_keyword_offering`, which also makes it the site's own ruling so the assigner never revisits it); the old confirm flipped a row every tenant shared and could store no reason. Reject picks from this site's offerings in a plain searchable list inside the dialog. `placement_drift` reads `seo.gsc_offering_placement_drift` — the AI moved a placement nobody here ruled on — instead of the inherited-rung history walk that never finished on All Green Recycling (D313). Proven as admin@admin.com under the signed-in 8 s budget with 2,000 real AI moves planted on All Green in a rolled-back transaction: new read 50 rows in 204 ms, 200 rows in 234 ms; the old read timed out at 8,168 ms. Both known gaps removed.

- 2026-09-14 — Claude (KI-045 follow-up): **a decision no longer rebuilds the kinds' readers.** `ApprovalQueue` rendered its kind slots inside the card when it had rows and in a bare fragment when it was hidden, so deciding the last row (the list empties while `run` is still awaiting its writer) unmounted every kind's reader and writer hooks, mounted fresh ones, and tore the open confirm dialog down mid-decision. Slots and both dialogs now sit at one position; only the card toggles. Guard `__tests__/ApprovalQueue.decision-lifecycle.test.tsx` uses a **stand-in kind only**, StrictMode on and off (red on the old queue, 3 remount failures; green after). Cases driving the real placement-drift kind were run once, then dropped before commit because `keyword-workbench/scope-tiers.ts`, which that kind imports, was deleted mid-cutover — the guard does not cover any real kind. The "state update on a component that hasn't mounted yet" warning seen once during a "Keep mine" **never reproduced** (not in the guard, not live when the guidelines panel's queue emptied, not under three live rounds of the drift kind's exact invalidations on the offering tree). This change fixes the one real remount defect found in the decision path; it is **not** a proven cause of that warning, which stays an open, unexplained sighting. Also: the select-all row no longer renders "Select all 0 shown" when every row is reviewed alone, and on phones row decisions drop to their own row of 40px targets and the reason field is 16px.

- 2026-09-14 — Claude (KI-045 owner): **the queue reads the whole pending set.** `keyword_meaning` read the shared chip list (`list_my_presentable_assists`, presentation-throttled, capped at 50) — measured live it returned 0 of admin@admin.com's 214 pending assists, so the queue hid work it existed to show (the deleted `KeywordMeaningSuggestions` had the same blind spot). It now reads `queryAssists` (pending, this surface, addressed to the reader) and a guidelines draft is reviewed in its own `AssistCard` instead of a chip strip that might not contain it.

- 2026-09-14 — Claude (KI-045 owner): **one queue, kinds are registrations.** Built the contract, registry, `ApprovalQueue`, cross-site `ApprovalsConsole` and three kinds. Folded in and deleted `suggestions/KeywordMeaningSuggestions.tsx`, `suggestions/ApprovalsConsole.tsx` and `topics/PlacementDiffQueue.tsx` (whose header always said "the platform default" even for brand/org drift — the kind names the rung per row). Added low-confidence Offering placements to the queue. `acceptAssist` gained an optional approval note.
- 2026-09-14 — Claude (KI-040 owner): **business discovery step 6 feeds the queue.** `keyword_meaning` gained the `offering` sub-kind (`seo.keyword_meaning_suggest` validates name / product|service / valueAdd points; `migrations/seo_suggest_offering_proposal_ki040.sql`). An offering row renders its door to Offerings and an `individualReview` note in place of Approve until the brand-offering writers land; Reject works now. Census paragraph above updated.
