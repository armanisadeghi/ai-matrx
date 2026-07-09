import CmsAgentsAdminClient from "@/features/cms/components/admin/CmsAgentsAdminClient";

/**
 * CMS Agent Activity — the fleet-wide visibility surface (master plan P5,
 * feature-visibility-surface doctrine). Gating: the `(admin)` route group
 * layout already enforces super-admin server-side; the `/api/cms/sites`
 * `admin_*` / `/api/cms/pages` `admin_list` / `/api/cms/approvals` actions
 * this page calls independently re-check `requireSuperAdmin` on every request.
 *
 * Shows every agent + human write against the CMS project
 * (viyklljfdhtidwecakwx) across the whole fleet — activity feed, per-site
 * page tree with preview/live links, the F4 agent-write-policy editor, and
 * the F3 validation-exception approvals queue.
 */
export default function CmsAgentsAdminPage() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-hidden">
      <CmsAgentsAdminClient />
    </div>
  );
}
