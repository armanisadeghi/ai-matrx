// app/(core)/cms/admin/page.tsx
//
// Per-feature admin map for the CMS feature (client sites + standalone HTML
// pages + the agent-activity visibility surface). Renders via the platform
// primitive <FeatureAdminPage>. When you add a cms route / API action /
// component, add it here in the same change.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const CMS_ADMIN_MAP: FeatureAdminMap = {
  name: "CMS",
  slug: "cms",
  description:
    "Two content systems on one Supabase project (viyklljfdhtidwecakwx, separate from the main app DB): full multi-page client sites (client_* tables, drafts/publish/versions) and standalone quick-publish HTML pages (html_pages). Owner-scoped human UI here; agent tool parity lives in aidream (packages/matrx-content-guard + services/cms). The agent-activity visibility surface lets Arman watch every write, human or agent, in one place.",
  docs: [
    { label: "cms FEATURE.md", href: "/features/cms/FEATURE.md" },
    { label: "html-pages README.md", href: "/features/html-pages/README.md" },
    // Cross-repo system of record lives at common-docs/cms-system/FEATURE.md
    // (its own git repo per F5 — no public URL yet, no in-repo path to link).
  ],

  routes: [
    {
      url: "/cms",
      label: "Site list",
      description:
        "Owner-scoped site list + create-site dialog + link to standalone HTML pages.",
      filePath: "app/(core)/cms/page.tsx",
      status: "Live",
    },
    {
      url: "/cms/[siteId]",
      label: "Site page list",
      description: "Pages for one site, with create/delete.",
      filePath: "app/(core)/cms/[siteId]/page.tsx",
      status: "Live",
    },
    {
      url: "/cms/[siteId]/settings",
      label: "Site settings",
      description:
        "General fields, global CSS, and the danger-zone site delete (type-slug confirm, guarded, cascading).",
      filePath: "app/(core)/cms/[siteId]/settings/page.tsx",
      status: "Live",
    },
    {
      url: "/cms/[siteId]/components",
      label: "Components",
      description:
        "Header/footer/etc. component CRUD, including delete (fixed 2026-07-09 — route was missing the delete case).",
      filePath: "app/(core)/cms/[siteId]/components/page.tsx",
      status: "Live",
    },
    {
      url: "/cms/[siteId]/pages/[pageId]",
      label: "Page editor",
      description: "HTML/CSS/JS editing, draft save, publish, rollback.",
      filePath: "app/(core)/cms/[siteId]/pages/[pageId]/page.tsx",
      status: "Live",
    },
    {
      url: "/cms/[siteId]/collections",
      label: "Collections (W2-C)",
      description:
        "Site data collections: list with policy badges + live counts, field-schema editor dialog, Site Data Key block (masked, copy, rotate kill-switch).",
      filePath: "app/(core)/cms/[siteId]/collections/page.tsx",
      status: "Live",
    },
    {
      url: "/cms/[siteId]/collections/[collectionId]",
      label: "Collection items viewer",
      description:
        "Schema-driven items inbox: unread badges (seen_at), All/Unread/Spam/Archived filters, search, row + bulk triage (seen/spam/archive/delete), client-side CSV export, pagination.",
      filePath: "app/(core)/cms/[siteId]/collections/[collectionId]/page.tsx",
      status: "Live",
    },
    {
      url: "/cms/html-pages",
      label: "Standalone HTML pages",
      description: "List/create/delete for html_pages (no site/draft concept).",
      filePath: "app/(core)/cms/html-pages/page.tsx",
      status: "Live",
    },
    {
      url: "/administration/knowledge/cms-agents",
      label: "CMS Agent Activity (visibility surface)",
      description:
        "Super-admin gated. Live activity feed (poll 8s, filter by site/entity/actor, agent rows visually distinct), per-site page tree with preview/live links, agent-write-policy editor (F4), validation-exception approvals queue (F3, degrades gracefully until P1's store table lands).",
      filePath: "app/(admin)/administration/knowledge/cms-agents/page.tsx",
      status: "Live",
      notes: [
        "Data path is polling, not Realtime — the CMS project has no browser-safe anon key/RLS story.",
        "admin_* API actions independently require requireSuperAdmin, not just the (admin) layout gate.",
      ],
    },
  ],

  components: [
    {
      name: "CmsAgentsAdminClient",
      filePath: "features/cms/components/admin/CmsAgentsAdminClient.tsx",
      description:
        "Tab shell for the visibility surface — fetches the site list once, composes the four panel tabs.",
      tier: "internal",
    },
    {
      name: "ActivityFeedPanel",
      filePath: "features/cms/components/admin/ActivityFeedPanel.tsx",
      description: "Filterable, polling client_activity_log table (C6 shape).",
      tier: "internal",
    },
    {
      name: "SitePageTreePanel",
      filePath: "features/cms/components/admin/SitePageTreePanel.tsx",
      description:
        "Per-site page list with published/draft badges, preview/live links (C4), and capture-screenshot link-outs.",
      tier: "internal",
    },
    {
      name: "PolicyEditorPanel",
      filePath: "features/cms/components/admin/PolicyEditorPanel.tsx",
      description:
        "F4 agent_write_policy editor per site (blocked/draft_only/full).",
      tier: "internal",
    },
    {
      name: "ApprovalsQueuePanel",
      filePath: "features/cms/components/admin/ApprovalsQueuePanel.tsx",
      description:
        "F3 validation-exception review/approve UI, built against P3's ContentException shape.",
      tier: "internal",
    },
    {
      name: "PageListView / PageEditor",
      filePath: "features/cms/components/PageListView.tsx",
      description: "Owner-facing page list + editor building blocks.",
      tier: "internal",
    },
    {
      name: "CollectionEditorDialog",
      filePath: "features/cms/components/collections/CollectionEditorDialog.tsx",
      description:
        "W2-C collection definition editor: field-schema builder (9 types, reorder, per-type constraints), policy toggles with the richtext × public_write block, settings overrides.",
      tier: "internal",
    },
  ],

  apiRoutes: [
    {
      url: "/api/cms/sites",
      method: "POST",
      description:
        "{action}-dispatch: list/get/create/update/delete (owner) + admin_list_sites/admin_update_policy/admin_list_activity (requireSuperAdmin).",
      filePath: "app/api/cms/sites/route.ts",
    },
    {
      url: "/api/cms/pages",
      method: "POST",
      description:
        "{action}-dispatch: full page CRUD + draft/publish/discard/rollback (owner) + admin_list (requireSuperAdmin).",
      filePath: "app/api/cms/pages/route.ts",
    },
    {
      url: "/api/cms/components",
      method: "POST",
      description: "{action}-dispatch: list/get/create/update/delete (owner).",
      filePath: "app/api/cms/components/route.ts",
    },
    {
      url: "/api/cms/versions",
      method: "POST",
      description:
        "{action}-dispatch: list/get (read-only, owner). Six versioned entity tokens incl. site_collection.",
      filePath: "app/api/cms/versions/route.ts",
    },
    {
      url: "/api/cms/collections",
      method: "POST",
      description:
        "{action}-dispatch (W2-C): list/get/create/update/archive/delete + rotate_key + items_list/items_get/items_set_flags/items_delete/items_export (owner) + admin_list (requireSuperAdmin). Enforces slug regex + the richtext × public_write block.",
      filePath: "app/api/cms/collections/route.ts",
    },
    {
      url: "/api/cms/assets",
      method: "POST",
      description:
        "{action}-dispatch (W2-B): list/get/create/update/usage/delete (owner) + admin_list (requireSuperAdmin). Bytes never pass through — durable CDN URLs only.",
      filePath: "app/api/cms/assets/route.ts",
    },
    {
      url: "/api/cms/approvals",
      method: "POST",
      description:
        "{action}-dispatch: list/approve/reject (requireSuperAdmin). F3 queue — returns available:false until P1's client_content_exceptions table exists.",
      filePath: "app/api/cms/approvals/route.ts",
    },
    {
      url: "/api/html-pages",
      method: "POST",
      description: "{action}-dispatch for the standalone html_pages system.",
      filePath: "app/api/html-pages/route.ts",
    },
  ],

  relatedFeatures: [
    {
      name: "HTML Pages (standalone)",
      description:
        "Sibling system, same DB, no site/draft concept — quick-publish HTML from chat/canvas/code blocks.",
    },
  ],
};

export default function CmsAdminPage() {
  return <FeatureAdminPage map={CMS_ADMIN_MAP} />;
}
