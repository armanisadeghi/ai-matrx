# Comment-only cleanup: stale references to deleted file-handling APIs

Companion to [SWEEP_LEFTOVER_REFERENCES.md](./SWEEP_LEFTOVER_REFERENCES.md).
Scope: comments, JSDocs, file headers, doc tables, and prose mentions that
named hooks/utils which no longer exist. No code behavior was changed.

## Updated symbols

| Deleted symbol | Replacement referenced in fixed comments | Comments updated |
|---|---|---|
| `useSignedUrl` | `useFileSrc` (from `@/features/files`) / handler's expiry-wheel | 14 |
| `useFileUploadWithStorage` | `useFileUpload` (from `@/features/files`) | 7 |
| `usePasteImageUpload` | `useFileUpload` + `useClipboardPaste` | 2 |
| `resolveRenderableImageUrl` | `useFileSrc` / `fileHandler.use(...).as({ kind: "html_src" })` | 2 |
| Legacy `resolveCloudFileUrl` doc references | live `resolveCloudFileUrl` (handler wrapper) | 2 |

The live exported `resolveCloudFileUrl` at `components/image/cloud/resolveCloudFileUrl.ts`
is the current handler-backed wrapper (it delegates to `fileHandler.use(...).as({...})`)
and is correctly cited where it still appears — those are not stale.

## Files touched

- `CLAUDE.md` — line 154: stale "Never call `useSignedUrl`" rule rewritten to
  point at `useFileSrc`.
- `features/files/types.ts` — two JSDoc comments on `publicUrl` updated.
- `features/files/redux/converters.ts` — converter comment about `publicUrl`
  fallback updated.
- `features/files/redux/thunks.ts` — two tree-spine comments updated.
- `features/files/hooks/useFileAsset.ts` — file-header comparison block
  rewritten to compare against `useFileSrc`, removed legacy-caller paragraph.
- `features/files/components/surfaces/desktop/FileGridCell.tsx` — header
  comment updated.
- `features/files/handler/intelligence/expiry-wheel.ts` — header reworded
  to describe what the wheel does (not what it replaces).
- `features/files/handler/FEATURE.md` — expiry-wheel paragraph reworded;
  migration-status table rows for `useFileUploadWithStorage.ts` and
  `usePasteImageUpload.ts` flipped from `pending` → `done`.
- `features/files/handler/types.ts` — `UploadResultSource` JSDoc no longer
  cites the deleted shim by path.
- `features/files/SKILL.md` — "Render a file as `<img>`" snippet now uses
  `useFileSrc` from the public surface; troubleshooting row updated.
- `features/files/FEATURE.md` — invariant #10 rewritten to point at
  `useFileSrc` / `fileHandler` (the old "centrally cached resolver" link
  pointed at the deleted file).
- `features/image-manager/FEATURE.md` — Browse-mode-click step and the
  "must resolve through the central cached resolver" invariant rewritten
  to describe the current handler-backed path.
- `features/image-manager/IMAGE-FEATURE-INVENTORY.md` — `ImageUploadField`
  and `PasteImageHandler` rows updated.
- `features/scraper/FEATURE.md` — transcripts "Hooks" line rewritten.
- `features/transcripts/README.md` — removed the now-nonexistent
  `useSignedUrl.ts` row from the dir-tree diagram.
- `features/conversation/DEPENDENCIES.md` — file-upload dep updated.
- `features/conversation/CONVERSATION_SYSTEM.md` — hook table row updated.
- `features/cx-conversation/DEPENDENCIES.md` — file-upload dep updated.
- `components/image/ImageManager.tsx` — `legacyPropsToFolderPath` JSDoc no
  longer cites the deleted shim; references `mapLegacyBucket()` instead.

## Intentionally NOT touched

- **Change-Log entries** in `features/files/FEATURE.md` (lines 319, 327, 332,
  336) and `features/image-manager/FEATURE.md:213` — historical dated
  entries that name the legacy symbols. Preserved verbatim per the brief
  ("don't reference change-log entries as stale").
- **Self-aware tombstones** that already say "deleted" — kept as-is:
  - `components/ui/file-upload/PasteImageHandler.tsx:6`
  - `components/ui/file-upload/FileUploadWithStorage.tsx:38`
- **ESLint banned-import config** at `eslint.config.mjs:107–129` — this
  IS the deletion-enforcement rule; cites the deleted hook names by
  design.
- **Consolidation/sweep history docs** under `docs/` —
  `FILE_HANDLING_CONSOLIDATION_PLAN.md`, `IMPACT_INVENTORY_*.md`,
  `SWEEP_LEFTOVER_REFERENCES.md`, `image-component-inventory.md`,
  `CDN_INTEGRATION.md`. Out of scope per the brief.

## STOP — actual call sites (NOT comment-only)

None found. Every match for the deleted hook names that wasn't a comment
turned out to be either (a) an ESLint banned-imports declaration (correct),
(b) a tombstone comment that already names the symbol as deleted, or
(c) a dated Change-Log entry.

No Tier-4 import-side leaks were discovered during this sweep.
