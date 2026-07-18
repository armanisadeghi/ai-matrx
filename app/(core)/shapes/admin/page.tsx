// app/(core)/shapes/admin/page.tsx
//
// Per-feature admin map for the user-facing Shapes studio (the Content-IR
// user surface). Renders via the platform primitive `<FeatureAdminPage>`.
// The admin/registry side of the Shape System has its own surface at
// /administration/kind-registry — this map indexes the STUDIO's routes and
// modules and points across.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";
import {
  SHAPES_NEW_HREF,
  SHAPES_ROUTE_BASE,
} from "@/features/content-ir/studio/constants";

const SHAPES_ADMIN_MAP: FeatureAdminMap = {
  name: "Shapes (studio)",
  slug: "shapes",
  description:
    "User-facing Shape System studio: list your org's kinds + the platform library, preview canonical examples through the real render route, test a shape live via the canonical KindInputForm, and create new shapes with the creator agent (handoff to /chat/a/[agentId]). Registry/admin tooling lives at /administration/kind-registry.",
  docs: [
    { label: "Content-IR FEATURE.md", href: "/features/content-ir/FEATURE.md" },
    {
      label: "Shape System doc",
      href: "/features/content-ir/docs/SHAPE_SYSTEM.md",
    },
  ],
  routeScanPath: "app/(core)/shapes",

  routes: [
    {
      url: SHAPES_ROUTE_BASE,
      label: "Shapes list",
      description:
        "List view (feature-entry doctrine): your shapes + platform library, search, Refresh, New.",
      filePath: "app/(core)/shapes/page.tsx",
      status: "Live",
    },
    {
      url: SHAPES_NEW_HREF,
      label: "New Shape (create with agent)",
      description:
        "Compose intent + sample data, hand off to the creator agent chat. Loud not-configured state until the agent id is set.",
      filePath: "app/(core)/shapes/new/page.tsx",
      status: "Live",
    },
    {
      url: `${SHAPES_ROUTE_BASE}/[kind]`,
      label: "Shape preview",
      description:
        "Canonical kind_example rows rendered through the production applyIrKindRoute path.",
      filePath: "app/(core)/shapes/[kind]/page.tsx",
      status: "Live",
    },
    {
      url: `${SHAPES_ROUTE_BASE}/[kind]/test`,
      label: "Shape test",
      description:
        "KindInputForm → live render of the emitted instance (the magic-moment screen).",
      filePath: "app/(core)/shapes/[kind]/test/page.tsx",
      status: "Live",
    },
    {
      url: `${SHAPES_ROUTE_BASE}/[kind]/instances`,
      label: "Shape instances",
      description:
        "My saved kind_instance rows for this kind: validation dot, pinned-version chip, render through the real component, edit (prefilled KindInputForm), soft delete, honest repin, flat-kind View-as-table snapshot.",
      filePath: "app/(core)/shapes/[kind]/instances/page.tsx",
      status: "Live",
    },
    {
      url: `${SHAPES_ROUTE_BASE}/instances/[id]`,
      label: "Instance permalink resolver",
      description:
        "Sharing-registry url_path_template target (/shapes/instances/{id}) — resolves the instance's kind and redirects to /shapes/[kind]/instances?i=<id>.",
      filePath: "app/(core)/shapes/instances/[id]/page.tsx",
      status: "Live",
    },
    {
      url: `${SHAPES_ROUTE_BASE}/[kind]/schema`,
      label: "Shape schema",
      description: "Read-only field table + emitted_json_schema behind a toggle.",
      filePath: "app/(core)/shapes/[kind]/schema/page.tsx",
      status: "Live",
    },
    {
      url: "/administration/kind-registry",
      label: "Kind Registry (admin)",
      description:
        "Super-admin Shape System board: status matrix, dual gate, assets, drift.",
      filePath: "app/(admin)/administration/kind-registry/page.tsx",
      status: "Live",
    },
  ],

  components: [
    {
      name: "KindExamplePreview",
      filePath:
        "features/content-ir/studio/components/KindExamplePreview.tsx",
      description:
        "Shared example-preview engine (extracted from the admin KindPreviewTab; both surfaces consume it).",
      tier: "internal",
    },
    {
      name: "KindInstanceRender",
      filePath: "features/content-ir/studio/components/KindInstanceRender.tsx",
      description:
        "Renders ONE canonical instance through the real production path (envelope → SafeBlockRenderer → applyIrKindRoute).",
      tier: "internal",
    },
    {
      name: "ShapeTestTab",
      filePath: "features/content-ir/studio/components/ShapeTestTab.tsx",
      description:
        "Form + live-render split view over the canonical KindInputForm (loaded ssr:false).",
      tier: "internal",
    },
    {
      name: "NewShapeClient",
      filePath: "features/content-ir/studio/components/NewShapeClient.tsx",
      description:
        "Create-with-agent handoff (stashChatDraftTransfer → /chat/a/[agentId]).",
      tier: "internal",
    },
    {
      name: "ShapesListClient",
      filePath: "features/content-ir/studio/components/ShapesListClient.tsx",
      description: "RLS-scoped list view (mine + platform sections).",
      tier: "internal",
    },
    {
      name: "ShapeInstancesTab",
      filePath:
        "features/content-ir/studio/components/ShapeInstancesTab.tsx",
      description:
        "Instances list + detail (render / edit / delete / repin / View-as-table), loaded ssr:false.",
      tier: "internal",
    },
    {
      name: "instance-service",
      filePath: "features/content-ir/studio/instance-service.ts",
      description:
        "The ONE browser write/read path for content_ir.kind_instance (save / list / update / repin / soft delete; server-toolset parity).",
      tier: "internal",
    },
    {
      name: "message-kind-instances",
      filePath: "features/content-ir/studio/message-kind-instances.ts",
      description:
        "Save-from-chat extraction (splitter + envelope reconstruction) behind the 'Save to my Shapes' message action.",
      tier: "internal",
    },
  ],

  relatedFeatures: [
    {
      name: "Content-IR / Shape System",
      description:
        "The studio is the user surface over content_ir.kind_definition and the kind registry.",
    },
    {
      name: "Agents / Chat",
      description:
        "Shape creation happens in the canonical direct-agent chat (/chat/a/[agentId]) via the draft-transfer handoff.",
      adminUrl: "/agents/admin",
    },
  ],
};

export default function ShapesAdminPage() {
  return <FeatureAdminPage map={SHAPES_ADMIN_MAP} />;
}
