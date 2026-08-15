# Agent-copy rollout — media cluster (files · image-manager · podcasts · audio · pdf)

Module audit per the `agent-copy` skill's module-audit protocol, run **before**
wiring. Baseline: `pnpm type-check` clean at `1f4f0fe`.

## Cluster-specific hard rules

1. **No signed URL ever reaches a copy/AI payload.** A signed S3 link
   (`X-Amz-Signature`/`Expires`) is dead within days and worthless to an agent.
   Emit `file_id` + a durable/CDN URL instead. Detection goes through
   `isSignedUrl` (`lib/media/signed-url`); the drop decision reuses the existing
   `shareableMediaUrl` (`lib/media/durability.ts`) — do NOT fork either.
2. **No raw storage paths / `storage_uri`.** `CloudFile.filePath` is a storage
   path and must not be emitted.

`CloudFile` carries **five** fields that trip these rules: `filePath` (storage
path), `url`, `signedUrl`, `downloadUrl` (all mintable/expiring), and `cdnUrl`
(durable, safe to keep). Any payload that dumps a `CloudFile` verbatim violates
both rules — see D-A below.

## Scope corrections found during the audit

Three of the five named targets do not hold the surfaces the brief assumed.
These are reported, not silently re-scoped:

| Brief said | Reality |
|---|---|
| `features/pdf` — extraction results, analysis studio output | Extraction studio is **`features/pdf-extractor`** (24 tsx). `features/pdf` is the viewer + scanner only, and is almost entirely SKIP. |
| `features/audio` — TTS jobs/history lists | **No TTS job or history list exists anywhere in the repo.** `features/tts` is speaker buttons + a tester bench; `features/audio` is mic capture/playback machinery. The real copyable surfaces are the voice catalog, the device panel, and the diagnostics record. |
| `features/files` — "2 files covered" | 1 component (`FileInfoTab`) + 1 util (`file-info-format.ts`). The wired payload is **defective** (D-A). |

## Existing-payload defects (protocol step 4)

- **D-A — `FileInfoTab` leaks a signed URL and a storage path.**
  `agent: () => ({ data: infoSnapshot })` dumps `FileInfoSnapshot.file`, a whole
  `CloudFile`, so `signedUrl` / `url` / `downloadUrl` / `filePath` all land in
  the agent payload. Violates **both** cluster hard rules. The human flavor
  (`fileInfoHumanSummary`) is clean — it prints `/s/{shareToken}` — so this is
  agent-payload-only. Fix in batch 1.

## Coverage table

Class key: **L** list/table · **R** record/detail · **F** field group · **P**
whole page · **SKIP** non-record tool.

### `features/files`

| Surface | Element | Class | Current | Planned control |
|---|---|---|---|---|
| `core/FileList/FileList.tsx` | browser rows + grid cells | L | none | row `icon` pair + view copy + ExportMenu (JSON+CSV) |
| `core/FileTree/FileTree.tsx` | folder tree rows | L | none | row `xs` hover pair + subtree copy |
| `core/FileVersions/FileVersionsList.tsx` | version history rows | L | none | row `xs` pair + list copy + ExportMenu |
| `surfaces/FileInfoTab.tsx` | file metadata record | R | **wired, D-A** | keep pair; sanitize payload |
| `surfaces/FileShareTab.tsx` | active share links | L | none | list copy (tokens only, never signed URLs) |
| `core/PermissionsDialog` | permission grants | L | none | list copy + per-row `xs` |
| `core/FilePreview/previewers/*` (12) | viewers | SKIP | — | no copyable record |
| `core/FileUploadDropzone`, `UploadProgressList` | transient progress | SKIP | — | — |

### `features/image-manager`

| Surface | Element | Class | Current | Planned control |
|---|---|---|---|---|
| `components/CloudFileMetadataSheet.tsx` | per-image metadata | R | **DONE** | header `sm` pair, sanitized via shared `lib/copy-format.ts` |
| `components/StudioLibraryTab.tsx` | studio library grid | L (wrapper) | none | thin wrapper — the `.map()` is in `components/image/cloud/CloudFilesTab.tsx`; wire there so every cloud-file grid benefits |
| `components/PublicImagesSection.tsx` | curated covers + Unsplash search | SKIP | — | reclassified on inspection: an image **picker** over external Unsplash results + a static preset catalog, not a record list |
| `components/ToolsTab.tsx` | tool launcher grid | SKIP | — | non-record tool |
| `components/BrandedUploadTab`, `ProfilePhotoTab`, `AIGenerateHero`, `FullImageStudioTab` | composers/editors | SKIP | — | — |

### `features/podcasts`

| Surface | Element | Class | Current | Planned control |
|---|---|---|---|---|
| `components/admin/PodcastsTable.tsx` | episode/podcast rows | L | none | row pair + view copy + ExportMenu |
| `components/admin/ShowsClient.tsx` | show list | L | none | row pair + view copy |
| `components/admin/EpisodeDetailClient.tsx` | episode record | R | none | header `sm` pair |
| `studio/components/RunsManageView.tsx` | generation runs | L | none | row pair + ExportMenu |
| `studio/components/StudioDashboard.tsx` | dashboard + KPIs | P | none | quick pair + Groomer (`groomerPresetVariants`) |
| `studio/components/RunTruthInspector.tsx` | run truth record | R | none | header pair |
| `generator/components/TranscriptPanel.tsx` | transcript | R | none | `aiVariants` (transcript is long) |
| `components/player/PodcastAudioPlayer.tsx` | player | SKIP | — | — |
| `generator/components/SpeakerCastEditor`, `GeneratorForm` | composers | SKIP | — | — |

### `features/audio` (+ `features/tts`)

| Surface | Element | Class | Current | Planned control |
|---|---|---|---|---|
| `voice/VoicesList.tsx` | voice catalog | L | none | row `xs` pair + view copy + ExportMenu |
| `components/devices/MediaDevicesPanel.tsx` | device inventory | L | none | list copy + ExportMenu |
| `components/VoiceDiagnosticsDisplay.tsx` | diagnostics + errors | R | none | header pair — **errors verbatim** (MISSION) |
| everything else (capture, playback, modals, recovery) | machinery | SKIP | — | no rendered record |
| `features/tts/tester/TtsTesterBench.tsx` | tester | SKIP | — | non-record tool |

### `features/pdf` + `features/pdf-extractor`

| Surface | Element | Class | Current | Planned control |
|---|---|---|---|---|
| `pdf-extractor/studio/PdfStudioChunksPane.tsx` | extracted chunks | L | none | **`aiCustom`** — per-page caps, drop-images, text-only |
| `pdf-extractor/studio/PdfStudioPagesMeta.tsx` | page metadata rows | L | none | view copy + ExportMenu |
| `pdf-extractor/components/PdfExtractorWorkspace.tsx` | extraction output | P | none | quick pair + Groomer + `aiCustom` |
| `pdf-extractor/components/LineageTreeView.tsx` | lineage tree | L | none | list copy |
| `pdf/scanner/components/ReviewList.tsx` | scanned page review | L | none | list copy |
| `pdf/components/viewer/*` | viewer/annotation render | SKIP | — | no copyable record |
| `pdf/scanner/components/{CaptureView,CropSheet,QuadEditor}` | capture tools | SKIP | — | — |

## Batches

1. Shared media-safe payload helper + **D-A fix** (`FileInfoTab`).
2. `features/files` lists (FileList, versions, share links, permissions).
3. `features/image-manager` (grids + metadata record).
4. `features/podcasts` (tables, runs, episode record, dashboard groomer).
5. `features/audio` (voices, devices, diagnostics).
6. `features/pdf-extractor` (`aiCustom` extraction levers) + scanner review list.
