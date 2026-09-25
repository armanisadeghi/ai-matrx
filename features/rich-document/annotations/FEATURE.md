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
| `projection.ts` | rendered text ⇄ source offsets (capture + paint). Skips every element the renderer marks `data-content-chrome` (heading `#` anchors, default callout titles, "Figure 1." prefixes, TOC, wikilink/embed/xref labels, code language labels) plus controls, hidden text, KaTeX and footnote numbers; a letter-less run matches only at the cursor. **A renderer change that adds visible text must mark it `data-content-chrome`** — `__tests__/projection-real-render.test.tsx` renders the real output |
| `errors.ts` | every failure becomes a plain sentence (`humanError`); `EditConflictError` carries the other person's text |
| `echo.ts` | own realtime echoes recognised by write identity (create request id, edit version, deleted id) — never a time window |
| `useSidecarPaint.ts` | CSS Custom Highlight API painter; unsaved/failed marks paint as a wavy underline, never as saved |
| `service.ts` | every store call on a canonical door: `cmt_*` via the one comment seam (creates carry a client request id; until the door dedupes, a Retry first reads back whether the lost attempt landed; edits are compare-and-swap with an honest conflict); private highlight/note = `content.annotation_create` (ONE transaction: annotation document + `annotates` edge, idempotent on the draft's id, filed in the person's own org); `anchored_to` links via `associationsService`; edges into the source read directly (live-only) |
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

`npx jest features/rich-document/annotations` (35 tests incl. `sidecar-verify-findings.test.tsx`, 7/12 red on the verified code; mutations proven red: first-match resolver, UTF-16 offsets, projection skip/window, gate on, never-orphan). DB forcing suite: aidream `uv run pytest db/tests/test_rcb11_comment_collaboration.py` (clone, rolled back; `RCB11_BEFORE=1` = 9/9 red).

## Changelog

- 2026-09-25: Created (RC-B11).
- 2026-09-25: verify-RC-B11 F1–F7 fixed by class: `data-content-chrome` marker; idempotent creates; reply/edit keep their text with Retry; one-transaction private notes (`migrations/rcb11_annotation_create_is_one_write.sql`, applied); plain-sentence errors; Add-menu focus; echo by write identity + CAS edits; Ctrl/Cmd+Alt+M into the toolbar with arrow roving.
