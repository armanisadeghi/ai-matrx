/**
 * Surface manifest — Sandbox Management (`matrx-admin/sandbox`).
 *
 * ADMIN SURFACE. Drives `/administration/compute/sandbox` — the super-admin
 * console over the platform's on-demand sandbox instances (isolated agent
 * execution boxes; see `AdminSandboxManagementPage` in
 * `app/(admin)/administration/compute/sandbox/page.tsx`). The page polls
 * `/api/admin/sandbox` for the full instance list across ALL users, shows
 * summary stats, a status filter, and an expandable table row per instance;
 * a super-admin can stop, delete, or mint temporary SSH access for an
 * active instance.
 *
 * What an agent bound here may safely do: read the instance list/stats and
 * explain status, diagnose why an instance is stuck/failed, or summarize
 * usage across users. It must NOT assume a stop/delete/SSH action it
 * discusses has been taken — those are admin button clicks (fetches to
 * `/api/admin/sandbox/[id]`), not something this surface's context implies
 * happened.
 *
 * SECURITY: this manifest deliberately does NOT declare SSH credentials.
 * The page can display a freshly-minted private key + SSH command in a
 * modal (`sshAccess`), but that is one-time secret material for the admin's
 * own clipboard/download — it is never placed in agent context here.
 *
 * NO EMITTER WIRED YET — see `readinessNote`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_SANDBOX_SURFACE_NAME = "matrx-admin/sandbox";

const groups: SurfaceValueGroup[] = [
  {
    key: "fleet_stats",
    label: "Fleet stats",
    sortOrder: 100,
    description:
      "Summary counts across all sandbox instances currently loaded: active, total, unique users, failed.",
  },
  {
    key: "instance_list",
    label: "Instance list",
    sortOrder: 200,
    description:
      "The filtered table of sandbox instances, the active status filter, and load/error state.",
  },
  {
    key: "instance_detail",
    label: "Expanded instance",
    sortOrder: 300,
    description:
      "The single instance row the admin has expanded, if any — its full detail (container, TTL, paths, config).",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Fleet stats ──────────────────────────────────────────────────────
  {
    name: "sandbox_active_count",
    label: "Active instance count",
    description:
      'Count of instances currently in a "creating", "starting", "ready", or "running" status among the loaded (filtered) set. Always present — 0 while loading or empty.',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 100,
    group: "fleet_stats",
  },
  {
    name: "sandbox_total_count",
    label: "Total instance count",
    description:
      "Count of instances currently loaded (matching the active status filter, up to the 100-row page limit). Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 110,
    group: "fleet_stats",
  },
  {
    name: "sandbox_unique_user_count",
    label: "Unique user count",
    description:
      "Number of distinct user_ids among the loaded instances. Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 120,
    group: "fleet_stats",
  },
  {
    name: "sandbox_failed_count",
    label: "Failed instance count",
    description:
      'Count of instances with status "failed" among the loaded set. Always present.',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 130,
    group: "fleet_stats",
  },

  // ── Instance list ────────────────────────────────────────────────────
  {
    name: "sandbox_status_filter",
    label: "Status filter",
    description:
      'The active status filter chip: "all", or one of creating/starting/ready/running/stopped/failed/expired. Always present — defaults to "all".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 200,
    group: "instance_list",
  },
  {
    name: "sandbox_instances",
    label: "Sandbox instances",
    description:
      "The current page of sandbox instances (up to 100) matching the status filter, each with { id, sandbox_id, user_id, status, created_at, expires_at, tier, container_id, ttl_seconds, hot_path, cold_path }. Bindable rather than auto-context — this is per-user infrastructure data across the whole platform. Empty array when none match.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 210,
    group: "instance_list",
  },
  {
    name: "sandbox_list_loading",
    label: "List loading",
    description: "True while the instance list is being (re)fetched. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 220,
    group: "instance_list",
  },
  {
    name: "sandbox_list_error",
    label: "List error",
    description:
      "Error message from the last failed fetch, stop, or delete action. Absent when the last action succeeded or none has run yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 230,
    group: "instance_list",
  },

  // ── Expanded instance ────────────────────────────────────────────────
  {
    name: "expanded_sandbox_instance_id",
    label: "Expanded instance ID",
    description:
      "UUID of the instance row the admin has expanded to see full detail. Absent when no row is expanded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "instance_detail",
  },
];

export const adminSandboxManifest: SurfaceManifest = {
  surfaceName: ADMIN_SANDBOX_SURFACE_NAME,
  readiness: "stub",
  readinessNote:
    "Manifest audited against the live AdminSandboxManagementPage state (instances, statusFilter, loading, error, expandedRow, derived stats). No SurfaceRuntimeProvider is wired yet — deferred alongside server-logs; a follow-up pass should add the provider to page.tsx once an agent role for this surface is defined.",
  label: "Sandbox Management",
  urlPattern: "/administration/compute/sandbox",
  intro: `<surface_intro>
This is an ADMIN surface: the super-admin sandbox fleet console at /administration/compute/sandbox — every on-demand isolated agent-execution instance across every user, not just the current admin's own.

sandbox_active_count / sandbox_total_count / sandbox_unique_user_count / sandbox_failed_count summarize the currently loaded (filtered) set; sandbox_status_filter tells you which status chip is active; sandbox_instances is the actual row data. expanded_sandbox_instance_id is set when the admin has drilled into one row's full detail (container id, TTL, hot/cold storage paths, config).

What you may safely do: read this fleet data to diagnose stuck/failed instances, summarize usage across users, or explain a status. Stopping, deleting, or minting SSH access are admin button actions — never assume one happened because it was discussed. SSH credentials are never placed in this surface's context; they are one-time secret material shown only in the admin's own dialog.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** One entry in `sandbox_instances`. */
export interface AdminSandboxInstanceEntry {
  id: string;
  sandbox_id: string;
  user_id: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  tier: string | null;
  container_id?: string | null;
  ttl_seconds: number;
  hot_path?: string | null;
  cold_path?: string | null;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminSandboxScope(values: {
  // alwaysAvailable: true → required
  sandbox_active_count: number;
  sandbox_total_count: number;
  sandbox_unique_user_count: number;
  sandbox_failed_count: number;
  sandbox_status_filter: string;
  sandbox_instances: AdminSandboxInstanceEntry[];
  sandbox_list_loading: boolean;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  sandbox_list_error?: string;
  expanded_sandbox_instance_id?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
