# FEATURE.md — rich-document annotation sidecar

**Status:** `active` (passage writes gated) · **Tier:** `1` · **Last updated:** `2026-09-25`
**Register:** common-docs `projects/rich-content-unification/REGISTER.md` row RC-B11 · **Contract:** common-docs `operations/for-arman/2026-09-23/content-annotations-storage-brief.md` + STORE-DESIGN §3.19

## Purpose

ONE optional sidecar any surface rendering through `<RichDocument>` / `<RichContent>` installs to let a person highlight, privately note, comment (threads: reply, resolve, reopen), suggest an edit, @-mention people / records / dates, and link any registered record to an exact passage or the whole source. The renderer never knows: the rendered DOM is only read, never wrapped or mutated, and the source body is never rewritten except by an explicitly accepted suggestion. A surface that does not install it renders identical bytes.

## Install

```tsx
<AnnotationSidecarProvider source={{ token, id, title, body, contentVersion, readVersionBody?, save?, href? }}>
  <AnnotatedContent extraActions={(selection, close) => …}>  <RichDocument content={body} … />  </AnnotatedContent>
  <AnnotationPanel />
</AnnotationSidecarProvider>
```

Adopters: `/markdown-studio` → Annotate (`components/markdown-studio/AnnotateView.tsx`, a live `content.document`, source kind `document`), Education study-guide reader (`features/education/study-guides`, source `note:<id>`).

## Files

| File | Owns |
|---|---|
| `anchor.ts` | `text_anchor` build/validate in Unicode code points (the DB's `platform.text_anchor_problem` rules) |
| `resolve.ts` | THE resolver: exact → mapped through the version diff (content-ir `mapRange`) → same range + full context → quote+prefix+suffix, uniquely best → orphaned. Never first-match. `mapAnchorThroughChanges` carries anchors through a splice save |
| `projection.ts` | rendered text ⇄ source offsets (capture + paint); skips chrome (`data-annotation-skip`, buttons, aria-hidden, KaTeX MathML) |
| `useSidecarPaint.ts` | CSS Custom Highlight API painter; unsaved/failed marks paint as a wavy underline, never as saved |
| `service.ts` | every store call on a canonical door: `cmt_*` via the one comment seam, `content.document` (type `annotation`, personal, filed in the person's own org), `annotates` / `anchored_to` edges via `associationsService` |
| `useAnnotationSidecar.ts` | state, drafts (pending → confirmed \| failed, kept for Retry), realtime (`platform.comments`, filtered by `entity_id`), resolution |
| `suggestion.ts` | accept = splice through the source's save adapter (`review/proposedEdit.ts` → `spliceSave`) |
| `mentions.ts` | `@[Name](user:<uuid>)`, `@[label](date:YYYY-MM-DD)`, records as RC-B8 wikilinks `[[token:id\|Title]]` |
| `AnnotationSidecar.tsx`, `AnnotationPanel.tsx`, `MentionComposer.tsx`, `LinkRecordSheet.tsx` | UI |
| `documentSource.ts` | an `AnnotationSource` over `content.document` (load, version bodies, splice save with `guardedUpdate`) |

## Gates and dependencies (read before changing behaviour)

- `ANCHOR_WRITES_ENABLED = false` (`constants.ts`): every passage write is refused before any request until RC-A5 (association payloads follow endpoint access) AND `migrations/rcb11_comment_collaboration_doors.sql` (a chair step: `cmt_add` p_anchor/p_suggested_text, `cmt_list` returns anchor/resolution/suggestion, `cmt_mention_candidates`, `cmt_mention_notify`) are applied. Flip in the same commit that records both. Until then Resolve/Reopen and people-mentions are absent (the panel probes the doors), not dead.
- Edges onto a `content.document` need `@ai-matrx/associations` with the `document` token (regenerated in aidream, awaiting publish); until installed the panel says highlights and links cannot load for that record type, and comments still work.
- Realtime: `platform.comments` is in `supabase_realtime` (`migrations/rcb11_comments_realtime_publication.sql`, applied 2026-09-25). Associations are not published; highlights/links refresh on own writes and on reconnect.

## Checks

`npx jest features/rich-document/annotations` (18 tests; mutations proven red: first-match resolver, UTF-16 offsets, projection skip/window, gate on, never-orphan). DB forcing suite: aidream `uv run pytest db/tests/test_rcb11_comment_collaboration.py` (clone, rolled back; `RCB11_BEFORE=1` = 9/9 red).

## Changelog

- 2026-09-25: Created (RC-B11).
