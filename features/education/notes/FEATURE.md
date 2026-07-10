# FEATURE.md — `education/notes` (Smart Notes, P4)

**Status:** `live` (2026-07-10) · **Tier 2** · Education Hub tool at `/education/notes`.

> Read [`../convert/FEATURE.md`](../convert/FEATURE.md) (the converter contract this
> consumes) and [`features/notes/FEATURE.md`](../../notes/FEATURE.md) (the note engine
> this skins) before touching this. This feature owns almost no storage — it is the
> education skin + conversion + live-capture layer over canonical systems.

## What it is

A rich note surface inside the Education Hub where **every note is one click from becoming
any other study artifact**, plus **live lecture capture** straight into the editor. Closes
the "nothing is siloed" loop: note → deck / quiz / summary / mind map / audio, each linked
back to the note so lineage is visible both directions.

## The hard rule — thin skin, zero forks

- **Storage + editor + autosave + sharing + RAG = `features/notes`.** Notes here ARE
  platform notes (`workbench.notes`), created via `NotesAPI` and edited by `NotesView`
  (single-note mode). Never fork the note store, the editor, or note sharing.
- **Generation = the converter contract (`features/education/convert`).** One-click convert
  drives `useContentConverter().convert` — never a bespoke generation path. Targets light
  up automatically as owning projects register generators.
- **Live capture = `features/audio` `useChunkedRecordAndTranscribe`.** The one canonical
  streaming-transcription path (shared mic stream + Groq chunks). No second capture path.
- **Lineage = `platform.associations`** via the shared converter primitives — the generator
  writes the `artifact --source--> note` edge through `recordSourceLineage`, and the reverse
  read is `lineage.ts` / `GeneratedFromChips` (both in `features/education/convert`). No
  note-local lineage code.

## Surfaces

| Route | Component | What |
|---|---|---|
| `/education/notes` | `EduNotesHome` | List-first "savior" home — the student's notes, search + visibility filter, New. |
| `/education/notes/new` | `EduNoteNew` | Creates a note (`NotesAPI.create`) → redirects to it. |
| `/education/notes/[id]` · `/[id]/edit` | `EduNoteWorkspace` | `EduNoteActionBar` + `NotesView` (single-note, no sidebar). |

`EduNoteActionBar` = Back · **Live capture** (owners/editors) · **Convert** · canonical
**Share** (`ShareButton`) · the **"generated from this"** lineage chips.

## Key flows

**Convert (note → artifact).** `EduNoteActionBar` renders the SHARED `ConvertContentDialog`
(`features/education/convert`) with `origin={kind:'note', entityType:'note', entityId, title}`
+ the note content (or the current in-editor selection). The dialog calls
`convert({ source:{ text, title, ref:{kind:'note', entityType:'note', entityId} }, targetKind })`;
the generator's `recordSourceLineage` writes the `artifact --source--> note` edge (role `source`)
with `{targetKind, href, detail}` metadata — so the note surface owns NO lineage-write code. Each
metered target shows `remaining` BEFORE the action (`useEntitlementGuard`, TRUST mandate). Result
carries the P0 `TrustEnvelope` → `ConfidenceBadge`.

**Reverse lineage.** `GeneratedFromChips` (shared) reads incoming `source` edges on the note
(`lineage.ts#listGeneratedFrom('note', id)`) → clickable chips. The just-created artifact links
back; the note lists its artifacts.

**Live capture.** `LiveCaptureButton` records; each transcribed chunk is appended to the
note's live Redux content (`updateNoteContent`), rendering in the editor as the lecturer
speaks and autosaving through the notes middleware. Appends always target the freshest
content, so simultaneous manual edits are never clobbered.

## The `notes` converter target (owned here)

P4 registers the converter's `notes` target — `notesGenerator.ts` (`agents.ts`
`NOTES_AGENTS.studyNotes` = `f23562ce…`, a grounded Study-Notes agent, same TrustEnvelope
contract as summary/deck). It runs the agent → creates a real platform note (folder
"Study Notes") → calls `recordSourceLineage` to link a `source` edge to the origin (the ingest
anchor file for the P9 kit, or the origin entity for an entity-sourced convert). So P9's
one-upload→kit fan-out can include a structured note, and it lands right back in this surface.

## Invariants

- Notes are platform notes — shareable, RAG-indexable, editable everywhere. No education
  note table exists or should.
- Lineage edges are `role='source'`, `artifact` (source) → `note` (target). The reverse
  query filters `direction==='incoming' && role==='source'`.
- The convert UI's target availability is read LIVE from the converter registry
  (`isTargetAvailable`). All seven targets are live today; a future `TargetKind` shows
  "coming soon" until its generator registers, then lights up with no change here.
- The convert dialog + reverse-lineage chips are the SHARED `features/education/convert`
  primitives (`ConvertContentDialog` / `GeneratedFromChips`) — the same ones the flashcard-set
  and assessment detail surfaces use. Do not fork a note-local copy.

## Change log

- **2026-07-10** — Convergence-B: the note-local convert stack was generalized into shared
  converter primitives. `ConvertNoteDialog` → `convert/ConvertContentDialog`,
  `GeneratedArtifactsChips` → `convert/GeneratedFromChips`, and `notes/service.ts`
  (`linkArtifactToNote`/`listGeneratedFromNote`) → `convert/recordSourceLineage` +
  `convert/lineage.ts`. All three files deleted here; behavior identical (the artifact→note
  edge is now written by the generator via `recordSourceLineage`). Same dialog now powers the
  flashcard-set and assessment detail surfaces.
- **2026-07-10** — Feature created (P4). Replaced the 4 `EduToolComingSoon` note-route stubs
  with the real surface (home/new/[id]/[id]/edit); built the convert dialog + note↔artifact
  lineage + reverse chips + live capture; authored the Study Notes agent + registered the
  converter `notes` target; added `study_media`/`note` to `ASSOCIATION_TARGET_TYPES`; flipped
  the tool `live`. Consumes P0 trust, P7 `useAccess`, P8 `useEntitlement`, P9's converter.
