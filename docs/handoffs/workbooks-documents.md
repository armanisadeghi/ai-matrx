---
status: active
updated: 2026-07-07
repos: [matrx-frontend]
vision: []
---

# Workbooks + Documents — remaining gaps

`/workbooks` (Univer spreadsheets: lossless XLSX/CSV round-trip, snapshots + restore, share, CRDT
collab over Supabase Broadcast) and `/documents` (Univer cloud documents, sibling architecture)
are live. Theming is Univer-native (`createUniver({theme, darkMode})` + `useUniverDarkModeSync`)
with a single-boot editor lifecycle — do NOT reintroduce `colorScheme:"light"` shells or global
`color-scheme` popup overrides; that whole approach was deliberately replaced 2026-06-18.

## Vision — Arman's words

On page layout for these routes (header injection, not height subtraction): "Our header lives
inline with the main header. We just need to respect the avatar on the right side of the header on
mobile and desktop. On mobile, we also need to respect the menu hamburger on the left as well.
Otherwise, we share the space. Therefore, you do not subtract anything!"

## Resources

- Feature root: `features/data-tables/` (services, hooks, collab, components) + its `collab/FEATURE.md`
- Routes: `app/(core)/workbooks/`, `app/(core)/documents/`
- DB: `udt_*` tables live in the **`workbench` schema**
- Collab gate (run before any provider/session change):
  `npx tsx features/data-tables/collab/verify-collab.ts` — must hit 10/10

## Remaining work

1. **Rename `features/data-tables/collab/WorkbookCollabSession.ts` → `UniverCollabSession`.** The
   class is resource-agnostic; the name lies at every call site: `WorkbookEditor.tsx`,
   `DocumentEditor.tsx`, `WorkbookCursorOverlay.tsx`, `verify-collab.ts`. Pure rename +
   `workbookId` → `resourceId` field rename; `SupabaseYjsProvider` already namespaces via
   `channelPrefix`. Check for outside importers before also renaming the `collab/` directory.
2. **DOCX import/export for documents.** Nothing exists; the landing page's "Coming soon" is
   accurate. Mirror the workbook shape (`xlsx-to-univer.ts` / `univer-to-xlsx.ts`): a single
   `docxToUniverDoc(file): Promise<Partial<IDocumentData>>` consumed by an "Import DOCX" button on
   the documents list page (doesn't exist yet). Candidates: `mammoth.js` (DOCX→HTML + adapter),
   the `docx` npm package, or Univer's `@univerjs/preset-docs-advanced` (check availability).
3. **Smart importer for documents.** `smart-importer.ts` (`detectImportRoute()`) +
   `ImportRouteDialog.tsx` exist but are workbook-shaped; the documents route is undecided — see
   Decisions needed.

## Done

- Workbooks + documents editors, snapshots, share/permissions, realtime — `features/data-tables/`.
- Univer-native theming + single-boot lifecycle (2026-06-18) — `WorkbookEditor.tsx` / `DocumentEditor.tsx`.
- Live multi-peer collab verified — `KNOWN_DEFECTS.md` D26.
- `udt_*` tables rehomed to the `workbench` schema.

## Decisions needed

- **Situation:** the workbooks import flow detects ambiguous files (e.g. plain text) and routes
  them via a dialog. Documents has no equivalent, and ambiguous text files could reasonably land
  in Notes, Documents, or raw file storage. **Decide:** where should ambiguous plain-text imports
  route by default — Notes, Documents, or file storage (with or without a user prompt)?
