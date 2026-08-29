// app/(core)/commerce/intake/admin/page.tsx
//
// Per-feature admin map for Commerce Intake (/commerce/intake). Renders via
// the platform primitive <FeatureAdminPage> (admin-gated). When you add a
// new commerce-intake route / component / hook, update this map — the drift
// warnings on the rendered page surface anything missed.

export const dynamic = "force-dynamic";

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const COMMERCE_INTAKE_ADMIN_MAP: FeatureAdminMap = {
  name: "Commerce Intake",
  slug: "commerce-intake",
  baseUrl: "/commerce/intake",
  description:
    "W4 of the ebay-store-management build: the camera-first intake capture app over the C1 commerce schema (intake_batch, intake_asset, intake_artifact, asset_identifier, asset_unknown). QR (serialized) mode keys assets by our_qr identifier rows with dedupe-by-absence; untracked mode streams batch-level artifacts in sequence_index order with delineator frames. Finishing an item writes pipeline_state='captured' and NOTHING else — the status write IS the pipeline trigger.",
  docs: [
    {
      label: "Commerce Intake FEATURE.md",
      href: "/features/commerce-intake/FEATURE.md",
    },
    {
      label: "Media Capture FEATURE.md (camera runtime)",
      href: "/features/media-capture/FEATURE.md",
    },
    {
      label: "File handler FEATURE.md",
      href: "/features/files/handler/FEATURE.md",
    },
  ],
  routeScanPath: "app/(core)/commerce/intake",

  routes: [
    {
      url: "/commerce/intake",
      label: "Capture surface",
      description:
        "Full-screen camera-first capture: full-sensor shutter behind a cropped preview, QR/untracked mode toggle, delineator Break, serial quick entry, notes, voice notes (transcript left to the pipeline), mid-item resume.",
      filePath: "app/(core)/commerce/intake/page.tsx",
      status: "Live",
      notes: [
        "Assets are DB rows from the first artifact/scan — everything autosaves",
        "One ssr:false boundary at the route client; camera code never in a server chunk",
        "pipeline_state='captured' on finish is the ONLY pipeline handoff",
      ],
    },
    {
      url: "/commerce/intake/instant",
      label: "Capture surface — instant lane",
      description:
        "Same capture surface plus the Process button: the client runs the commerce_intake.instant_analysis mandate on the asset's photos and streams the electronics_intake_analysis record into a bottom sheet. A processed asset goes captured → awaiting_triage directly (never re-fires 'captured'), so the W5 server sweep can't double-process it.",
      filePath: "app/(core)/commerce/intake/instant/page.tsx",
      status: "Live",
      notes: [
        "Serialized (QR) mode only — untracked batches have no asset until segmentation",
        "Durable seams live on intake_asset.metadata (instant_run pointer + instant_analysis record)",
        "Disclosure via useDeclaredSurfaceMandates — the top Agents menu, never page content",
      ],
    },
    {
      url: "/commerce/intake/assets",
      label: "Assets list (hub)",
      description:
        "Every org intake asset newest-first (complete via readAllRows); the capture screen's close lands here.",
      filePath: "app/(core)/commerce/intake/assets/page.tsx",
      status: "Live",
    },
    {
      url: "/commerce/intake/assets/[id]",
      label: "Asset detail",
      description:
        "One asset: media strip, notes (guarded autosave), identifier rows, generic editable attribute rows, Reprocess (the same status write).",
      filePath: "app/(core)/commerce/intake/assets/[id]/page.tsx",
      status: "Live",
    },
    {
      url: "/commerce/intake/answer",
      label: "Answer queue",
      description:
        "asset_unknown queue: skip_count ASC / priority DESC / created_at ASC order, image-first cards, one-tap choice/boolean, skip-to-back, defer-out, dictation-fills-draft.",
      filePath: "app/(core)/commerce/intake/answer/page.tsx",
      status: "Live",
    },
    {
      url: "/commerce/labels",
      label: "Label batches",
      description:
        "Print runs of pooled QR codes (commerce.label_batch/label_code): mint from a knob-driven form (commerce.labels knobs), import customer IDs (CSV → client_ref/asset_tag, optional paired QR minting).",
      filePath: "app/(core)/commerce/labels/page.tsx",
      status: "Live",
      notes: [
        "Codes: 14-char confusable-free alphabet, ~69 bits entropy; payload https://aimatrx.com/l/<code>",
        "Per-org uniqueness DB-enforced on live asset_identifier (org, kind, value) + label_code (org, value)",
      ],
    },
    {
      url: "/commerce/labels/[batchId]",
      label: "Label batch detail",
      description:
        "One print run: print/preview/PDF/calibration via the lib/label-print seam, reprint ranges, void remaining codes, per-code doors to owning assets. Batch state auto-derived.",
      filePath: "app/(core)/commerce/labels/[batchId]/page.tsx",
      status: "Live",
    },
    {
      url: "/l/[code]",
      label: "Public label resolver",
      description:
        "The printed QR payload lands here: auth bounce keeps the destination; a resolved code redirects to its intake asset; unassigned/void/unknown get one-card answers. Thin by design.",
      filePath: "app/(public)/l/[code]/page.tsx",
      status: "Live",
    },
    {
      url: "/commerce/intake/admin",
      label: "Admin map (this page)",
      description: "Admin index of every commerce-intake resource.",
      filePath: "app/(core)/commerce/intake/admin/page.tsx",
      status: "Live",
    },
  ],

  components: [
    {
      name: "IntakeCaptureScreen",
      filePath: "features/commerce-intake/components/IntakeCaptureScreen.tsx",
      description:
        "The full-screen surface: camera stage, mode toggle, filmstrip (delineators ringed amber), serial/notes/voice row, photo-video toggle, shutter + Next/Break.",
      status: "Live",
    },
    {
      name: "useIntakeSession",
      filePath: "features/commerce-intake/hooks/useIntakeSession.ts",
      description:
        "The session engine: open-batch resolution, lazy asset creation, monotonic per-batch sequence_index (DB-continued on resume), notes flush-before-close, the captured status write, localStorage mid-item resume.",
      status: "Live",
    },
    {
      name: "useInstantIntakeAnalysis",
      filePath: "features/commerce-intake/hooks/useInstantIntakeAnalysis.ts",
      description:
        "The instant lane: mandate-keyed client run (useLiveAgentRun) with three durability seams — conversation pointer before first token, result persisted on settle (captured → awaiting_triage), recovery/rejoin/backfill on return.",
      status: "Live",
    },
    {
      name: "IntakeAnswerQueue",
      filePath: "features/commerce-intake/components/IntakeAnswerQueue.tsx",
      description:
        "The /answer engine over commerce.asset_unknown: answer / skip (skip_count++) / defer (deferred_at + reason).",
      status: "Live",
    },
    {
      name: "AssetDetail",
      filePath: "features/commerce-intake/components/AssetDetail.tsx",
      description:
        "Asset workspace: notes, identifiers, EditableRows attribute editor (generic rows over intake_asset.attributes), Reprocess.",
      status: "Live",
    },
    {
      name: "AssetsList",
      filePath: "features/commerce-intake/components/AssetsList.tsx",
      description: "Mobile-first complete org asset list with capture hand-off.",
      status: "Live",
    },
    {
      name: "labels module (pool + claim-on-scan)",
      filePath: "features/commerce-intake/labels/service.ts",
      description:
        "Mint (mintLabelCodes, retry-on-23505), reverse lookup (resolveScannedValue), state-guarded claim (claimLabelCode), void, batch auto-derive, CSV conversion import; codes.ts owns the alphabet/URL/normalization; components own create/print/import dialogs and the batch surfaces.",
      status: "Live",
    },
    {
      name: "service + uploads + types",
      filePath: "features/commerce-intake/service.ts",
      description:
        "Direct-Supabase CRUD on the commerce schema (hand-typed rows until db-types covers commerce), guarded CAS asset writes, the one fileHandler upload boundary.",
      status: "Live",
    },
  ],
};

export default function CommerceIntakeAdminPage() {
  return <FeatureAdminPage map={COMMERCE_INTAKE_ADMIN_MAP} />;
}
