# Study Kits — one piece of material, everything made from it

> **Status:** Shipped 2026-08-22. Routes `/education/kits` (index) and
> `/education/kits/[sourceId]` (the hub). Verified live against a real kit: 13 artifacts from one
> upload rendered on one page.

## What it is

A **study kit** is one piece of the learner's material plus every study tool generated from it —
flashcards, summary, quiz, practice test, mind map, memory aids, notes, audio study.

The kit builder (`features/education/onboard`) has always produced eight artifacts from one
upload, and they then scattered into six flat per-type lists. Nothing in the product ever showed
the learner the thing they actually have: *their chemistry chapter*. This feature is that place —
the student arrives with ONE subject, so they get ONE page for it.

## THE KIT NEEDS NO TABLE — it already existed in the data

Every artifact a kit run creates already links a `source` association edge back to the durable
ingest anchor, written by the ONE writer `convert/recordSourceLineage.ts`, for all eight target
kinds. The grouping was in the database and nowhere in the UI.

So:

| The kit's… | is… |
|---|---|
| identity | its **source material** — the kit id IS the anchor id (a `file` in every ingested kit) |
| membership | the anchor's incoming `source` edges |
| name | `metadata.sourceTitle` on those edges — written once per run by `onboard/kitTitle.ts`, identical on every sibling |
| chronology | the edges' `created_at` |

No kit table, no kit column, no migration. Reads go through the registered association RPCs
(`assoc_for_entity` / `assoc_for_sources`) — never a direct `platform.associations` query.

**Two runs over the same upload MERGE into one kit, deliberately.** "Everything for that one
thing" is the point; splitting a learner's material into "kit #1" and "kit #2" because they came
back the next day would recreate the scattering this feature exists to end.

## 🚨 WHAT THIS DOES NOT YET SOLVE — one kit is still ONE upload

Arman's words that prompted this feature were plural: *"they're uploading **a bunch of stuff**
that's for one thing... give them a place they can go where all they look at is one thing, but
**everything for that one thing**."*

What shipped closes the easier half: one upload's artifacts stop scattering. It does **not**
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
  `kitMembers` filters and de-dupes. Returns `null` when the anchor has no members, so the hub
  says so honestly instead of rendering an empty shell.
- **`listKits()`** — every kit, built from what exists rather than a new query: the canonical
  access-scoped library RPC lists the learner's artifacts, then ONE `assoc_for_sources` call per
  artifact type (never per artifact) resolves their origins, grouped by anchor.

🚨 **`targetKind` is the honest discriminator.** `recordSourceLineage` is the only writer that
stamps it, so a `source` edge without one belongs to a different system on the same anchor — most
importantly the **per-card** `fc_card → file` edges a deck writes, which would otherwise flood a
kit with hundreds of rows. Filter on the stamp, never on a type blocklist.

## The kit is a STUDY surface, not a directory

`kitStudy.ts` reads the canonical study spine (`item_mastery` via `studyService` — the SAME
numbers the deck page and planner show, never a second progress model) for the kit's largest
deck, and the hub leads with mastery %, cards studied, due count, and one primary action.

🚨 **The action always opens the deck's own study surface, and the due count is a FACT, not a
destination.** There is no per-kit due queue: `/education/flashcards/review` is the cross-deck
FSRS queue and `[setId]/study` takes no mode parameter, so a "review this kit's due cards" link
would be a promise the product cannot keep — exactly the class of shipped lie
(`STATE.md` §4.1 item 7) that a behavioural test cannot see.

## Doors (THE DOOR LAW)

A kit is reachable from every direction a learner can arrive from:

| From | Door |
|---|---|
| The run that just finished | **Open your kit** on `KitBoard` — the first time a kit outlives its tab |
| Any artifact page (all 8 kinds) | **Open the kit** on `convert/MadeFromSource` |
| The education tools grid + hub | The `kits` entry in `data/tools.ts` |
| A kit page | **The material** (the source file) and **Make more from it** |

## Gotchas

- **Older kits show older names.** The kit name is read from edge metadata, so kits generated
  before 2026-08-22 render the raw filename they were created with (`sample_video`,
  `STUDY KIT PDF VERIFICATION TEST`). They are not broken; they predate naming. A kit with no
  `sourceTitle` on any edge falls back to its newest artifact's title.
- **The "largest deck" rule.** A kit with several decks shows the study bar for its biggest one.
  Fine today (kits have one deck); revisit if multi-deck kits become normal.
- **Artifact titles may legitimately differ from the kit's name.** A single-pass run lets a
  generator's own agent title its artifact, which is often better for that artifact. The kit's
  name is the name of the MATERIAL, which is what the hub is about.

## Change log

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
