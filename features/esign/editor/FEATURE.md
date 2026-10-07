# E-sign sender editor

The sender's side of e-signature (`/esign/new`, `/esign/<id>` while a draft, `/esign/templates`):
upload, recipients, fields placed on the real PDF, auto-placement, preview, send, templates.
Contract: `common-docs/projects/esign-parity/CONTRACT.md` §1, §12, §15 (frozen shapes in
`features/esign/contract/`). Report: `common-docs/projects/esign-parity/reports/sender.md`.

## Parts
- `components/EsignEditor.tsx` — the editor (left rail Documents · People · Message · Fields, the
  stage, properties on the right; phone = sheets + a bottom bar, placement by tap).
- `components/DocumentStage.tsx` — PdfPreview `layout="continuous"` + a per-page field layer
  (move / resize / marquee / guides, 1 % snap). Fields are fractions of the page.
- `useDraftSync.ts` — autosave: single flight, 800 ms debounce, keepalive flush on hide, local
  mirror restored after refresh, `stale_draft` three-way merge (`merge.ts`) with Keep mine / Take theirs.
- `history.ts` — 50-step undo / redo. `model.ts` — kinds, defaults, warnings.
- `api/types.ts` is the ONE interface to the server; `api/realApi.ts` the real doors;
  `mocks/` (dev demo only, `app/(dev)/demos/esign-sender`) an in-memory twin.
- `components/EditorHost.tsx` / `EnvelopeRoute.tsx` — the real routes (draft → editor, sent → envelope page).
- `features/esign/templates/` — the template list; `features/esign/envelopes/EnvelopeDetail.tsx` — the sent envelope page.

## Rules
- A draft is composition only (`EnvelopeDraftV1`); access codes never enter it (`esign_draft_set_access_code`).
- Nothing silently discarded: a conflicting edit asks; an unsaved mirror restores with a toast.
- A signer without a signature field is a warning at Send, never a block.

## Change log
- 2026-10-07 — editor, templates list, envelope page rewrite built against a mock; real doors wired (parity lane, sender).
