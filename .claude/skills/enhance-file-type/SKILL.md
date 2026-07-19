---
name: enhance-file-type
description: Add a new file type to the matrx-admin file system, or enhance any of the ~55 capability slots on an existing one (preview, edit, thumbnail, grid card, info, analysis, share, versions, control rail, action bar, conversion, diff, etc.). Use when adding support for a file extension, building a new previewer, expanding the `PreviewKind` union, modifying `FILE_TYPES`, touching `FilePreview.tsx` / `FileTabsBody.tsx` / `CloudFileInlineEditor.tsx` / `preview-actions.ts` / `EDITABLE_KINDS` / `LANGUAGE_BY_EXT`, building or editing a rail panel under `features/files/components/surfaces/single-file/`, wiring `FileViewerControlsContext`, or working an item off the wishlist in `features/files/components/surfaces/FILE_TYPE_INVENTORY.md`.
---

# Enhance a file type

The matrx-admin file system has one registry (`FILE_TYPES`), one preview dispatcher (`FilePreview.tsx`), one edit dispatcher (`FileTabsBody.tsx → EditTabContent`), and two viewer shells (`PreviewPane` side panel + `SingleFileShell` full page). A "complete" file type touches ~55 capability slots organized into 9 groups (Identity, List/Grid, Preview, Edit, Companion tabs, Actions, Cross-feature, Creation, Bundle). Every kind lives somewhere on a T0 → T1 → T2 curve and the inventory tracks both current state and per-type wishlists.

## Use this skill when

- Adding a new file extension or MIME type to the registry
- Building a new `<Kind>Preview` previewer or upgrading an existing one
- Adding a `previewKind` to the `PreviewKind` union
- Wiring the Edit tab for a new kind (extending `EDITABLE_KINDS` and Monaco's `LANGUAGE_BY_EXT`)
- Building a rail panel in `surfaces/single-file/` for a new editing/preview mode
- Adding a new control to `FileViewerControlsContext`
- Working any item off `FILE_TYPE_INVENTORY.md`'s per-type wishlist
- Upgrading a thumbnail strategy, Info-tab field, Analysis detector, or action-bar button for a specific kind

## Mental model — 9 capability groups

| Group | What it covers | Where it lives |
|---|---|---|
| 1. Identity | extensions, MIME, category, icon, color, `previewKind`, sensitivity | `FILE_TYPES` registry |
| 2. List + Grid | icons, kind chip, thumbnail strategy, grid card body, quick-look | `FILE_TYPES`, `FileIcon`, grid card components |
| 3. Preview | previewer component, streaming policy, size cap, rail panel, error/loading states | `previewers/<Kind>Preview.tsx`, rail under `single-file/` |
| 4. Edit | `EDITABLE_KINDS`, Monaco language, save handler, format-on-save, starter templates | `EditTabContent`, `CloudFileInlineEditor` |
| 5. Companion tabs | Document (RAG), Analysis, Info, Versions, Share, diff | Each tab's component + backend |
| 6. Actions | universal actions, edit handoff, open-in-feature, convert-to, per-type extras | `preview-actions.ts`, `useFileActions` |
| 7. Cross-feature | inline chip, drag-to-slot, citation deep-links, paste-from-clipboard | Various consumers |
| 8. Creation | "New <type>" entry, templates, virtual-source provisioning | Future work |
| 9. Bundle/Ops | dynamic-import declaration, bundle weight, codec caveats | `FilePreview.tsx`, this doc |

Full slot list (numbered 1–55) lives in `features/files/components/surfaces/FILE_TYPE_INVENTORY.md` → **Part 1 — Capability framework**. Read that section before scoping any non-trivial change.

## Workflow

Copy this checklist and tick items as you go:

```
- [ ] Step 1 — Scope: identify file type + capability slot
- [ ] Step 2 — Read the inventory entry for that type
- [ ] Step 3 — Map the slot to code surfaces (use the table below)
- [ ] Step 4 — Implement (≤4 files for most changes)
- [ ] Step 5 — Verify in both PreviewPane and SingleFileShell
- [ ] Step 6 — Run lints + tsc
- [ ] Step 7 — Update FILE_TYPE_INVENTORY.md (matrix + wishlist + priorities)
- [ ] Step 8 — Update features/files/FEATURE.md change log
```

### Step 1 — Scope

Decide one of:

**A. New file extension to an existing `previewKind`** — e.g. add `.heif` to image. Single registry change.

**B. New `previewKind`** — e.g. add Jupyter notebook renderer. Touches the `PreviewKind` union, the registry, the preview dispatcher, and a new previewer file.

**C. Capability upgrade on an existing kind** — e.g. add click-and-drag pan to Image, or wire the PDF Extractor into the PDF Edit tab. Touches the previewer/rail/context.

**D. Cross-cutting capability** — e.g. add format-on-save (slot #28), or add `convertTo` to the action bar (slot #42). Touches the platform, then per-kind opt-in.

If unsure which slot a request maps to, scan Part 1 of the inventory.

### Step 2 — Read the inventory entry

Open `features/files/components/surfaces/FILE_TYPE_INVENTORY.md` and read:

1. **Part 2's wishlist** for the type you're touching (Image / PDF / HTML / Markdown / Video / Code — these have full per-type wishlists today). If your type doesn't have a Part 2 entry yet, find it in Part 3's matrix.
2. **Part 1** to confirm which slot # you're filling.

If your work fulfills a wishlist item, you'll be checking it off in Step 7.

### Step 3 — Map the slot to code

Use this table. Match the slot number to the file(s) you'll touch:

| Slots | Files to touch |
|---|---|
| 1–9 (Identity) | `features/files/utils/file-types.ts` → `FILE_TYPES[]` |
| 10–12 (Icon / thumb strategy) | `file-types.ts` + `FileIcon`; for real thumbs: `useFileAsset` variants |
| 13–14 (Grid card / quick-look) | Grid card components in `features/files/components/...` (search for `FileGridCard`) |
| 15 (Kind-filter chip) | Kind filter chip data |
| 17–23 (Preview tab) | `core/FilePreview/FilePreview.tsx` (dispatcher), `previewers/<Kind>Preview.tsx`, optional `surfaces/single-file/<Mode>Controls.tsx` for the rail, `surfaces/FileViewerControlsContext.tsx` if you need new shared state |
| 24–26 (Edit tab core) | `surfaces/FileTabsBody.tsx → EditTabContent`, `core/FilePreview/preview-actions.ts → EDITABLE_KINDS`, `core/FileEditor/CloudFileInlineEditor.tsx → LANGUAGE_BY_EXT` |
| 27 (Non-text editor) | New component under `core/FileEditor/<Kind>Editor.tsx`, plus a branch in `EditTabContent` |
| 28 (Format-on-save) | `CloudFileInlineEditor.handleSave` — add a per-language formatter dispatch |
| 30–31 (Document / RAG) | Python backend; no per-type front-end work for ingest |
| 32 (Analysis detectors) | `features/file-analysis/**` (detectors live there); register the kind in the Analysis tab |
| 33–34 (Info tab) | `FileInfoTab.tsx` + the metadata source (signed URL extraction, EXIF, etc.) |
| 35–36 (Versions / diff) | `FileVersionsList.tsx`; for diffs, new `<Kind>Diff.tsx` rendered from the versions list |
| 37 (Share) | `FileShareTab.tsx` (uniform — rarely per-type) |
| 38–39 (Actions) | `preview-actions.ts`; for edit gating: `EDITABLE_KINDS` |
| 40–41 (Open-in-feature, per-type extras) | `preview-actions.ts` + the destination feature's route adapter |
| 42 (Convert-to) | Platform-level dropdown (does not exist yet — design first) |
| 43 (Print) | `block-print-system` skill |
| 44 (Inline chip) | `FileResourceChip` |
| 53–54 (Bundle) | `next/dynamic` declaration in `FilePreview.tsx` |

### Step 4 — Implement

Most changes are 1–4 files. Patterns:

**Pattern A — Add an extension to an existing `previewKind`**

Edit `FILE_TYPES` in `features/files/utils/file-types.ts`. Add the ext + MIME to the matching entry. Done.

**Pattern B — Add a new `previewKind`**

1. Add the literal to the `PreviewKind` union in `file-types.ts`
2. Add the registry entries pointing at it
3. Add a `case "<kind>":` in `FilePreview.tsx`'s dispatcher with a `next/dynamic` import
4. Create `core/FilePreview/previewers/<Kind>Preview.tsx`
5. If editable: add `"<kind>"` to `EDITABLE_KINDS` + ensure `EditTabContent` routes it
6. If it has interactive controls in `SingleFileShell`: add a `<Mode>Controls.tsx` panel + register it in `FileViewerControlRail`, and add any shared state to `FileViewerControlsContext`

**Pattern C — Upgrade an existing previewer**

1. Make the change in `previewers/<Kind>Preview.tsx`
2. If it introduces new rail state: extend `FileViewerControlsContext` (typed props + setters)
3. Add/extend the matching `<Mode>Controls.tsx` panel
4. Verify the previewer still works without context (passive mode in `PreviewPane`)

### Step 5 — Verify in both surfaces

This is the #1 thing agents get wrong. Previewers run in two surfaces:

- **`PreviewPane`** — side panel from the files browser. The `FileViewerControlsContext` is **NOT** mounted here. Previewers must work in passive mode with no rail.
- **`SingleFileShell`** — dedicated `/files/f/{id}` route. The rail is mounted, context is populated, controls drive the previewer.

Test paths:
1. `https://www.aimatrx.com/files` → click a file row → verify side-panel preview works
2. `https://www.aimatrx.com/files/f/{id}` → verify full-page preview + rail controls work

Previewers should `useFileViewerControls()`-style read context but **never** require context. Always have a sensible default.

### Step 6 — Lints + tsc

```bash
pnpm lint
NODE_OPTIONS="--max-old-space-size=8192" pnpm tsc --noEmit
```

### Step 7 — Update the inventory

Open `features/files/components/surfaces/FILE_TYPE_INVENTORY.md` and update:

1. **Part 3 (matrix)** — change the ✅/🟡/🔴/🐛 marker in the relevant row + update the Notes column
2. **Part 2 (wishlist)** — if you completed a wishlist item, either strike it through (`~~item~~ ✅ **Shipped.** …`) or remove it. Add any newly-discovered follow-up items.
3. **Priority recommendations** (end of doc) — if your work knocked out a numbered item, mark it shipped the same way HTML and Image were.

If you added a new `previewKind` or graduated a kind to T1/T2, add a new Part 2 entry following the template (Has / Wishlist / Code touchpoints).

### Step 8 — Update the feature doc

Append a one-line entry to `features/files/FEATURE.md`'s Change Log with the date and a summary. If your change touches an invariant (e.g. "previewers must work without rail context"), update that section too.

## Common pitfalls

1. **Forgetting `EDITABLE_KINDS`.** Adding Monaco support without adding the kind to `EDITABLE_KINDS` means the Edit button stays hidden.
2. **Forgetting Monaco's `LANGUAGE_BY_EXT`.** Adding a `previewKind: "code"` extension without a `LANGUAGE_BY_EXT` entry opens it as `plaintext` in Monaco — no syntax highlighting in Edit.
3. **Tightly coupling a previewer to the rail context.** Previewers run in `PreviewPane` (no rail) AND `SingleFileShell` (with rail). Read `useFileViewerControls()` with a default fallback, never require it.
4. **Size-cap mismatch.** Streaming previewers (image, video, audio, pdf, html) should override `previewSizeCapOverride` via `getFilePreviewProfile` — they don't blob-fetch the whole file. Non-streaming previewers respect the default cap.
5. **Sandbox policy on HTML-like content.** The HTML iframe sandbox is `allow-scripts allow-popups allow-forms` and **does not include `allow-same-origin`**. Anything that needs cookies/localStorage cannot run there — and shouldn't.
6. **Skipping the Part 2 update.** The wishlist is the operating doc. If you ship a wishlist item without checking it off, the next agent will think the work is still open.
7. **Adding a new top-level `.md` for the new feature.** Don't. One doc per concern — extend `FILE_TYPE_INVENTORY.md` and the file's `FEATURE.md`.

## Decision matrix — which surface holds the control?

When a previewer needs an interactive control (zoom, viewport, line-wrap, …):

| Where the control belongs | When |
|---|---|
| Inline in the previewer's own header | The control is fundamental to viewing (e.g. Rendered/Source toggle for HTML). Must work in `PreviewPane`. |
| In a `single-file/<Mode>Controls.tsx` rail panel | The control is power-user / space-intensive (zoom slider, viewport picker, font size, minimap toggle). Only mounted in `SingleFileShell`. |
| Both | Provide a minimal version inline and a richer version on the rail. The inline version reads `FileViewerControlsContext` if mounted, else its own local state. |

Default: rich controls on the rail, with a sensible default applied when the previewer renders without context.

## Bundle budget

Previewers are dynamically imported (`next/dynamic`). Heavy deps (PDF.js, SheetJS, Three.js when added) must stay dynamic — never `import` them at the top of `FilePreview.tsx` or any of its eagerly-loaded ancestors. Annotate bundle weight in `FilePreview.tsx` if it's non-trivial.

## Pre-PR checklist

- [ ] Registry entry has all 9 Group-1 fields populated (or N/A justified)
- [ ] Previewer renders in `PreviewPane` (no rail) without errors
- [ ] Previewer renders in `SingleFileShell` (with rail) with controls wired
- [ ] If editable: `EDITABLE_KINDS` and `LANGUAGE_BY_EXT` both updated
- [ ] Lints pass, `tsc --noEmit` passes
- [ ] `FILE_TYPE_INVENTORY.md` Part 3 markers updated for affected rows
- [ ] `FILE_TYPE_INVENTORY.md` Part 2 wishlist entries struck through / amended
- [ ] `FILE_TYPE_INVENTORY.md` Priority recommendations updated if a numbered item shipped
- [ ] `features/files/FEATURE.md` Change Log appended
- [ ] No new top-level `.md` files created
- [ ] No DEBUG rings / DebugLayerLabel re-introduced

## Additional resources

- **Inventory + framework + wishlists:** `features/files/components/surfaces/FILE_TYPE_INVENTORY.md`
- **Files feature doc:** `features/files/FEATURE.md`
- **File handler skill:** `features/files/handler/FEATURE.md` (for upload / asset URL questions — different concern)
- **Print system skill:** `.cursor/skills/block-print-system/SKILL.md` (for slot #43 — print)
- **Window panels skill:** `.cursor/skills/window-panels/SKILL.md` (if your enhancement opens an overlay)
