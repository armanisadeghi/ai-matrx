# Study Kits — one piece of material, everything made from it

> **Status:** Shipped 2026-08-22. Routes `/education/kits` (index) and
> `/education/kits/[sourceId]` (the hub). Verified live against a real kit: 13 artifacts from one
> upload rendered on one page.

## What it is

A **study kit** is one piece of the learner's material plus every study tool generated from or manually added to it —
flashcards, summary, quiz, practice test, mind map, memory aids, notes, audio study.

The kit builder (`features/education/onboard`) has always produced eight artifacts from one
upload, and they then scattered into six flat per-type lists. Nothing in the product ever showed
the learner the thing they actually have: _their chemistry chapter_. This feature is that place —
the student arrives with ONE subject, so they get ONE page for it.

## THE KIT NEEDS NO TABLE — it already existed in the data

Every artifact a kit run creates already links a `source` association edge back to the durable
ingest anchor, written by the ONE writer `convert/recordSourceLineage.ts`, for all eight target
kinds. The grouping was in the database and nowhere in the UI.

So:

| The kit's… | is…                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| identity   | its **source material** — the kit id IS the anchor id (`file` for an ingested kit)                                 |
| membership | the anchor's incoming generated `source` edges and flagged manual `member` edges                                  |
| name       | `metadata.sourceTitle` on those edges — written once per run by `onboard/kitTitle.ts`, identical on every sibling |
| chronology | the edges' `created_at`                                                                                           |

No kit table, no kit column, no migration. Reads go through the registered association RPCs
(`assoc_for_entity` / `assoc_for_sources`) — never a direct `platform.associations` query.

**Two runs over the same upload MERGE into one kit, deliberately.** "Everything for that one
thing" is the point; splitting a learner's material into "kit #1" and "kit #2" because they came
back the next day would recreate the scattering this feature exists to end.

## 🚨 WHAT THIS DOES NOT YET SOLVE — one kit is still ONE source

Arman's words that prompted this feature were plural: _"they're uploading **a bunch of stuff**
that's for one thing... give them a place they can go where all they look at is one thing, but
**everything for that one thing**."_

The kit groups aids made from or manually attached to one source. It does **not**
close the half he actually described — a unit made of several sources (the chapter PDF, the
recorded lecture, the photographed worksheet) still becomes three separate kit pages, which
reproduces the same fragmentation one layer up. For anything past a single PDF that is the
common case, not an edge case.

This is NOT settled by the vision. D-Q13 ("one upload → a full study kit is the headline flow")
describes the generation TRIGGER, not a ceiling on what a kit may contain. Do not read the
one-upload definition here as a considered answer to his quote — it is the narrower thing that
the existing lineage data supported without new structure.

**And the obvious primitive was not weighed:** `context.scopes` (Classes) already groups plural
things under one subject with zero new tables, and Arman called the scopes model "a massive
win" (DECISIONS.md). A kit could plausibly BE a scope-scoped collection of sources rather than
a second grouping construct. Choosing between that and an explicit multi-source membership edge
is an architecture decision that belongs to Arman — building either one unilaterally would be
exactly the "add a layer on your own authority" the platform forbids. It is on his review queue.

## The two reads (`kitService.ts`)

- **`readKit(sourceType, sourceId)`** — one kit. `listGeneratedFrom` on the anchor, then
  `kitMembers` filters and de-dupes. Returns `null` only when the authoritative read succeeds
  with no members; a read failure throws so the hub renders its retryable error instead of a
  false empty kit.
- **`listKits()`** — every kit, built from what exists rather than a new query: the canonical
  access-scoped library RPC lists the learner's artifacts, then ONE `assoc_for_sources` call per
  artifact type (never per artifact) resolves their origins, grouped by anchor.

🚨 **`targetKind` is the honest discriminator.** `recordSourceLineage` stamps generated edges and
`createManualKit` stamps flagged manual membership. A `source` edge without one belongs to a different system on the same anchor — most
importantly the **per-card** `fc_card → file` edges a deck writes, which would otherwise flood a
kit with hundreds of rows. Filter on the stamp, never on a type blocklist.

## The kit is a STUDY PATH, not a directory

The hub organizes every artifact by the learner's job — **Understand it → Make it stick → Prove
you know it** — and names each card by its study-aid type, never by repeating the kit title eight
times. Each format keeps its own destination, honest action verb, live content count, and the
short reason a learner would choose it.

`readKitArtifactStats` reuses the canonical Education Library KPI fold for the kit's exact
artifact ids. Countable study aids show their own item coverage, lifetime accuracy, due count,
and last activity; audio shows duration; read/explore formats keep their own content detail. The
former top-level “X% mastered” was only flashcard retention for the largest deck, so presenting
it as mastery of the entire mixed-format kit was removed. There is no invented kit score and no
second progress model.

`edu_library_list_scoped` accepts the same `{id: {kind:'select', values:[...]}}` filter vocabulary
as every entity list. That filter is load-bearing: a kit fetches its eight KPI rows directly
instead of scanning the learner's entire library.

## Doors (THE DOOR LAW)

A kit is reachable from every direction a learner can arrive from:

| From                            | Door                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| The run that just finished      | **Open your kit** on `KitBoard` — the first time a kit outlives its tab               |
| Any artifact page (all 8 kinds) | **Open the kit** on `convert/MadeFromSource`                                          |
| The education tools grid + hub  | The `kits` entry in `data/tools.ts`                                                   |
| A kit page                      | **The material** (the source record), **Make more from it**, and **Add saved aid**    |
| The education home's one nudge  | `?add=<kind>` — the chip for a format the kit lacks (`home/nudges.ts` → `kitAddHref`) |

## MAKING MORE STAYS IN THE KIT

**Add saved aid** opens `/education/kits/new?source=<id>&from=<type>` with the current kit
preselected. The creator lists saved Education Library items, including flashcard decks saved
from chat. New manual kits start from a file; an existing `file`, `note`,
`processed_document`, `fc_set`, `assessment`, or `conversation` kit accepts manual members.
The writer checks the current membership fingerprint and re-reads selected library records
before writing flagged `member` edges. Switching sources clears the prior kit's title and
selections; a draft restores only within its own source URL. The picker uses the platform's
record doors so every listed aid remains openable.

🚨 **"Make more from it" converts the kit's OWN material — never the generic ingest.** It used to
link `/education/start`, which asks the learner to upload the same document again and builds a
SECOND, disconnected kit: the exact fragmentation this page exists to end. `MakeMoreFromKit`
recovers the anchor's text (`convert/reopenAnchor.ts` — no re-upload, no new anchor) and hands it
to THE canonical `ConvertContentDialog`, so the generator writes its `source` edge back to this
same anchor and whatever is made lands in THIS kit.

- **`kitAddHref(sourceType, sourceId, target)` is the "add a quiz to THIS material" route** —
  the kit's own URL plus `?add=<kind>`, not a page of its own. The home's one nudge chip links it
  (`home/nudges.ts`); an unrecognized `add` value is ignored, so a stale link opens the kit rather
  than a broken picker.
- **A deep link opens the picker; it never auto-runs.** Generation spends the learner's quota, and
  a link that spent it on arrival would spend it again on every refresh. The requested target
  leads the dialog and is ring-highlighted (`focusKind`) — the last tap stays theirs.
- **`reopenAnchor` is the ONE anchor→text read** and owns no serialization: `file` goes through
  `reopenSource`, and `note` / `fc_set` / `assessment` reuse the SAME serializer their own convert
  surface uses, so a top-up grounds on byte-identical material. An anchor kind it cannot read
  throws a line the learner can act on — never a silent no-op.
- **The recovered `SourceRef` is passed through** (`ConvertContentDialog`'s `sourceRef`). Deriving
  a bare `{entityType, entityId}` ref from the origin lands the same edge but strips the durable
  `fileId`/`processedDocumentId` a citation needs to open its passage.

## Gotchas

- **Older kits show older names.** The kit name is read from edge metadata, so kits generated
  before 2026-08-22 render the raw filename they were created with (`sample_video`,
  `STUDY KIT PDF VERIFICATION TEST`). They are not broken; they predate naming. A kit with no
  `sourceTitle` on any edge falls back to its newest artifact's title.
- **Artifact titles may legitimately differ from the kit's name.** A single-pass run lets a
  generator's own agent title its artifact, which is often better for that artifact. The kit's
  name is the name of the MATERIAL, which is what the hub is about.

## Change log

- **2026-10-07 — a kit holds any number of Sources** (Arman: "Absolutely!"). A new kit is a
  `scope` under the per-org "Study kit" type (`kitScope.ts`, zero tables): Sources are
  `kitSource` edges into it, aids are flagged `member` edges, and each generated aid links a
  `source` edge to EVERY Source stamped `kitId` (`recordSourceLineage`). `/education/start` no
  longer merges picks into one `.md`; the hub lists Sources, adds them through the shared
  Source input and archives the link on remove; Make more re-reads all Sources. An older anchor
  kit is promoted on its first added Source (`promoteAnchorKit`: anchor = Source #1, aids
  copied, old edges stamped `kitId`, old URL opens the new kit). The "one kit is ONE source"
  section above is superseded. Live: kit `48f5e446…` built from a Wikipedia page, a YouTube
  video and a PDF; a 4th Source added from the hub.

- **2026-09-29 — saved-aid membership.** The kit hub opens a source-aware picker for saved
  study aids, including chat-saved decks. Existing non-file kits no longer route through file
  metadata or write file-targeted edges. Source changes isolate drafts and selections; agent
  add writes carry source type and id. Focused tests and independent review passed; the
  authenticated localhost picker showed file, note, and processed-document kit sources.

- **2026-09-28 — creator values declared; stale "no surface" note corrected.** The one
  `matrx-user/education-kits` surface (list / detail / new views, prefix-routed at
  `/education/kits`) already covers both kit pages; no second manifest was added. Fixed: the
  manual creator emitted `kit_source_file_id`, `kit_draft_title` and `kit_member_candidates`
  (and `create_kits`/`add_kit_members` pointed `updatesValue` at the last) without declaring
  them — new `new_kit` group declares all three, and `kit_source_type` now says kits also come
  from notes and processed documents. DB mirror synced (`--check` PASS), `check:surface-drift`
  clean for this surface, and `surface:probe` on the local preview passed on `/education/kits`,
  `/education/kits/new` and two real kits (`?from=processed_document`, `?from=note`) with 0
  undeclared keys; the detail view supplied `study_aids`, `kit_totals`, `next_challenge`.

- **wave 4b adversarial proof, 2026-09-28** — Agent surface proven live on production with a real
  agent run against a real kit ("Photosynthesis in Plant Cells", `sourceId`
  `b9dd08a8-c8a6-445d-9848-69205e04adf8`): asked "What study materials came out of this kit, and
  how many are there?" and it correctly named all 6 (summary, study guide/notes, mind map,
  flashcard deck with 8 cards, memory aid, audio overview) from the surface's own `study_aids`
  context, none invented. Also fixed a real bug found while proving this: `listKits()` ran a
  library-page scan plus up to four concurrent `assoc_for_sources` calls with no retry, so a single
  transient PostgREST condition (57014/08006-class — common under the shared preview server's
  concurrent agent-walk load) failed the WHOLE `/education/kits` list with "Could not load your
  study kits"; both reads now go through `lib/db/transientRetry.ts`
  (`features/education/kits/kitService.ts`).
- **page-pass 2026-09-28 (wave 4c)** — type list/detail, posture sharp after Linear. `/education/kits` and `/education/kits/[id]` on phone: "New kit" (90x32), the "Search study kits" input (343x36), and the empty state's "Create a study kit" (151x32) all sat under the 44px touch floor. Gave `KitsHome.tsx`'s and `KitHub.tsx`'s roots `matrx-touch-targets` and marked the two Link-as-Button anchors `data-tap-target`. Verified live against production (signed in as admin). Commit `d59b6f6abb`.
- **2026-09-27** — Agent surface `matrx-user/education-kits` (label "Study Kits",
  `features/surfaces/manifests/education-kits.manifest.ts`) for both routes; view-only. The
  list emits every kit; the hub emits `kit_status`, the study aids in study-path order with
  their practice evidence, totals and the next challenge. The path ordering and the
  next-challenge pick moved into `kitSurfaceScope.ts` so the page and the scope share one
  copy (tested, including the self-recursion that briefly broke the scope during authoring).
- **page-pass 2026-09-28** — type list (`/education/kits`) + single-record (`/education/kits/[sourceId]`), posture sharp after Linear. Both pages page-passed clean on the working core rules (real title via `EducationToolHeader`, no dead controls, phone touch targets ≥44px per the 2026-09-14 entry below, no console errors, live-verified desktop + phone). **Superseded 2026-09-28 (see the entry above): this "no agent surface" finding was stale — `3ceac79e6e` shipped `matrx-user/education-kits` 48 minutes after this note was written.** Original finding, kept for history: no agent surface at all. Neither `features/surfaces/manifests/` nor `route-to-surface.ts`'s prefix table or its `surfaceFromPathname` exact-match branch has an entry for `/education/kits` or `/education/kits/[sourceId]` — both silently fall through to the generic `matrx-user/education` hub surface, so an agent opened on a kit page cannot see the kit's own artifacts, stats or study path; it sees the education hub's vocabulary instead. This is the same shape as the already-documented `/education/classes/[id]` gap (`route-to-surface.ts` line ~782: "a different page with no surface of its own yet"). Not attempted in this pass: a compliant manifest needs a scope module, a DB mirror sync (`sync-surface-manifests-direct.ts`) and release admission proof — the 2026-09-17 incident in `features/surfaces/FEATURE.md` is exactly what happens when that sequence is rushed. Flagged for a dedicated build task.
- **2026-09-14** — **Kit phone actions meet the 44px touch floor.** The kit overview's
  shortcuts, full-kit door, and missing-format chips, plus the hub's Material and Make more
  from it doors, are at least 44px on phones while their compact desktop sizing remains intact.

- **2026-09-11** — **Kit counts now fail closed.** `listKits` scans the complete
  canonical library without a 25k ceiling and throws if any artifact-family
  origin lookup fails. The education home and kit index keep their count or
  empty state unavailable until that authoritative scan succeeds; the index
  gives the learner a retry action instead of claiming that no kits exist.

- **2026-09-10** — **Kit lineage failures stay failures.** `readKit` now selects the strict mode
  of the shared best-effort lineage helper, so an expired session or association read failure
  renders the retryable error state instead of “Nothing has been made.”

- **2026-08-29** — **Reimagined the kit as an evidence-backed study path.** The hub no longer
  repeats the material title on every artifact or presents one deck's retention as kit-wide
  mastery. It now leads with a real next challenge, three learner-centered stages, type-first
  cards, per-artifact counts / coverage / accuracy / due work / last activity, and honest
  untracked-format detail. Added an exact-id filter to the canonical library RPC so the hub can
  reuse its KPI fold without a full-library scan. The Education home kit cards now expose four
  labeled, 44px mobile destinations plus a working “Open all N study aids” door instead of an
  unlabeled icon strip; desktop exposes every type by name.

- **2026-08-25** — **Making more stays in the kit.** `MakeMoreFromKit` replaces the
  `/education/start` link on the hub, `convert/reopenAnchor.ts` recovers any anchor's material
  (file + the three entity kinds), and `kitAddHref` gives the education home's nudge chips the
  per-format generate route their code comment was waiting for. `ConvertContentDialog` gained two
  additive props (`sourceRef`, `focusKind`). Verified live on a 6-artifact kit: `?add=quiz` opened
  the picker with Quiz leading, Memory aids generated from the kit's own re-read material
  ("4 mnemonics · 2 analogies · memory palace", Grounded) and the hub refreshed to 7 things
  without a reload. The entity-anchored branches (`note` / `fc_set` / `assessment`) are
  type-checked but not yet exercised live — no entity-anchored kit exists in this account.

- **2026-08-24** — Study-first hub (`kitStudy.ts`): mastery %, cards studied, due count and one
  primary action, read from the canonical spine. Verified live on a fresh 6-artifact kit
  ("0% mastered · 0 of 8 cards studied · Start studying") and on a 13-artifact kit (largest deck
  of 65 chosen). Adversarial-review fixes in the same pass: `listKits` now pages to exhaustion
  (a single 500-row page silently dropped older kits from the index while their direct links
  still worked); the `EntityListQuery`/`Sort` casts were replaced with real objects off
  `DEFAULT_ENTITY_LIST_QUERY` (they were hiding three missing required fields); an
  entity-sourced kit (note→deck) gained the origin door it was missing entirely; both routes
  registered in the education admin map.

- **2026-08-22** — Created. Kit hub + index over the existing source-lineage edges; `sourceTitle`
  added to the lineage metadata so a kit can name itself; doors from the run board, every
  artifact page, and the tools grid.
