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
 *
 * ── WHAT IS NOT WRITABLE HERE, AND WHY (2026-08-12) ──────────────────────
 * Two ask-policy STAGING targets on the terminal are declared below; this
 * section is the other half of that ruling — the exclusions, kept because
 * they are the reasoning the next agent would otherwise re-derive. It began
 * as a parallel assessment that ruled the whole surface out; that conclusion
 * was reconciled (see the `writeTargets` docblock), but its analysis of what
 * this surface does NOT earn stands unchanged and is the settled posture.
 *
 * **`sandbox_config` is EVIDENCE, not a form.** This is the value that makes
 * the surface look writable, so it is the one to be precise about. It is
 * `instance.config` — a column on the `sandbox_instances` row fetched from
 * `GET /api/sandbox/[id]` and re-polled every 10s. The detail page renders it
 * through `<pre>{JSON.stringify(instance.config, null, 2)}</pre>` in the
 * "Configuration" card (and again in the admin panel). There is no setter, no
 * form, no dirty state and no PATCH route: it is the read-back of what the
 * orchestrator was handed at create time. The config a user actually composes
 * lives somewhere else entirely — `useSandboxCreate` on the `/sandbox` LIST
 * mount — and is not a declared surface value at all. Re-writing it after the
 * fact would also be meaningless: the container is already built from it.
 *
 * **Per-mount posture — the LIST mount earns nothing; the detail mount earns
 * staging and nothing else.**
 * - `/sandbox` (list) owns fetched instance evidence, browse state
 *   (`historyOpen`, `selectedHistoryIds`) and the create-dialog form. Its only
 *   write paths are `createInstance` / `stopInstance` / `deleteInstance(s)` —
 *   spend or destruction, both human. The create form has ZERO authored
 *   fields: `tier` is a two-option toggle, `template` an enum from the fetched
 *   catalog, `template_version` derived from the template, `resources` three
 *   hosted-only numbers, TTL a 1/2/4/8h preset — all already defaulted to the
 *   user's last-used choice from Redux prefs. Those are the skill's own
 *   "pure-mechanical toggles nobody would ask an agent to flip", they exist
 *   only while the modal is open, and the very next act is Create Sandbox.
 *   Staging a machine-start config is driving the start by proxy.
 *   (The `CrawlsTable` posture in `marketing-crawls`: a list over immutable
 *   evidence registers nothing.)
 * - `/sandbox/[id]` (detail) owns the polled `instance` (every declared value
 *   bar the shell ones is a projection of it), the shell session, and dialog
 *   toggles. Its EXECUTING write paths — `handleExec`, `handleStop`,
 *   `handleExtend`, `handleDelete` — are all excluded below, and no declared
 *   target may reach any of them. What it does earn is the two STAGING
 *   targets in the `writeTargets` block: the command box and the prompt's
 *   working directory, neither of which touches the machine.
 *
 * **Excluded by settled campaign precedent, said explicitly rather than by
 * omission:**
 * 1. Starting / stopping / extending / destroying a sandbox. It spends real
 *    compute and wall-clock; the human press stays the gate
 *    (`podcast-studio`, `image-generate`, `marketing-crawls`).
 * 2. Running commands. `command_history` and `terminal_output` are the RECORD
 *    of what a machine actually did — the input-vs-output line `voice-pad`
 *    drew around transcripts — and executing arbitrary shell is the most
 *    dangerous act on this surface.
 * 3. `container_id`, `sandbox_proxy_url`, hot/cold paths, heartbeat, expiry,
 *    status, and both ids: infrastructure identity and execution evidence.
 *
 * **`commandInput` is NOT on this list, and that was the contested call.**
 * The parallel assessment placed it here — inert characters, but in a
 * single-line prompt where Enter RUNS, so a weaker gate than the
 * `matrx-admin/database` `sql_query` precedent it would lean on, and only ONE
 * target once execution is excluded, under the skill's ~2 floor. Both halves
 * of that were answered rather than overruled, and the full argument lives in
 * the `writeTargets` docblock: the focus defect it correctly identified is
 * fixed, the staged-vs-typed affordance it correctly demanded is now built,
 * and the count is two — `working_directory` became declarable once
 * `handleExec` started sending the DISPLAYED cwd, which is a second authored
 * field, not a re-slice of the first. What survives from that assessment is
 * everything above and the hard line below: staging is the ceiling, and there
 * is no execute target at any price.
 *
 * The `SandboxDiagnosticsPanel` was checked too and changes nothing: its only
 * inputs are `fsRootPath`, `envFilter`, `envView`, `logSource`, `logTail` —
 * browse/view state over a read-only inspector — `fileContent` is display-only
 * with no write-file path behind it, and Reset is destructive.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
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
      "Directory the terminal prompt shows and that the next command runs in (defaults to /home/agent). The server echoes the real cwd back after every command, so a `cd` the user ran is reflected here. Empty on the list page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 500,
    group: "shell_session",
  },
  {
    name: "staged_command",
    label: "Staged command",
    description:
      "What is currently typed into the terminal's command input on the detail page but NOT yet run — the box the user presses Enter on. Usually empty, because running a command clears the box. Empty on the list page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 505,
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

/**
 * Write targets — the agent COMPOSES, the human RUNS.
 *
 * Both targets stage into the terminal's input row on `/sandbox/[id]` and
 * stop there. That boundary is the whole design, not a limitation we plan to
 * relax:
 *
 * There is deliberately NO `run_command` / `submit` / `execute` target, and
 * no handler here may reach `handleExec`. A sandbox shell is arbitrary code
 * execution on a live machine — `rm -rf`, an outbound curl, a package
 * install — and the writeback seam's `ask` confirm is a one-line dialog, not
 * an informed review of what a command will do. The judgment bar puts
 * anything destructive on the human side of the line, and "destructive" is
 * unknowable in advance for a shell string. Staging is the opposite: the
 * command lands in the box in plain sight, the user reads it, and pressing
 * Enter is the consent. Nothing an agent applies here changes the machine.
 *
 * This is why the `tasks` surface's `save_task` action target does NOT
 * generalize to a `run_command` here. `save_task` persists a draft the user
 * has already been shown, into a row they own, and every field of it is
 * reversible by editing and saving again. A shell command is neither
 * previewed-by-its-value nor reversible — the blast radius is the container
 * and anything it can reach. Same seam, different bar.
 *
 * Terminal output, command history, and the executing flag are OUTPUT and
 * status, never targets. Stop / Extend / Delete stay human — they are header
 * actions against the live machine, and delete is destructive by definition.
 *
 * ── THE COUNTER-ARGUMENT, and how it was settled (2026-08-12) ───────────
 * TWO agents assessed this surface in parallel and reached OPPOSITE
 * conclusions: one shipped these targets, one ruled the surface out entirely
 * and wrote a "no writeTargets, do not re-assign" block into this same file.
 * Both landed. For a while this manifest said both things at once — the exact
 * docs-contradict-code hazard the campaign has been bitten by repeatedly.
 * This block is the reconciliation, and the ruling-out argument is recorded
 * here rather than deleted, because it was RIGHT about two things and both
 * are now fixed rather than argued away.
 *
 * Its point: unlike `matrx-admin/database`'s `sql_query` — the precedent for
 * letting an agent draft an inert command — this prompt is a SINGLE-LINE
 * input where **Enter runs**, it carries `autoFocus`, and the terminal body
 * re-focuses it on any click. So a staged command can sit in an
 * already-focused live shell one reflexive keystroke from executing, where
 * the SQL workbench needs a deliberate, separately-located Execute press.
 *
 * **Both concrete objections are closed in code, not in prose:**
 * 1. THE FOCUS DEFECT (real, and this page had it). The `command_input`
 *    handler used to call `inputRef.current?.focus()` after staging, which
 *    manufactured exactly that already-focused-prompt hazard. It no longer
 *    does — see the comment at that handler. Verified live: the active
 *    element after an apply is `BODY`, not the prompt.
 * 2. THE STAGED-VS-TYPED AFFORDANCE (also real; was a KNOWN GAP here and is
 *    now built). The input carries a "staged by agent · not run" marker
 *    whenever a value arrived through one of these targets, and it clears on
 *    the user's very first keystroke, on history recall, and on exec — so an
 *    agent-written command is no longer indistinguishable from a typed one,
 *    and the marker cannot outlive the value it describes.
 *
 * With those closed, the gate is: read the `ask` dialog naming the target and
 * its contract → click Apply → the command sits VISIBLE, UNFOCUSED and
 * MARKED → deliberately click into the prompt → Enter. That is one act longer
 * than the `sql_query` precedent it was measured against (ask confirm, then
 * one Execute press), so the gate objection no longer separates them.
 * Nothing an agent applies here changes the machine, and a wrong command is
 * cleared by typing over it.
 *
 * The floor objection ("one target, under ~2") also resolves on the count:
 * `working_directory` is a genuine second authored field, declarable because
 * `handleExec` now sends the DISPLAYED cwd. And `voice-pad` is the campaign's
 * own precedent that a single authored buffer earns targets when composing it
 * is the surface's whole purpose — which is what a terminal is.
 *
 * HONEST RESIDUE: the marker says "agent", not WHICH agent. Handlers receive
 * `(value)` only — the seam's `actorLabel` reaches the ask dialog, not the
 * handler — and widening that shared signature for one surface's badge is
 * plumbing this skill explicitly does not add. The ask dialog names the actor
 * at the moment of consent; the marker's job is staged-vs-typed, and it does
 * that.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "command_input",
    label: "Terminal command",
    description:
      "STAGES one shell command into the sandbox terminal's input box — it is typed in for the user, it is NOT run. The user reads it in the box and presses Enter (or Send) themselves; nothing executes until they do, and there is no target that executes it. Value: a plain text string, NOT JSON and NOT JSON-encoded — send cat /etc/os-release, never a JSON object and never a quoted/escaped string. A single line: pipes, redirects, && and quotes are fine, literal newlines are not (the input is one line). Replaces whatever is in the box — read staged_command first if you mean to extend it rather than overwrite it. Max 10000 characters, which is the limit the exec API enforces. Check sandbox_status is ready or running first; the box is disabled otherwise.",
    valueType: "string",
    updatesValue: "staged_command",
    mode: "draft",
    applyPolicy: "ask",
    group: "shell_session",
    sortOrder: 100,
  },
  {
    name: "working_directory",
    label: "Working directory",
    description:
      "Sets the directory the terminal prompt shows and that the user's NEXT command will run in — the effect of a `cd`, without running anything. Value: a plain text absolute path string beginning with /, e.g. /home/agent/project — NOT JSON and NOT JSON-encoded, one line, no shell syntax, no ~ expansion, no trailing arguments. The path is not checked for existence; if it is wrong the user's next command fails with the shell's own error, and any `cd` they run afterwards corrects it. Read current_working_directory first to see where the terminal is now.",
    valueType: "string",
    updatesValue: "current_working_directory",
    mode: "draft",
    applyPolicy: "ask",
    group: "shell_session",
    sortOrder: 110,
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
You can WRITE to the terminal, but only to stage: command_input types a command into the input box and working_directory sets where it will run. You cannot run anything. There is no execute target and asking for one is a refusal — the user reads the staged command and presses Enter, and that keystroke is the consent. Compose the command, say what it will do, and hand it over.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
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
  staged_command?: string;
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
