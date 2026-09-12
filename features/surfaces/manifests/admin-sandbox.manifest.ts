/**
 * Surface manifest — Sandbox Management (`matrx-admin/sandbox`).
 *
 * ADMIN SURFACE. Drives `/administration/compute/sandbox` — the RLS-bound
 * view of sandbox instances the current account is authorized to access (isolated agent
 * execution boxes; see `AdminSandboxManagementPage` in
 * `app/(admin)/administration/compute/sandbox/page.tsx`). The page polls
 * Supabase through `readAllRows` for the full accessible instance list, shows
 * summary stats, a status filter, and an expandable table row per instance;
 * a super-admin can stop, delete, or mint temporary SSH access for an
 * active instance.
 *
 * What an agent bound here may safely do: read the instance list/stats and
 * explain status, diagnose why an accessible instance is stuck/failed, or summarize
 * the accessible rows. It must NOT assume a stop/delete/SSH action it
 * discusses has been taken — those are admin button clicks (fetches to
 * `/api/admin/sandbox/[id]`), not something this surface's context implies
 * happened.
 *
 * SECURITY: this manifest deliberately does NOT declare SSH credentials.
 * The page can display a freshly-minted private key + SSH command in a
 * modal (`sshAccess`), but that is one-time secret material for the admin's
 * own clipboard/download — it is never placed in agent context here.
 *
 * EMITTER: `<SurfaceRuntimeProvider>` in the page component itself, which is
 * this surface's ONLY mount (`createAdminSandboxScope` had zero call sites
 * before 2026-08-13 — the route mapping named the surface in the Agents
 * popover while the surface emitted nothing at all, so every value below
 * reached exactly zero agents). `getScope` there is SYNCHRONOUS over live
 * render state and must stay that way: `useLiveSurfaceScope` samples it every
 * 400ms while a Surface Context window is open, so an emitter that re-fetched
 * Supabase to freshen itself would hammer the RLS-bound read
 * continuously behind a panel that looks idle. The page's own 15s
 * poll is the only fetch; the emitter reads what it already put in state.
 *
 * DELIBERATELY NOT DECLARED, beyond the SSH material above:
 * - `viewerUserId` (Redux `selectUserId`) — ambient session identity, not
 *   surface data. It exists here only to decide which rows link to
 *   `/sandbox/[id]` (the door law comment in the page), and no manifest in
 *   the registry declares a viewer id.
 * - `isRefreshing`, `stoppingIds`, `deleting`, `deleteTarget`, and the SSH
 *   dialog toggles — transient in-flight chrome for a button the admin is
 *   holding down. `accessible_sandbox_list_loading` already carries the one load state
 *   an agent can reason about, and the rest would only flicker through the
 *   400ms sampler.
 *
 * ── WRITE TARGETS: RULED OUT (2026-08-13) ────────────────────────────────
 * This surface declares NO `writeTargets`, deliberately. The reasoning is
 * recorded here so the next agent does not re-scout the same ground.
 *
 * **Nothing on this page is authored.** The route renders zero `<input>`,
 * zero `<textarea>`, zero form. Its complete set of interactive controls is:
 * seven status-filter chips, a refresh button, a row-expand toggle, per-row
 * Stop / Delete / SSH buttons, two `CopyButtons`, and the two dialogs those
 * buttons open. The write-targets bar asks which fields an agent could
 * plausibly AUTHOR better or faster than the human; here the answer is none,
 * because there is no authored field to write into.
 *
 * **Everything that mutates is destruction or spend, and stays a human
 * press.** `handleStop` (PUT `action: "stop"`), `handleDelete` (DELETE), and
 * `handleRequestSsh` (POST → mint credentials) are the only write paths in
 * the file, and each is excluded twice over: by this campaign's own bar
 * (destructive actions stay human; credentials are never agent-drivable),
 * and by settled precedent for exactly this domain in
 * `sandboxes.manifest.ts` — starting / stopping / extending / destroying a
 * sandbox spends real compute and wall-clock, so the human press is the
 * gate. That ruling was made for a user acting on THEIR OWN sandbox; these
 * same buttons can act on another accessible user's running machine, so every
 * argument against it there argues harder here. SSH is the worst of the
 * three: it mints a one-time private key for shell access into a live
 * container. It is not a declared read value for that reason and it is not a
 * write target for the same one.
 *
 * **The two non-destructive candidates fail on their own merits.**
 * - `accessible_sandbox_status_filter` (would be `mode: "ui"`): a seven-chip view
 *   toggle over a table the agent already receives whole in
 *   `accessible_sandbox_instances`. Re-filtering the admin's screen to answer the
 *   agent's own question is the "pure-mechanical toggle nobody would ask an
 *   agent to flip" the bar names, and it would move the view out from under
 *   the human mid-read.
 * - `expanded_accessible_sandbox_instance_id` (same): one row further down, and the
 *   detail it would reveal is already emitted as `expanded_accessible_sandbox_instance`
 *   whenever a row is open — so an agent that wants it has a read, not a
 *   write.
 * Even taken together those are two `ui` toggles with nothing authored
 * behind them, under the bar's ~2-YES-field floor, which asks for a better
 * surface rather than a thin one.
 *
 * **This is a read-only accessible-records console, and that is the point.** What an agent
 * is worth here is diagnosis of the records it was given — why is this instance
 * failed, who is holding boxes, what expires within the hour — which the read half now serves.
 * REVISIT only if the page grows genuinely authored state (a labels editor,
 * an editable TTL/extend field, an admin note per instance); a new button
 * that stops or destroys something is not a reason to revisit.
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
    key: "accessible_sandbox_stats",
    label: "Accessible sandbox stats",
    sortOrder: 100,
    description:
      "Counts across the non-deleted sandbox rows accessible to the current account, independent of the table status filter: active, total, unique users, failed.",
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
  // ── Accessible sandbox stats ─────────────────────────────────────────
  {
    name: "accessible_sandbox_active_count",
    label: "Active accessible instance count",
    description:
      'Count of accessible non-deleted instances currently in a "creating", "starting", "ready", or "running" status. Independent of the table status filter. Always present — 0 while loading or empty.',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 100,
    group: "accessible_sandbox_stats",
  },
  {
    name: "accessible_sandbox_total_count",
    label: "Total accessible instance count",
    description:
      "Count of all accessible non-deleted instances, independent of the table status filter. Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 110,
    group: "accessible_sandbox_stats",
  },
  {
    name: "accessible_sandbox_unique_user_count",
    label: "Unique accessible user count",
    description:
      "Number of distinct user_ids among all accessible non-deleted instances, independent of the table status filter. Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 120,
    group: "accessible_sandbox_stats",
  },
  {
    name: "accessible_sandbox_failed_count",
    label: "Failed accessible instance count",
    description:
      'Count of accessible non-deleted instances with status "failed", independent of the table status filter. Always present.',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 130,
    group: "accessible_sandbox_stats",
  },

  // ── Instance list ────────────────────────────────────────────────────
  {
    name: "accessible_sandbox_status_filter",
    label: "Accessible sandbox status filter",
    description:
      'The active status filter chip for accessible sandbox rows: "all", or one of creating/starting/ready/running/stopped/failed/expired. Always present — defaults to "all".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 200,
    group: "instance_list",
  },
  {
    name: "accessible_sandbox_instances",
    label: "Accessible sandbox instances",
    description:
      "The current page of sandbox instances (up to 100) the current account is authorized to access and that match the status filter, each with { id, sandbox_id, user_id, status, created_at, expires_at, tier, container_id, ttl_seconds, hot_path, cold_path }. Bindable rather than auto-context. Empty array when none match.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 210,
    group: "instance_list",
  },
  {
    name: "accessible_sandbox_list_loading",
    label: "Accessible list loading",
    description:
      "True while the accessible instance list is being (re)fetched. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 220,
    group: "instance_list",
  },
  {
    name: "accessible_sandbox_list_error",
    label: "Accessible list error",
    description:
      "Error message from the last failed accessible-list fetch, stop, or delete action. Absent when the last action succeeded or none has run yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 230,
    group: "instance_list",
  },

  // ── Expanded instance ────────────────────────────────────────────────
  {
    name: "expanded_accessible_sandbox_instance_id",
    label: "Expanded accessible instance ID",
    description:
      "UUID of the accessible instance row the admin has expanded to see full detail. Absent when no row is expanded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "instance_detail",
  },
  {
    name: "expanded_accessible_sandbox_instance",
    label: "Expanded accessible instance detail",
    description:
      "Full detail of the expanded accessible row — { id, sandbox_id, user_id, status, created_at, expires_at, tier, container_id, ttl_seconds, hot_path, cold_path, stop_reason, last_heartbeat_at, config } — exactly the fields the detail panel renders. This is the ONE per-instance value in automatic context: `accessible_sandbox_instances` is bindable-only, so without it an agent knows a row is open but nothing about it. It stringifies past the 200-char default inline ceiling, so it arrives as a DEFERRED context item the agent retrieves on demand rather than inlined prose. Absent when no row is expanded, and also when the expanded id has dropped out of the loaded set (narrowing the status filter retires the row while the id stays set).",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 310,
    group: "instance_detail",
  },
];

export const adminSandboxManifest: SurfaceManifest = {
  surfaceName: ADMIN_SANDBOX_SURFACE_NAME,
  readiness: "verified",
  label: "Accessible Sandboxes",
  urlPattern: "/administration/compute/sandbox",
  intro: `<surface_intro>
This is an ADMIN surface: the accessible-sandboxes console at /administration/compute/sandbox. It contains only the on-demand isolated agent-execution records that the current account is authorized to access; it is not a fleet-wide count or health report. Use the Fleet health link for the existing aggregate per-tier DB and Docker view.

accessible_sandbox_active_count / accessible_sandbox_total_count / accessible_sandbox_unique_user_count / accessible_sandbox_failed_count summarize all accessible non-deleted rows, independent of the active status filter. accessible_sandbox_status_filter tells you which status chip is active; accessible_sandbox_instances is the filtered row data. expanded_accessible_sandbox_instance_id is set when the admin has drilled into one row's full detail, and expanded_accessible_sandbox_instance carries that row itself (container id, TTL, hot/cold storage paths, stop reason, last heartbeat, config) — it is the only per-instance data in your automatic context, since accessible_sandbox_instances is bindable-only.

What you may safely do: read these accessible records to diagnose stuck/failed instances, summarize the records in scope, or explain a status. This surface is READ-ONLY for agents — it declares no write targets, and there is nothing here you can change. Stopping, deleting, or minting SSH access are admin button actions — never assume one happened because it was discussed, and never offer to perform one. SSH credentials are never placed in this surface's context; they are one-time secret material shown only in the admin's own dialog.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** One entry in `accessible_sandbox_instances`. */
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
 * The expanded row's detail panel, field for field — `AdminSandboxInstanceEntry`
 * plus the three fields that only render once a row is open.
 */
export interface AdminSandboxExpandedInstance
  extends AdminSandboxInstanceEntry {
  stop_reason: string | null;
  last_heartbeat_at: string | null;
  config: Record<string, unknown> | null;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminSandboxScope(values: {
  // alwaysAvailable: true → required
  accessible_sandbox_active_count: number;
  accessible_sandbox_total_count: number;
  accessible_sandbox_unique_user_count: number;
  accessible_sandbox_failed_count: number;
  accessible_sandbox_status_filter: string;
  accessible_sandbox_instances: AdminSandboxInstanceEntry[];
  accessible_sandbox_list_loading: boolean;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  accessible_sandbox_list_error?: string;
  expanded_accessible_sandbox_instance_id?: string;
  expanded_accessible_sandbox_instance?: AdminSandboxExpandedInstance;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
