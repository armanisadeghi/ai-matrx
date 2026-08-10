/**
 * Surface manifest — Schedules (`matrx-user/schedules`).
 *
 * Drives the whole scheduling control plane in the user app: `/schedules`
 * (list), `/schedules/[id]` (detail), `/schedules/[id]/edit` and
 * `/schedules/new` (editor). Backed by `features/scheduling/**` — the
 * `sch_*` spine hydrated into Redux by `useScheduledTasks` /
 * `useTaskDetail` / `useTaskRuns` and kept live by Supabase realtime.
 *
 * ONE surface covers list + detail + editor (the sitemaps pattern): the same
 * agents belong on all four routes and the routes share a vocabulary. That
 * means almost nothing is `alwaysAvailable` — the open schedule exists only
 * on the detail/edit routes, the draft only in the editor, the roster only
 * where the list hook has hydrated.
 *
 * Runtime emitters (each mounts its own `<SurfaceRuntimeProvider>`; the
 * deepest mounted provider wins):
 *   - `components/list/ScheduleList.tsx`   — roster + counts + load status
 *   - `components/detail/ScheduleDetail.tsx` — roster + open schedule +
 *     trigger + target action + run history
 *   - `components/form/ScheduleForm.tsx`   — editor draft state (new/edit)
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
    key: "schedule_roster",
    label: "Schedule roster",
    sortOrder: 100,
    description:
      "Every schedule the user owns, as hydrated by useScheduledTasks. Present on all four routes.",
  },
  {
    key: "open_schedule",
    label: "Open schedule",
    sortOrder: 200,
    description:
      "Identity, timing and status of the single schedule open on the detail or edit route. Empty on the list and on /schedules/new.",
  },
  {
    key: "schedule_target",
    label: "Target action",
    sortOrder: 300,
    description:
      "What the open schedule actually runs — agent, prompt, variables, auth mode and execution limits.",
  },
  {
    key: "schedule_runs",
    label: "Run history",
    sortOrder: 400,
    description:
      "Past and in-flight runs of the open schedule, streamed live from sch_run. Detail route only.",
  },
  {
    key: "schedule_editor",
    label: "Editor draft",
    sortOrder: 500,
    description:
      "The unsaved form state on /schedules/new and /schedules/[id]/edit.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Schedule roster ───────────────────────────────────────────────────
  {
    group: "schedule_roster",
    name: "schedules_summary",
    label: "Schedules summary",
    description:
      "One entry per schedule the user owns: id, title, description, enabled flag, trigger type + humanized trigger, next_due_at, last_run_at, surfaces and tags. Empty while the list is still loading, when the fetch failed, or when the user has no schedules.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2400,
    autoContext: false,
    sortOrder: 300,
  },
  {
    group: "schedule_roster",
    name: "schedule_counts",
    label: "Schedule counts",
    description:
      "How the roster breaks down: { total, enabled, disabled }. Zeroes when the user has no schedules; empty while the list is still loading or the fetch failed.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 50,
    sortOrder: 310,
  },
  {
    group: "schedule_roster",
    name: "schedules_load_status",
    label: "Schedules load status",
    description:
      "State of the roster fetch as the page sees it: idle | loading | success | error, plus the error message when it failed. Always emitted by the routes that hydrate the list.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 70,
    sortOrder: 320,
  },

  // ── Open schedule ─────────────────────────────────────────────────────
  {
    group: "open_schedule",
    name: "schedule_id",
    label: "Open schedule ID",
    description:
      "UUID of the schedule open on /schedules/[id] or /schedules/[id]/edit. Empty on the list route and on /schedules/new.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 400,
  },
  {
    group: "open_schedule",
    name: "schedule_title",
    label: "Schedule title",
    description:
      "Human title of the open schedule. Empty on the list route and while the detail row is still loading.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 410,
  },
  {
    group: "open_schedule",
    name: "schedule_description",
    label: "Schedule description",
    description:
      "Free-text description the user gave the open schedule. Empty when the schedule has none, or on the list route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 420,
  },
  {
    group: "open_schedule",
    name: "schedule_enabled",
    label: "Schedule enabled",
    description:
      "Whether the open schedule is currently armed. False means it is paused and will not fire. Empty on the list route.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 430,
  },
  {
    group: "open_schedule",
    name: "schedule_trigger",
    label: "Trigger",
    description:
      "The open schedule's trigger as stored: { type (one-shot | interval | cron | heartbeat | context-match | event | manual | dependency), config, enabled, next_due_at, last_fired_at }. Empty on the list route or when the schedule has no trigger yet.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 220,
    sortOrder: 440,
  },
  {
    group: "open_schedule",
    name: "schedule_trigger_summary",
    label: "Trigger in words",
    description:
      "The humanized trigger string the UI shows (e.g. \"Every hour\", \"At 09:00 on weekdays (America/Los_Angeles)\"). Empty on the list route or when the schedule has no trigger.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 450,
  },
  {
    group: "open_schedule",
    name: "schedule_next_due_at",
    label: "Next run",
    description:
      "ISO timestamp of the next fire the scheduler has computed for the open schedule. Empty when the schedule is paused, expired, or has no future fire; empty on the list route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 460,
  },
  {
    group: "open_schedule",
    name: "schedule_last_run_at",
    label: "Last run",
    description:
      "ISO timestamp of the last time the open schedule fired. Empty when it has never run, or on the list route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 470,
  },
  {
    group: "open_schedule",
    name: "schedule_surfaces",
    label: "Execution surfaces",
    description:
      "Surfaces allowed to claim and run this schedule (any | web | desktop | chrome-extension-chat | mobile | sandbox | server). Empty on the list route.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 480,
  },
  {
    group: "open_schedule",
    name: "schedule_tags",
    label: "Schedule tags",
    description:
      "User-applied tags on the open schedule. Empty array when untagged; empty on the list route.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 490,
  },
  {
    group: "open_schedule",
    name: "schedule_queue",
    label: "Queue",
    description:
      "Name of the queue this schedule's runs are dispatched onto. Empty on the list route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 500,
  },
  {
    group: "open_schedule",
    name: "schedule_expires_at",
    label: "Expires at",
    description:
      "ISO timestamp after which the open schedule stops firing. Empty when it never expires, or on the list route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 510,
  },
  {
    group: "open_schedule",
    name: "open_schedule",
    label: "Open schedule record",
    description:
      "The whole open schedule as one object (identity, timing, status, surfaces, tags, trigger and target action) — the composite of the individual values in this group and Target action. Empty on the list route and on /schedules/new.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 520,
  },

  // ── Target action ─────────────────────────────────────────────────────
  {
    group: "schedule_target",
    name: "schedule_agent_id",
    label: "Target agent",
    description:
      "UUID of the agent the open schedule runs. Empty when the schedule carries a bare prompt with no bound agent, or on the list route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 600,
  },
  {
    group: "schedule_target",
    name: "schedule_prompt",
    label: "Scheduled prompt",
    description:
      "The prompt text sent on every fire of the open schedule. Empty on the list route or while the detail row is loading.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 610,
  },
  {
    group: "schedule_target",
    name: "schedule_variables",
    label: "Scheduled variables",
    description:
      "Variable payload merged into the run at fire time, as a key/value object. Empty object when the schedule passes none; empty on the list route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    autoContext: false,
    sortOrder: 620,
  },
  {
    group: "schedule_target",
    name: "schedule_persistent_conversation_id",
    label: "Persistent conversation",
    description:
      "UUID of the conversation every run of this schedule appends to (heartbeat-style schedules). Empty when each run starts a fresh conversation, or on the list route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 630,
  },
  {
    group: "schedule_target",
    name: "schedule_auth_mode",
    label: "Auth mode",
    description:
      "How the run handles authorization: \"ask\" (prompt the user) or \"auto\". Empty on the list route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 640,
  },
  {
    group: "schedule_target",
    name: "schedule_execution_limits",
    label: "Execution limits",
    description:
      "Run guardrails as one object: { max_runtime_seconds, max_concurrent }. Empty on the list route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 650,
  },

  // ── Run history ───────────────────────────────────────────────────────
  {
    group: "schedule_runs",
    name: "schedule_runs",
    label: "Run history",
    description:
      "The loaded runs of the open schedule, newest first (default 20): per run the status (queued | claimed | running | success | failed | cancelled | skipped), surface, queue, due/started/finished timestamps, result summary, error message and output_ref. Empty on the list route or when the schedule has never run.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 700,
  },
  {
    group: "schedule_runs",
    name: "schedule_run_summary",
    label: "Run summary",
    description:
      "Rollup over the loaded runs: { loaded, by_status (counts per RunStatus), last_status, last_finished_at, last_error }. Empty on the list route or before any run history has loaded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 710,
  },
  {
    group: "schedule_runs",
    name: "schedule_runs_load_status",
    label: "Run history load status",
    description:
      "State of the run-history fetch: idle | loading | success | error, plus the error message when it failed. Empty on routes that do not show run history.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 70,
    sortOrder: 720,
  },

  // ── Editor draft ──────────────────────────────────────────────────────
  {
    group: "schedule_editor",
    name: "schedule_draft_mode",
    label: "Editor mode",
    description:
      "Which editor the user is in: \"create\" on /schedules/new, \"edit\" on /schedules/[id]/edit. Empty on the list and detail routes.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 800,
  },
  {
    group: "schedule_editor",
    name: "schedule_draft",
    label: "Editor draft",
    description:
      "The unsaved form state exactly as the user has it: title, description, surfaces, tags, prompt, agent_id, variables, persistent_conversation_id, auth_mode, max_runtime_seconds, max_concurrent, expires_at, trigger_type and trigger_config. Empty outside the create/edit forms.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    autoContext: false,
    sortOrder: 810,
  },
  {
    group: "schedule_editor",
    name: "schedule_draft_errors",
    label: "Editor validation errors",
    description:
      "Field-keyed validation messages currently blocking save, as shown next to the inputs. Empty object when the draft validates; empty outside the create/edit forms.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 820,
  },
  {
    group: "schedule_editor",
    name: "schedule_draft_submitting",
    label: "Editor saving",
    description:
      "True while the create/update request is in flight. Empty outside the create/edit forms.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 830,
  },
];

/**
 * Write half of the 360 loop. This surface has TWO write-capable mounts and
 * they get DIFFERENT postures on purpose — one manifest, one target list,
 * but `listAgentWritableTargets()` only offers a target where that mount
 * registered a handler, so per-mount registration is what splits them.
 *
 * **Draft targets (`schedule_draft_*`) — `ScheduleForm` only**
 * (`/schedules/new`, `/schedules/[id]/edit`). Every one is `mode: "draft"`:
 * it stages into the form's own state through the same `patch`/`setTrigger`
 * setters the user's typing uses — visible in the inputs, reversible,
 * persisted only when the user presses Save (Zod re-validates the whole
 * draft at submit). This is where the consequential fields live (prompt,
 * trigger), because staging is exactly what makes them safe: the user
 * reviews the whole schedule before it is armed.
 *
 * **Entity targets (`schedule_title`, `schedule_description`) —
 * `ScheduleDetail` only** (`/schedules/[id]`). The detail route owns no
 * draft state and has no Save bar, so a draft write there would land
 * nowhere; these two persist immediately through the canonical
 * `updateScheduledTask` thunk. They are deliberately the ONLY entity
 * targets: title and description describe the schedule to humans and cannot
 * change what it runs or when it fires. An agent that wants a schedule to
 * behave differently edits the draft and lets the user save it.
 *
 * All targets are `applyPolicy: "ask"` — a schedule is standing authority to
 * act on the user's behalf, so every agent-originated change is confirmed in
 * place.
 *
 * Deliberately NOT agent-writable on either mount: enable/disable, delete,
 * auth mode, the target agent id, execution surfaces/limits, expiry, and the
 * persistent conversation id — identity, authorization and arming stay
 * human decisions.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "schedule_draft_title",
    label: "Draft title",
    description:
      "Stages a new title into the open schedule editor's draft. Plain string, 1-200 characters. The user still saves.",
    valueType: "string",
    updatesValue: "schedule_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "schedule_editor",
    sortOrder: 100,
  },
  {
    name: "schedule_draft_description",
    label: "Draft description",
    description:
      "Stages a full replacement description into the schedule editor's draft. Plain string, max 2000 characters; replaces the whole field — read schedule_draft.description first if you mean to extend it. The user still saves.",
    valueType: "string",
    updatesValue: "schedule_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "schedule_editor",
    sortOrder: 110,
  },
  {
    name: "schedule_draft_prompt",
    label: "Draft prompt",
    description:
      "Stages the prompt the agent will receive on every fire into the schedule editor's draft. Plain string, 1-10000 characters; replaces the whole field — read schedule_draft.prompt first if you mean to extend it. Write it as a complete standalone instruction: each run starts fresh unless the schedule binds a persistent conversation. The user still saves.",
    valueType: "string",
    updatesValue: "schedule_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "schedule_editor",
    sortOrder: 120,
  },
  {
    name: "schedule_draft_trigger",
    label: "Draft trigger",
    description:
      'Stages the WHEN of the schedule into the editor draft — trigger type and config as ONE object, replacing the current trigger. Accepted shapes, exactly: { "type": "cron", "expression": "<5-field cron: minute hour day-of-month month day-of-week>", "tz": "<IANA timezone>" } (e.g. { "type": "cron", "expression": "0 9 * * 1-5", "tz": "America/Los_Angeles" } = weekdays 9:00 AM; "30 8 * * 1" = Mondays 8:30 AM; "0 */4 * * *" = every 4 hours — no seconds field, no @daily macros); { "type": "interval", "every_seconds": <integer >= 60> } (e.g. 3600 = hourly); { "type": "one-shot", "at": "<ISO 8601 datetime>" }; { "type": "heartbeat", "every_seconds": <integer >= 60> }; { "type": "context-match", "kind"?, "url_pattern"?, "hostname"? } (at least one key). Invalid shapes are rejected. The user still saves.',
    valueType: "object",
    updatesValue: "schedule_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "schedule_editor",
    sortOrder: 130,
  },
  {
    name: "schedule_draft_variables",
    label: "Draft variables",
    description:
      "Stages the variable payload merged into every run, as one flat key/value object — replaces the FULL set; include existing entries you want kept, from schedule_draft.variables. Keys are strings; values any JSON. The user still saves.",
    valueType: "object",
    updatesValue: "schedule_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "schedule_editor",
    sortOrder: 140,
  },
  {
    name: "schedule_draft_tags",
    label: "Draft tags",
    description:
      "Stages the schedule's tag set into the draft — replaces the FULL set (include existing tags you want kept, from schedule_draft.tags). Array of up to 50 plain strings, each 1-100 characters. The user still saves.",
    valueType: "array",
    updatesValue: "schedule_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "schedule_editor",
    sortOrder: 150,
  },

  // ── Entity targets — the DETAIL route (`ScheduleDetail`) only ──────────
  // No draft state exists here, so these persist immediately. Scoped hard to
  // the two fields that cannot change execution behaviour.
  {
    name: "schedule_title",
    label: "Schedule title",
    description:
      "Renames the open schedule and saves it immediately through the canonical update path. Plain string, 1-200 characters. Changes only how the schedule is labelled — not what it runs, and not when it fires.",
    valueType: "string",
    updatesValue: "schedule_title",
    mode: "entity",
    applyPolicy: "ask",
    group: "open_schedule",
    sortOrder: 200,
  },
  {
    name: "schedule_description",
    label: "Schedule description",
    description:
      "Rewrites the open schedule's description and saves it immediately through the canonical update path. Plain string up to 2000 characters; pass an empty string to clear. Replaces the whole field — read schedule_description first if you mean to extend it. Changes only the human explanation, not what the schedule runs or when it fires.",
    valueType: "string",
    updatesValue: "schedule_description",
    mode: "entity",
    applyPolicy: "ask",
    group: "open_schedule",
    sortOrder: 210,
  },
];

export const schedulesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/schedules",
  readiness: "partial",
  readinessNote:
    "Manifest + emitters (ScheduleList, ScheduleDetail, ScheduleForm) are wired and every value the routes load is declared. Not yet verified: DB sync (ui_surface row + manifest sync), route-prefix mapping in utils/route-to-surface.ts, data-surface-value anchors for Locate, and a live non-matching-name binding test.",
  label: "Schedules",
  urlPattern: "/schedules",
  intro: `<surface_intro>
You are in the user's scheduling control plane: the schedules that make an agent run on a clock (interval, cron, one-shot, heartbeat) or when a browsing context matches. The user comes here to see what is armed, inspect what a schedule actually runs, read its run history, and create or edit one.
Four routes share this surface, so read what is present rather than assuming. On /schedules only the roster is populated (schedules_summary, schedule_counts, schedules_load_status). On /schedules/[id] the open-schedule and target-action values identify one schedule and schedule_runs / schedule_run_summary carry its history. On /schedules/[id]/edit and /schedules/new the editor-draft values carry the user's unsaved form state — schedule_draft is the live truth there, not the saved record. Absent values are normal, not an error.
Timing is authoritative from the server: next_due_at and last_fired_at are recomputed by the scheduler on every trigger write, never by this client. Report them as given and never invent a fire time, a run status, or a run result.
A schedule's target action (agent, prompt, variables, auth mode, execution limits) is what will actually execute — treat it as the specification the user is reasoning about when they ask "what does this do" or "why did it fail".
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
 * No value is `alwaysAvailable`, because one surface spans a list route, a
 * detail route and two editor routes: nothing but the baselines can be
 * promised on every launch.
 */
export function createSchedulesScope(values: {
  schedules_summary?: Array<Record<string, unknown>>;
  schedule_counts?: Record<string, unknown>;
  schedules_load_status?: Record<string, unknown>;
  schedule_id?: string;
  schedule_title?: string;
  schedule_description?: string;
  schedule_enabled?: boolean;
  schedule_trigger?: Record<string, unknown>;
  schedule_trigger_summary?: string;
  schedule_next_due_at?: string;
  schedule_last_run_at?: string;
  schedule_surfaces?: string[];
  schedule_tags?: string[];
  schedule_queue?: string;
  schedule_expires_at?: string;
  open_schedule?: Record<string, unknown>;
  schedule_agent_id?: string;
  schedule_prompt?: string;
  schedule_variables?: Record<string, unknown>;
  schedule_persistent_conversation_id?: string;
  schedule_auth_mode?: string;
  schedule_execution_limits?: Record<string, unknown>;
  schedule_runs?: Array<Record<string, unknown>>;
  schedule_run_summary?: Record<string, unknown>;
  schedule_runs_load_status?: Record<string, unknown>;
  schedule_draft_mode?: string;
  schedule_draft?: Record<string, unknown>;
  schedule_draft_errors?: Record<string, unknown>;
  schedule_draft_submitting?: boolean;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
