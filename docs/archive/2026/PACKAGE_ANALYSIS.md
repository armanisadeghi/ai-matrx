> ARCHIVED 2026-07-26 — one-off dependency audit from 2026-04; kept for history. Current dependency state lives in package.json + the repo's release gates.

# Package analysis

## array-move, qss, cors, nodemailer, replicate, js-tiktoken

Search scope: `*.ts` / `*.tsx` imports (not only `package.json`).

| Package | Usage | Safe to remove? |
|---------|--------|-----------------|
| `array-move` | **No** imports. Reorder in-app uses `arrayMove` from `@dnd-kit/sortable` (e.g. `OptionsEditor.tsx`). | **Yes** — standalone package unused. |
| `qss` | **`components/ui/link-preview.tsx`** — `encode` for preview URL query strings. | **No** — replace with `URL` / `URLSearchParams` first if you drop the dep. |
| `cors` | **No** `import` from `cors`. Only unrelated string in `text-case-converter`. CORS is not wired via this middleware in app code. | **Yes** — unless a one-off server script outside this tree needs it. |
| `nodemailer` | **No** `nodemailer` / `createTransport` / `sendMail`. Outbound mail uses **Resend** + `@react-email/*`. | **Yes** — remove **`@types/nodemailer`** in the same change. |
| `replicate` | **No** `from "replicate"` / `Replicate` client. | **Yes**. |
| `js-tiktoken` | **Only** `utils/token-counter.ts` (lite + `o200k_base`); **no** importers. Workflows use `token-estimator.ts` and other heuristics instead. | **Yes** only **with** `utils/token-counter.ts` (and `token-counter.md` if you delete the util). |

## Unused / redundant direct dependencies (static audit)

Search scope: `*.ts` / `*.tsx` / `next.config.js` (not only `package.json`). Run `pnpm remove …` + build/typecheck to confirm.

| Package | Usage | Safe to remove? |
|---------|--------|----------------|
| `@radix-ui/react-accessible-icon` | No imports (`AccessibleIcon` / package name). | Yes (direct dep only; verify build). |
| `@react-pdf/renderer` | No app imports. PDF **preview** uses **`react-pdf`** in `features/files/components/core/FilePreview/previewers/PdfPreview.tsx`. Package only appears in `next.config.js` → `serverExternalPackages`. | Yes — also remove `"@react-pdf/renderer"` from `serverExternalPackages`. |
| `google-fonts` | No imports or other references. | Yes. |
| `next-redux-wrapper` | No imports. Repo `REHYDRATE` usage is the sync engine, not this library. | Yes. |
| `liquid-glass-react` | No imports in source. | Yes. |
| `next-themes` | Only `import { useTheme } from 'next-themes'` in `components/admin/ReduxDebugInterface.tsx`, and that file is **entirely block-commented** with **no importers**. No `ThemeProvider` from `next-themes` elsewhere. | Yes — optionally delete or fix `ReduxDebugInterface.tsx`; some docs still claim `next-themes` is configured (stale). |

## onnxruntime-web, wavesurfer, ag-grid, React Flow resizer, Remirror markdown (static audit)

Search scope: `*.ts` / `*.tsx` / `*.js` in repo + `package.json` / `pnpm-lock.yaml`. Re-run `pnpm install` and build after removals.

| Package | Usage | Safe to remove? |
|---------|--------|----------------|
| `onnxruntime-web` | **In use** for VAD: `@ricky0123/vad-web` / `vad-react` depend on it (lockfile). App sets `onnxWASMBasePath` to jsDelivr ORT in `hooks/tts/useVoiceChat*.ts`, `components/voice/voice-assistant-ui/Assistant.tsx`. Webpack ignores warnings for `onnxruntime-web`; `next.config` / headers handle `.onnx`. Local copy in `utils/next-config/copyFiles.js` is **commented out** (CDN path). | **No** as a needed capability while VAD is used. Removing the **root** direct dep may be redundant (still transitive via VAD) — do not assume “no ML”; Silero VAD is active. |
| `wavesurfer.js` | **No** imports or references in app sources; only in `package.json` / lockfile. | **Yes** (unused direct dep). |
| `ag-grid-community` + `ag-grid-react` | **Only** `components/mardown-display/tables/EditableTable.tsx` imports them. **No** other file imports `EditableTable` (orphan; `DraggableEditableTableField` is unrelated). | **Yes** only if you **delete or rewrite** `EditableTable.tsx` in the same change; else keep. |
| `@reactflow/node-resizer` | **No** imports. `features/workflows-xyflow/core/ResizableNodeSelected.tsx` uses `NodeResizer` from `@xyflow/react`, not this package. | **Yes** (redundant direct dep). `reactflow` / `@xyflow/react` remain in use across workflows, diagrams, etc. |
| `@remirror/extension-markdown` | **No** direct imports. Editors use `MarkdownExtension` from `remirror/extensions` (`RemirrorEditor.tsx`, `MarkdownDualDisplay.tsx`). The `remirror` meta package already lists `@remirror/extension-markdown` in the lockfile. | **Yes** as a **duplicate** top-level dep; verify build in case the root entry was a deliberate version override. |

## react-json-view, react-audio-player, react-webcam, react-player, open-graph-scraper

Search scope: full repo (imports, `require`, dynamic import strings). Matches only `package.json`, `pnpm-lock.yaml`, and `scripts/dead-code-cleanup.md` — **no** `.ts` / `.tsx` / `.js` / `.jsx` references.

| Package | Usage | Safe to remove? |
|---------|--------|----------------|
| `react-json-view` | **No** imports. | **Yes** — unused direct dep; run `pnpm remove` + build. |
| `react-audio-player` | **No** imports. | **Yes** — same. |
| `react-webcam` | **No** imports. Webcam UI (`components/matrx/camera/`) uses `CameraView` + `useCamera()` / MediaDevices, **not** this package. | **Yes** — same. |
| `react-player` | **No** imports. | **Yes** — same. |
| `open-graph-scraper` | **No** imports. Repo `openGraph` keys are **Next.js metadata**, not this library. | **Yes** — same. |

Removing any of these only drops dead `package.json` entries; confirm with `pnpm install`, typecheck, and build.
