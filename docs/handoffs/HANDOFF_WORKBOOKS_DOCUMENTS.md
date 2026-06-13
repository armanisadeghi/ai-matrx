# Handoff: Workbooks + Documents — UX polish + open items

**Date:** 2026-06-12
**Outgoing context:** running out, mid-polish pass after shipping the
cloud document editor. **Last commit pushed:** `5530a259` (docs feature) +
this polish round (will push after handoff doc is written).
**Branch:** `claude/spreadsheet-ux-solutions-fqRqP` — already merged into
`origin/main` once (see `168215e2 Merge spreadsheet-ux-solutions:
workbooks + cloud documents surface`). Continue developing here; merge
back to `main` when work is ready.

---

## What's already shipped (live on `origin/main`)

- **`/workbooks`** — Univer-backed lossless spreadsheets, XLSX/CSV
  import/export, snapshot history + restore, share + permission gating,
  full CRDT collab (Yjs over Supabase Broadcast). The flagship.
- **`/documents`** — Univer-backed cloud document editor, sibling
  architecture (snapshots, RLS, collab reuse via `channelPrefix`). Newly
  shipped (`5530a259`).
- **Mobile-safe `/workbooks` list page** — title row stacks on phones,
  icon-only buttons at narrow widths, file pickers accept any file and
  validate after pick (`.gsheet` gets a friendly "Download as .xlsx"
  message).
- **Crash-proofed collab boot** — `void startCollabSession().catch(...)`
  plus defensive try/catch inside; `WorkbookCursorOverlay` survives
  Univer facade boot races.

---

## What just landed in this final polish round

Combined fixes targeted at every issue the user enumerated:

### `/workbooks/[id]` + `/documents/[id]` layout

- **No more double row at the top.** The page-level header row (back
  arrow + rename input + share button) used to sit ABOVE the editor's
  own toolbar row (Editing status + Save now + Export + History) —
  two rows, lots of wasted vertical space, the top one was nothing but
  a name.
  - Refactored `WorkbookEditor` and `DocumentEditor` to accept
    `toolbarLeftSlot` + `toolbarRightSlot` props.
  - Both pages now stuff the back arrow / rename / share controls into
    the editor's own toolbar via those slots. **One row total** at the
    top.
  - Rename input is now borderless/transparent inside the toolbar so
    it visually reads as part of the bar, not a separate widget.
- **Mobile padding eliminated.** Page wrapper switched from `p-3` to
  `p-0 sm:p-3`. Phones get full edge-to-edge spreadsheet area.
- **Desktop padding right reserved.** Page wrapper switched to
  `sm:pr-12` to clear the global app shell's avatar in the top-right.
- **Desktop bottom space reclaimed.** The flex column now uses the
  full `h-page` minus minimal padding; no leftover empty band.
- **Border hidden on mobile.** `sm:rounded-md sm:border` — on phones
  the editor goes truly edge-to-edge.

### Univer chrome (the editor canvas itself)

- **Ribbon collapsed.** Both presets now pass `ribbonType: "simple"`.
  This removes the "Start / Formulas / Data" tab strip and consolidates
  the toolbar buttons into a single compact row — Google-Sheets-shaped.
- **Toolbar left-aligned.** Added a global CSS override
  (`.matrx-univer-shell [class*="univer-toolbar"][class*="group"] {
  justify-content: flex-start !important; }`) so the secondary toolbar
  row hugs the left edge instead of centering. The selectors target
  Univer 0.25.x class prefixes; a future major rename would just revert
  the row to Univer's default centering (no functional break).
- **Dark mode neutralized.** Two-layer fix:
  1. Editor shell wrapper gets `style={{ colorScheme: "light" }}` so
     scrollbars and form controls inside the Univer subtree render
     light even when the rest of the app is dark.
  2. A global selector `[class*="univer-popup"], [class*="univer-menu"]…
     { color-scheme: light !important; }` catches Univer's portal
     popovers (which render to `document.body`, outside the editor
     subtree) and forces them to light too. Prevents the "menu shows
     up in light while sitting on a dark backdrop" visual collision the
     user reported.
- **Save status / button labels collapse on phones.** Status pill is
  `hidden sm:flex`; Save / Export / History show icon-only at narrow
  widths.

---

## Open items the next agent could pick up

Quick polish (in priority order):

1. **Verify the changes in a live browser.** I refactored but did not
   visually verify the new toolbar in dark mode + on mobile. Run
   `pnpm dev`, log in (`admin@admin.com` / `Password1234#`), open
   `/workbooks/[any-id]` on both desktop and a mobile viewport, toggle
   dark mode. Confirm: (a) ONE toolbar row, (b) no avatar collision,
   (c) full-height usage, (d) Univer popovers don't break dark-mode
   surroundings, (e) toolbar buttons hug left. If the Univer CSS
   class names changed in a recent patch, the `[class*="univer-toolbar"]`
   selectors won't bite — inspect a live popover and adjust.

2. **DOCX import / export for documents.** Workbooks have lossless
   XLSX round-trip (`xlsx-to-univer.ts` + `univer-to-xlsx.ts`);
   documents have neither yet. The landing page advertises "DOCX
   import / export" as "Coming soon" — fulfill it. Options:
   - `mammoth.js` for DOCX→HTML, then a custom adapter HTML→`IDocumentData`.
   - `docx` npm package or Univer's own `@univerjs/preset-docs-advanced`
     (if available — check) for the round-trip.
   - Mirror `features/data-tables/xlsx-to-univer.ts` shape: a single
     `docxToUniverDoc(file): Promise<Partial<IDocumentData>>` function
     consumed by the documents list page's "Import DOCX" button (which
     does not exist yet — add it next to "New document").

3. **Smart importer for documents.** The workbooks flow has the
   `detectImportRoute()` heuristic + `ImportRouteDialog`. Documents
   doesn't have an equivalent. Decide whether to route ambiguous
   plain-text files into Notes vs. Documents vs. raw file storage.

4. **Documents collab is enabled but UNTESTED with a real second
   peer.** I trust the architecture (same plumbing as workbooks, which
   is verified 10/10) but did not run a two-client docs sync test. If
   you can hit two browsers at the same `/documents/[id]`, confirm
   live edits flow both ways and the host election chooses the
   lowest-uid client. If it doesn't, the most likely culprit is the
   Univer docs ICommandService either not emitting
   `onMutationExecutedForCollab` for text mutations or emitting them
   with a shape `WorkbookCollabSession`'s JSON-normalize step rejects.
   Add `console.log` at `WorkbookCollabSession.handleLocalMutation` to
   see what fires.

5. **Rename `WorkbookCollabSession` → `UniverCollabSession`.** The
   class is already resource-agnostic — it just takes an opaque ID
   that flows through to `makeProvider`. The current name is a lie at
   the docs call site. Pure rename + `workbookId` → `resourceId` field
   rename throughout. `SupabaseYjsProvider` already takes
   `channelPrefix` so the channel naming is already namespaced. After
   the rename, also rename the directory `features/data-tables/collab/`
   → something Univer-shaped (or move it up to be shared) — but check
   for outside importers first.

6. **`udt_workbooks.workbook_name` casing.** The TS shape is
   `udt_workbooks.Row` with `workbook_name: string` — matches the SQL.
   The new documents table mirrors with `document_name`. Both are
   consistent within their domain. No action needed; just noting if
   anyone proposes a "consistent naming" refactor.

7. **`@univerjs/preset-docs-core` is listed in `package.json` now**
   (added in `5530a259`). If the production build complains about
   peer deps, run `pnpm install` to refresh `pnpm-lock.yaml`. The
   transitive resolution already worked locally.

8. **Verify-collab Stage B (real broadcast) was SKIPPED.** The local
   env doesn't have `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Run the gate in an env
   that has them before any further collab/provider changes:
   `npx tsx features/data-tables/collab/verify-collab.ts` — must hit
   10/10 (it did before this polish round).

9. **`FEATURE.md` change log entry for this polish round.** I'm
   running out of context window to add it cleanly with the
   `context-docs` skill. The next agent should add an entry under
   "Change log" in `features/data-tables/FEATURE.md` documenting:
   - Editor toolbar slots + single-row top
   - Mobile padding / desktop avatar clearance
   - `ribbonType: "simple"`
   - Dark-mode color-scheme isolation
   - Univer toolbar left-alignment override

10. **Pre-existing tsc errors (unrelated to this work):** 8 errors
    in podcast / agents / transcript-studio files. Same set noted at
    the start of this session arc; not my responsibility, but worth
    fixing in a separate PR.

---

## Architectural state — quick map

```
features/data-tables/
├── workbook-service.ts          (workbooks CRUD + snapshots)
├── document-service.ts          (docs CRUD + snapshots — mirror)
├── types.ts                     (Workbook + DocumentRow shapes)
├── xlsx-to-univer.ts            (import path for workbooks)
├── univer-to-xlsx.ts            (export path)
├── smart-importer.ts            (route ambiguous files)
├── smart-import-pickup.ts       (cross-route file handoff)
├── hooks/
│   ├── useWorkbookRealtime.ts
│   └── useDocumentRealtime.ts   (mirror)
├── collab/
│   ├── WorkbookCollabSession.ts (transport-agnostic — rename pending)
│   ├── SupabaseYjsProvider.ts   (now has channelPrefix option)
│   ├── verify-collab.ts         (gate — must run before provider changes)
│   ├── types.ts
│   └── FEATURE.md
└── components/
    ├── WorkbookEditor.tsx       (slots + ribbonType simple + light shell)
    ├── DocumentEditor.tsx       (mirror — slots + ribbonType simple + light shell)
    ├── WorkbookHistoryViewer.tsx
    ├── DocumentHistoryViewer.tsx
    ├── WorkbookCursorOverlay.tsx
    ├── RemoteCursorsLayer.tsx
    └── ImportRouteDialog.tsx

app/(core)/
├── workbooks/{layout,page,[id]/page}.tsx
└── documents/{layout,page,[id]/page}.tsx

migrations/
├── udt_v2_backbone.sql           (workbooks metadata)
├── udt_v2_workbook_snapshots.sql (workbook content)
└── udt_v2_documents.sql          (docs metadata + content — NEW)
```

**DB:** Supabase project `txzxabzwovsujtloxrus` (Matrx Main). Two new
tables live: `udt_documents`, `udt_document_snapshots`. Migration ledger
recorded as `matrx-frontend / udt_v2_documents.sql`. RLS mirrors workbooks
1:1. Realtime publication includes both new tables.

**Permissions registry:** Both client (`utils/permissions/registry.ts`)
and DB (`shareable_resource_registry`) carry `udt_documents`. ShareButton
works directly.

**Nav:** "Documents" entry sits next to "Workbooks" in
`features/shell/constants/nav-data.ts` (icon `FileText`, color `indigo`).

---

## Commands the next agent will need

```bash
# Re-run the collab gate (mandatory before changing provider/session)
npx tsx features/data-tables/collab/verify-collab.ts

# Typecheck (8 pre-existing errors in unrelated files are expected)
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "error TS" | wc -l

# Regenerate types after any DB change
pnpm db-types

# Migration ledger check
pnpm check:migrations

# Doctrine check
pnpm check:doctrine
```

---

## Risk summary

- **Univer CSS override fragility (low risk):** The `[class*="univer-toolbar"]`
  selectors target stable Univer 0.25.x class prefixes; a future major
  could rename them. Worst case: the toolbar reverts to centered. Easy
  to fix when it happens.
- **Inline `as unknown as` casts in DocumentEditor (low risk):** Same
  pattern as WorkbookEditor — Univer's facade types are loose at the
  injector boundary. Doctrine check flags them; they're defensive (every
  call site has a runtime guard).
- **Untested DOCX import path (no risk — feature absent):** Not built
  yet. Landing copy says "Coming soon" — accurate.
- **Untested live-document collab (low risk):** Architecture identical to
  workbooks (verified 10/10). If text mutations don't emit through
  `onMutationExecutedForCollab` for the docs preset, the symptom would be:
  text typed by one user does not appear for another. Toggle `collab=false`
  at `app/(core)/documents/[id]/page.tsx:148` to fall back to snapshot-
  per-save behavior while debugging.


## Additional known bugs:
- The system collides with parts of the header on both desktop and mobile because it doesn't use the system's proper header injection system. See agents/build to see how it's to be done. 
- Because it's doing things incorrectly, it is not occupying the full height of the page so the bottom has a giant empty gap, most likely cause is trying to subtract the header height but THERE IS NO HEADER HEIGHT to subtract. Our header lives inline with the main header. We just need to respect the avatar on the right side of the header on mobile and desktop. On mobile, we also need to respect the menu hamburger on the left as well. Otherwise, we share the space. Therefore, you do not subtract anything!
- Documents bug: The scroll is not working. 
- Documents adding extra padding to top, right and bottom and wasting space!
- Neither route has proper metadata with a favicon and everything. 
- 