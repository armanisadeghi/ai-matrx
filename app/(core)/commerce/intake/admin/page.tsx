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
