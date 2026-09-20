import CmsAgentsAdminClient from "@/features/cms/components/admin/CmsAgentsAdminClient";

/**
 * CMS Agent Activity — the fleet-wide visibility surface (master plan P5,
 * feature-visibility-surface doctrine). Gating: the `(admin)` route group
 * layout already enforces super-admin server-side; the `/api/cms/sites`
 * `admin_*` / `/api/cms/pages` `admin_list` actions
 * this page calls independently re-check `requireSuperAdmin` on every request.
 *
 * Shows every agent + human write against the CMS project
 * (viyklljfdhtidwecakwx) across the whole fleet — activity feed, per-site
 * page tree with preview/live links, the F4 agent-write-policy editor, and
 * THE ONE platform approval queue narrowed to content exceptions (register
 * Q-1, 2026-09-19 — the same rows appear, unfiltered, at /approvals; deciding
 * one goes through aidream's door, never a write from here).
 */
export default function CmsAgentsAdminPage() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-hidden">
      <CmsAgentsAdminClient />
    </div>
  );
}
