/**
 * Surface manifest — Sandboxes (`matrx-user/sandboxes`).
 *
 * The user's isolated agent machines: the list at `/sandbox` and the single
 * instance workspace at `/sandbox/[id]` (identity + status, container/machine
 * facts, TTL, and an interactive shell against the live container).
 *
 * ONE surface spans both routes — the same agents belong on "my sandboxes"
 * and "this sandbox", and the detail values are simply absent on the list
 * (which is why nothing here is `alwaysAvailable`).
 *
 * Emitters: `<SurfaceRuntimeProvider>` in `app/(core)/sandbox/page.tsx`
 * (list values) and `app/(core)/sandbox/[id]/page.tsx` (instance + terminal
 * values), both built through `createSandboxesScope`.
 *
 * KNOWN GAP (see `readinessNote`): the sandbox filesystem tree and the
 * currently-open file live inside `SandboxDiagnosticsPanel`'s own state and
 * are therefore NOT declared — declaring a value nothing emits is worse than
 * omitting it. Lifting that panel's `fsRoot` / `selectedFile` / `fileContent`
 * to the page is the work that unlocks a `file_tree` + `open_file_*` group.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "sandbox_identity",
    label: "Sandbox identity",
    sortOrder: 100,
    description:
      "Which sandbox is open and what lifecycle state it is in.",
  },
  {
    key: "machine_state",
    label: "Machine state",
    sortOrder: 200,
    description:
      "The running container / VM behind the sandbox — ids, paths, reachability, heartbeat, and its creation config.",
  },
  {
    key: "shell_session",
    label: "Shell session",
    sortOrder: 300,
    description:
      "The interactive terminal on the detail page: working directory, commands run, and output produced this visit.",
  },
  {
    key: "sandbox_list",
    label: "Sandbox list",
    sortOrder: 400,
    description:
      "The user's sandboxes as shown on the `/sandbox` list page.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Identity ────────────────────────────────────────────────────────
  {
    name: "sandbox_instance_id",
    label: "Sandbox instance id",
    description:
      "UUID of the `sandbox_instances` row the user has open. Empty on the `/sandbox` list page, where no single sandbox is focused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "sandbox_identity",
  },
  {
    name: "sandbox_id",
    label: "Orchestrator sandbox id",
    description:
      "The orchestrator's own id for the sandbox (what the container is addressed by, and what the header shows). Empty on the list page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 310,
    group: "sandbox_identity",
  },
  {
    name: "sandbox_status",
    label: "Sandbox status",
    description:
      "Effective lifecycle status of the open sandbox — creating, starting, ready, running, shutting_down, stopped, failed, or expired. Empty on the list page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 320,
    group: "sandbox_identity",
  },
  {
    name: "sandbox_stop_reason",
    label: "Stop reason",
    description:
      "Why the sandbox stopped (user_requested, expired, error, graceful_shutdown, admin). Empty while it is still running.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 330,
    group: "sandbox_identity",
  },
  {
    name: "sandbox_created_at",
    label: "Created at",
    description:
      "ISO timestamp the open sandbox was created. Empty on the list page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 340,
    group: "sandbox_identity",
  },
  {
    name: "sandbox_expires_at",
    label: "Expires at",
    description:
      "ISO timestamp the sandbox's TTL runs out and it is reclaimed. Empty on the list page or when no TTL is set.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 350,
    group: "sandbox_identity",
  },
  {
    name: "sandbox_time_remaining",
    label: "Time remaining",
    description:
      "Human-readable countdown to expiry as rendered on the page (e.g. \"1h 12m 03s\"). Empty on the list page; reads as expired once the TTL has passed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 14,
    sortOrder: 360,
    group: "sandbox_identity",
  },

  // ── Machine ─────────────────────────────────────────────────────────
  {
    name: "container_id",
    label: "Container id",
    description:
      "Id of the container backing the sandbox. Empty on the list page and before the machine finishes starting.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 64,
    sortOrder: 400,
    group: "machine_state",
  },
  {
    name: "sandbox_proxy_url",
    label: "Proxy URL",
    description:
      "Public proxied base URL exposing the in-container server. Empty on the list page or when the tier's orchestrator URL is unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 410,
    group: "machine_state",
  },
  {
    name: "sandbox_hot_path",
    label: "Hot path",
    description:
      "Working (hot) filesystem path inside the sandbox. Empty on the list page or when the orchestrator has not reported one.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 420,
    group: "machine_state",
  },
  {
    name: "sandbox_cold_path",
    label: "Cold path",
    description:
      "Persisted (cold) storage path for the sandbox. Empty on the list page or when the orchestrator has not reported one.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 430,
    group: "machine_state",
  },
  {
    name: "sandbox_last_heartbeat_at",
    label: "Last heartbeat",
    description:
      "ISO timestamp of the last heartbeat the in-container agent reported. Empty when the sandbox has never checked in.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 440,
    group: "machine_state",
  },
  {
    name: "sandbox_config",
    label: "Sandbox config",
    description:
      "The creation config for the open sandbox — tier, template, template version, resource requests, labels. Empty on the list page.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 350,
    sortOrder: 450,
    group: "machine_state",
  },
  {
    name: "sandbox_instance",
    label: "Full sandbox record",
    description:
      "The complete decorated `sandbox_instances` row for the open sandbox (every field above plus the raw columns). Empty on the list page. Redundant with the named values — bind explicitly when the whole record is genuinely needed.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 460,
    group: "machine_state",
  },

  // ── Shell ───────────────────────────────────────────────────────────
  {
    name: "current_working_directory",
    label: "Working directory",
    description:
      "Server-tracked cwd of the interactive terminal on the detail page (defaults to /home/agent). Empty on the list page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 500,
    group: "shell_session",
  },
  {
    name: "command_history",
    label: "Commands run",
    description:
      "Ordered list of shell commands the user has run in this terminal session. Empty array before the first command; not persisted across reloads.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 510,
    group: "shell_session",
  },
  {
    name: "terminal_output",
    label: "Terminal output",
    description:
      "The full terminal transcript this visit — commands with their stdout, stderr, and exit codes. Empty before the first command. Can be very large; bind explicitly.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 520,
    group: "shell_session",
  },

  // ── List ────────────────────────────────────────────────────────────
  {
    name: "active_sandbox_count",
    label: "Active sandboxes",
    description:
      "How many of the user's sandboxes are currently in an active status. Empty on the detail page.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 600,
    group: "sandbox_list",
  },
  {
    name: "total_sandbox_count",
    label: "Total sandboxes",
    description:
      "Server-reported total number of sandboxes for the user's effective organization, active and historical. Empty on the detail page.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 610,
    group: "sandbox_list",
  },
  {
    name: "sandbox_list",
    label: "Sandbox list",
    description:
      "The loaded page of the user's sandbox records as shown on `/sandbox`, active and historical. Empty on the detail page. Large — bind explicitly.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    autoContext: false,
    sortOrder: 620,
    group: "sandbox_list",
  },
];

export const sandboxesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/sandboxes",
  readiness: "partial",
  readinessNote:
    "List + instance + shell values are declared and emitted. The sandbox filesystem tree and the currently-open file are NOT declared because they live in SandboxDiagnosticsPanel's local state and the page cannot emit them; lifting fsRoot / selectedFile / fileContent to app/(core)/sandbox/[id]/page.tsx is the remaining work. Terminal output is also session-only — there is no persisted run history to declare.",
  label: "Sandboxes",
  urlPattern: "/sandbox",
  intro: `<surface_intro>
You are on Sandboxes — the user's isolated Linux machines for agent work. Two views share this surface: the list at /sandbox (their sandboxes, active and historical) and the workspace at /sandbox/[id] for one sandbox.
On the list, sandbox_list / active_sandbox_count / total_sandbox_count are populated and the single-sandbox values are empty. On the workspace, it is the reverse: sandbox_id, sandbox_status, the machine values (container_id, sandbox_proxy_url, hot/cold paths, sandbox_config), the TTL values (sandbox_expires_at, sandbox_time_remaining), and the live shell session (current_working_directory, command_history, terminal_output) are populated.
A sandbox is ephemeral: it expires on its TTL and everything in the shell session is lost on reload. Treat sandbox_status and sandbox_time_remaining as the first things to check before suggesting any action against the machine.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Nothing is required: the list page and the detail page each populate their
 * own half of this surface, so every key is optional by construction.
 */
export function createSandboxesScope(values: {
  sandbox_instance_id?: string;
  sandbox_id?: string;
  sandbox_status?: string;
  sandbox_stop_reason?: string;
  sandbox_created_at?: string;
  sandbox_expires_at?: string;
  sandbox_time_remaining?: string;
  container_id?: string;
  sandbox_proxy_url?: string;
  sandbox_hot_path?: string;
  sandbox_cold_path?: string;
  sandbox_last_heartbeat_at?: string;
  sandbox_config?: unknown;
  sandbox_instance?: unknown;
  current_working_directory?: string;
  command_history?: string[];
  terminal_output?: string;
  active_sandbox_count?: number;
  total_sandbox_count?: number;
  sandbox_list?: unknown[];
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
