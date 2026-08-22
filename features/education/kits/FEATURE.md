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
- **Artifact titles may legitimately differ from the kit's name.** A single-pass run lets a
  generator's own agent title its artifact, which is often better for that artifact. The kit's
  name is the name of the MATERIAL, which is what the hub is about.

## Change log

- **2026-08-22** — Created. Kit hub + index over the existing source-lineage edges; `sourceTitle`
  added to the lineage metadata so a kit can name itself; doors from the run board, every
  artifact page, and the tools grid.
