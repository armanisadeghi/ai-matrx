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
| `keyword_meaning` (matcher / worth / stamp / guideline_edit) | meaning agent tool `keyword_meaning_suggest`; matcher engine + situational refresh in a waiting mode (`seo.fn_autonomy_propose_stamp`); ruling-session blind check; business discovery's guidelines draft | `platform.assists`, surface `matrx-user/keyword-meaning-review` | `apply_keyword_meaning` via `acceptAssist(assist, note)` → `suggestions/apply.ts` human RPCs | `dismissAssist(assist, note)` (reason required; never re-proposed) | `suggestions/KeywordMeaningSuggestions.tsx` (deleted) |
| `placement_drift` | a brand / organization / system rung moved a placement this site inherits (P30a) | derived: `seo.gsc_topic_placement_diff` | `setKeywordService` new offering, site tier, reason kept | `setKeywordService` old offering, site tier, reason kept | `topics/PlacementDiffQueue.tsx` (deleted) |
| `topic_placement` | Offering assigner below `confidence_floor`, or any placement in a waiting autonomy mode | `seo.keyword_topic.metadata.placement.confirmed = false`; read `seo.gsc_topic_proposed_keywords` (top 25 by demand, 90 days) | `seo.gsc_confirm_keyword_topic` (no reason stored — see Known gaps) | offering picker → `setKeywordService` at site tier, reason kept | offering-tree proposals table only |

Not proposal kinds (verified 2026-09-14): `keyword_classifier` and `place_detection` never propose — a waiting mode at their platform rung STOPS the run (`autonomy_review_required`), because a shared dictionary has no owner to ask. The pack wizard's geo "suggestions" (`packs/GeoPlacesStep.tsx`) are input prefills from saved locations, not AI proposals. Business-discovery step 6 (KI-040) is being built to feed this queue.

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

- `topic_placement` Confirm stores no reason: `gsc_confirm_keyword_topic` flips a SHARED system-tier row, so one site's words have no tenant-safe home. Fix belongs with the tier-blind placement readers (FOUND_DEFECTS, owner: placement ladder / KI-050): confirm should become a site-tier ruling that carries `notes`.
- The console probes each visible site (16 today); the proposals read is ~4 s per site. A cross-site count read would make it instant.

## Change Log

- 2026-09-14 — Claude (KI-045 owner): **one queue, kinds are registrations.** Built the contract, registry, `ApprovalQueue`, cross-site `ApprovalsConsole` and three kinds. Folded in and deleted `suggestions/KeywordMeaningSuggestions.tsx`, `suggestions/ApprovalsConsole.tsx` and `topics/PlacementDiffQueue.tsx` (whose header always said "the platform default" even for brand/org drift — the kind names the rung per row). Added low-confidence Offering placements to the queue. `acceptAssist` gained an optional approval note.
