// app/(core)/files/admin/page.tsx
//
// Per-feature admin map for the Files ecosystem. Renders via the platform
// primitive `<FeatureAdminPage>` (admin gated, utilitarian). Single index of
// every files resource: the workspace routes, the universal file handler,
// upload pipeline, and the webhooks + event-spine surface (files.webhook_*
// pipeline over platform.activity_log). When you add a files route / panel /
// component, update this config — the drift warnings on the rendered page
// surface anything missed.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const FILES_ADMIN_MAP: FeatureAdminMap = {
  name: "Files",
  slug: "files",
  description:
    "The file workspace (browse / upload / share / trash), the universal file handler (single entry point for every file flow — uploads, media blocks, durable URLs), and the outbound webhooks + event-spine surface (DB-native delivery over platform.activity_log). Private bytes route through aidream; public files ride the CDN.",
  docs: [
    { label: "Files handler FEATURE.md", href: "/features/files/handler/FEATURE.md" },
    { label: "Webhooks + Event Spine FEATURE.md", href: "/features/files/webhooks/FEATURE.md" },
    { label: "Files FEATURE.md", href: "/features/files/FEATURE.md" },
    { label: "Roadmap", href: "/features/files/ROADMAP.md" },
    { label: "Upload troubleshooting", href: "/features/files/UPLOAD_TROUBLESHOOTING.md" },
  ],
  routeScanPath: "app/(core)/files",

  routes: [
    {
      url: "/files",
      label: "Workspace home",
      description: "Primary file workspace — folder tree, recents, quick actions.",
      filePath: "app/(core)/files/page.tsx",
      status: "Live",
    },
    {
      url: "/files/all",
      label: "All files",
      description: "Flat list of every file the user owns.",
      filePath: "app/(core)/files/all/page.tsx",
      status: "Live",
    },
    {
      url: "/files/recents",
      label: "Recents",
      description: "Recently touched files (user uploads only — system-created files are excluded by provenance).",
      filePath: "app/(core)/files/recents/page.tsx",
      status: "Live",
    },
    {
      url: "/files/starred",
      label: "Starred",
      description: "Favorited files.",
      filePath: "app/(core)/files/starred/page.tsx",
      status: "Live",
    },
    {
      url: "/files/shared",
      label: "Shared with me",
      description: "Files other users granted access to.",
      filePath: "app/(core)/files/shared/page.tsx",
      status: "Live",
    },
    {
      url: "/files/folders",
      label: "Folders",
      description: "Folder management view.",
      filePath: "app/(core)/files/folders/page.tsx",
      status: "Live",
    },
    {
      url: "/files/photos",
      label: "Photos",
      description: "Image-focused gallery view.",
      filePath: "app/(core)/files/photos/page.tsx",
      status: "Live",
    },
    {
      url: "/files/trash",
      label: "Trash",
      description: "Soft-deleted files — restore or hard-delete.",
      filePath: "app/(core)/files/trash/page.tsx",
      status: "Live",
    },
    {
      url: "/files/activity",
      label: "Activity",
      description: "Per-user file activity feed.",
      filePath: "app/(core)/files/activity/page.tsx",
      status: "Live",
    },
    {
      url: "/files/requests",
      label: "File requests",
      description: "Inbound file-request flows.",
      filePath: "app/(core)/files/requests/page.tsx",
      status: "Live",
    },
    {
      url: "/files/f/<path>",
      label: "File / folder detail",
      description: "Path-addressed file or folder view.",
      filePath: "app/(core)/files/f/",
      status: "Live",
    },
    {
      url: "/files/webhooks",
      label: "Webhooks",
      description:
        "Register HTTPS endpoints for signed event callbacks (owner + org-wide scopes). Delivery health, Send test, per-delivery redeliver + latency. DB-native pipeline: files.webhook_dispatch/reconcile over platform.activity_log via pg_cron + pg_net.",
      filePath: "app/(core)/files/webhooks/page.tsx",
      status: "Live",
      notes: [
        "CRUD direct against files schema (owner RLS), no Python hop",
        "Secret shown once at create/rotate (never on list reads)",
        "Manual redeliver via files.webhook_redeliver RPC (owner-checked)",
        "Org-wide fan-out: webhooks.organization_id + iam.is_org_member matching",
      ],
    },
    {
      url: "/files/admin",
      label: "Admin map (this page)",
      description: "Admin index of every files resource.",
      filePath: "app/(core)/files/admin/page.tsx",
      status: "Live",
    },
  ],

  components: [
    {
      name: "fileHandler",
      filePath: "features/files/handler/handler.ts",
      description:
        "THE single entry point for every file flow (upload, display, attach, durable URLs). Never call Files.uploadFile or supabase.storage directly.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "WebhooksManager",
      filePath: "features/files/webhooks/components/WebhooksManager.tsx",
      description:
        "The /files/webhooks surface: create (with org-wide scope), toggle, rotate secret, send test, delivery list with latency + redeliver.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "webhooks service",
      filePath: "features/files/webhooks/service.ts",
      description:
        "Owner-scoped webhook CRUD + webhook_send_test / webhook_redeliver RPC callers (direct files-schema access via filesDb).",
      status: "Live",
      tier: "internal",
    },
    {
      name: "filesDb",
      filePath: "features/files/filesDb.ts",
      description: "Schema-helper wrapper for direct supabase-js access to the files schema.",
      status: "Live",
      tier: "internal",
    },
  ],

  relatedFeatures: [
    {
      name: "Admin Events viewer",
      adminUrl: "/administration/events",
      description:
        "Super-admin viewer over platform.activity_log — watch run.* / file.* / webhook.test events arrive while testing webhook delivery.",
    },
    {
      name: "Sharing & Permissions",
      description:
        "Share links and permission grants emit share_link.* / permission.* events onto the spine (features/sharing).",
    },
    {
      name: "RAG",
      adminUrl: "/knowledge/admin",
      description: "File ingest feeds data stores; file_rag_jobs emits run.completed/run.failed to the spine.",
    },
  ],
};

export default function FilesAdminPage() {
  return <FeatureAdminPage map={FILES_ADMIN_MAP} />;
}
