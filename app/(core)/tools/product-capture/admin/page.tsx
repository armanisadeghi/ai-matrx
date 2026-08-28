// app/(core)/tools/product-capture/admin/page.tsx
//
// Per-feature admin map for Product Capture (/tools/product-capture).
// Renders via the platform primitive <FeatureAdminPage> (admin-gated).
// When you add a new product-capture route / component / hook, update this
// map — the drift warnings on the rendered page surface anything missed.

export const dynamic = "force-dynamic";

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const PRODUCT_CAPTURE_ADMIN_MAP: FeatureAdminMap = {
  name: "Product Capture",
  slug: "product-capture",
  baseUrl: "/tools/product-capture",
  description:
    "Warehouse-style rapid capture of product photos, video, voice notes and text ahead of eBay-listing categorization. One full-screen camera surface: rapid Mode 1 (shutter → Next item), QR auto-switch Mode 2 (scan a code to open its item), SKU quick entry, autosaving notes, transcribed voice notes. Staging rows in workbench.product_capture_item/_file; bytes via fileHandler into per-item org-visible folders.",
  docs: [
    {
      label: "Product Capture FEATURE.md",
      href: "/features/product-capture/FEATURE.md",
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
  routeScanPath: "app/(core)/tools/product-capture",

  routes: [
    {
      url: "/tools/product-capture",
      label: "Capture surface",
      description:
        "The full-screen capture screen (camera lease, shutter/video, QR auto-switch, SKU, notes, voice notes, review drawer). Lands directly in capture.",
      filePath: "app/(core)/tools/product-capture/page.tsx",
      status: "Live",
      notes: [
        "Items are DB rows from the first artifact — everything autosaves",
        "One ssr:false boundary at the route client; camera code never in a server chunk",
      ],
    },
    {
      url: "/tools/product-capture/admin",
      label: "Admin map (this page)",
      description: "Admin index of every product-capture resource.",
      filePath: "app/(core)/tools/product-capture/admin/page.tsx",
      status: "Live",
    },
  ],

  components: [
    {
      name: "CaptureScreen",
      filePath: "features/product-capture/components/CaptureScreen.tsx",
      description:
        "The full-screen surface: camera stage, top bar (item chip, QR toggle, camera switch), filmstrip, SKU/notes/voice row, photo-video toggle, shutter + Next item, artifact preview overlay.",
      status: "Live",
    },
    {
      name: "NotesPanel",
      filePath: "features/product-capture/components/NotesPanel.tsx",
      description:
        "Quick-access autosaving textarea; reopening returns the caret to the end of the text.",
      status: "Live",
    },
    {
      name: "VoiceNoteButton",
      filePath: "features/product-capture/components/VoiceNoteButton.tsx",
      description:
        "One-tap voice note on useSimpleRecorder; blob → item folder → background transcription into notes.",
      status: "Live",
    },
    {
      name: "ItemsSheet",
      filePath: "features/product-capture/components/ItemsSheet.tsx",
      description:
        "Review drawer of the org's recent items — reopen as current, delete (soft).",
      status: "Live",
    },
    {
      name: "useProductCaptureSession",
      filePath: "features/product-capture/hooks/useProductCaptureSession.ts",
      description:
        "The session engine: lazy item creation, artifact uploads + links, guarded notes autosave, QR assign-or-switch, transcript delivery, localStorage resume.",
      status: "Live",
    },
    {
      name: "useQrAutoScan",
      filePath: "features/product-capture/hooks/useQrAutoScan.ts",
      description:
        "250 ms decode tick over the live preview via lib/qr/decode with repeat-cooldown dedupe.",
      status: "Live",
    },
  ],
};

export default function ProductCaptureAdminPage() {
  return <FeatureAdminPage map={PRODUCT_CAPTURE_ADMIN_MAP} />;
}
