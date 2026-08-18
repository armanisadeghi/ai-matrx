/**
 * Surface manifest — AI Work Composer (`matrx-user/ai-work-composer`).
 *
 * `/work/new`: the eight-step composer (destination, request, expert system,
 * skills, context, home, timing, review) that launches real AI Matrx runs, or
 * hands the work to the user's own Claude Code on their Mac.
 *
 * Declared 2026-08-17 to close the worst tier of surface gap: this page
 * LAUNCHES AGENTS (`useAgentLauncher` → `launchAgentExecution` in
 * `compose/components/AiWorkComposer.tsx`) while passing only an ad-hoc
 * `surfaceKey: "ai-work-composer:<agentId>"` and no registered
 * `runtime.surfaceName` — so nothing the user assembled here was bindable, and
 * no agent could be bound to the page at all.
 *
 * No `agentRoles` are declared: the composer's whole point is that the USER
 * picks the expert system, and there is no named agent job here to seed. A
 * role would need a Mandate behind it, not a raw agent id.
 *
 * Curated groups (band 0-899):
 *   the_request   What the user is asking for
 *   destination   Where it will run
 *   assembly      Expert system, skills, and attached context
 *   disposition   Where the finished work lands
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
    key: "the_request",
    label: "The request",
    sortOrder: 100,
    description: "What the user has written that they want done.",
  },
  {
    key: "destination",
    label: "Destination",
    sortOrder: 200,
    description: "Where the run will execute, and whether that is available.",
  },
  {
    key: "assembly",
    label: "Expert system & context",
    sortOrder: 300,
    description:
      "The agent, skills, and attached resources assembled for this run.",
  },
  {
    key: "disposition",
    label: "Disposition",
    sortOrder: 400,
    description:
      "Where the finished work is filed, and whether it was saved as a reusable request.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── The request ───────────────────────────────────────────────────────
  {
    name: "request_text",
    label: "Request text",
    description:
      "The prose the user wrote describing what they want done — the text sent as the run's user input. Empty until they type something; the Run button is disabled while it is empty.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 100,
    group: "the_request",
  },
  {
    name: "saved_request_label",
    label: "Request name",
    description:
      "The name under which the user is saving (or has saved) this request for reuse. Empty when they have not named it — saving without a name is refused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 50,
    sortOrder: 110,
    group: "the_request",
  },
  {
    name: "saved_request_id",
    label: "Saved request ID",
    description:
      "UUID of the Saved Request this composer was reopened from (`?request=<id>`) or last saved as. Empty on a fresh composer that has never been saved.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 120,
    group: "the_request",
  },

  // ── Destination ───────────────────────────────────────────────────────
  {
    name: "destination_id",
    label: "Destination",
    description:
      'Where the run will execute: "ai-matrx" (the platform) or "claude-code" (the user\'s own Claude Code on their Mac, via Matrx Local). Always populated — defaults to "ai-matrx".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 200,
    group: "destination",
  },
  {
    name: "destination_available",
    label: "Destination available",
    description:
      "True when the selected destination passed its live capability check and can actually accept the run. Always populated — false while a check is pending or the destination is unreachable (a timeout counts as unavailable).",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 210,
    group: "destination",
  },
  {
    name: "local_folder",
    label: "Local folder",
    description:
      "Absolute path of the approved folder Claude Code would run in on the user's Mac. Empty unless the destination is `claude-code` and at least one approved folder exists.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 220,
    group: "destination",
  },

  // ── Assembly ──────────────────────────────────────────────────────────
  {
    name: "agent_id",
    label: "Expert system ID",
    description:
      "UUID of the agent selected to run this request — SSR-resolved from the default-new-work mandate, or whatever the user picked instead. Always populated; the composer refuses to render its form without one.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "assembly",
  },
  {
    name: "agent_name",
    label: "Expert system name",
    description:
      "Display name of the selected agent. Empty when the name has not resolved yet, even though `agent_id` is set.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 310,
    group: "assembly",
  },
  {
    name: "conversation_id",
    label: "Conversation ID",
    description:
      "The client-minted conversation id this composer + agent pair binds to; the row itself is created server-side on the first turn. Empty before the launcher has minted one.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 320,
    group: "assembly",
  },
  {
    name: "skill_ids",
    label: "Attached skill IDs",
    description:
      "UUIDs of the skills the user added to this run. Always populated — empty array when none are attached.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 120,
    autoContext: false,
    sortOrder: 330,
    group: "assembly",
  },

  // ── Disposition ───────────────────────────────────────────────────────
  {
    name: "home_targets",
    label: "Home targets",
    description:
      "Where the finished conversation will be filed, one entry per pick as { token, id } (task, project, war_room, …). Always populated — empty array when the user chose no home. Applied as canonical association edges once the conversation row exists.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 400,
    group: "disposition",
  },
  {
    name: "launched_conversation_id",
    label: "Launched conversation ID",
    description:
      "Conversation id of the run this composer actually started. Empty until a run has been launched from this form — the honest signal that work left the composer.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 410,
    group: "disposition",
  },
];

export const aiWorkComposerManifest: SurfaceManifest = {
  surfaceName: "matrx-user/ai-work-composer",
  readiness: "stub",
  readinessNote:
    "Vocabulary declared 2026-08-17 to close an agent-LAUNCHING page that had no surface declaration at all. Not yet audited step-by-step against the eight composer steps, and the emitter is not wired — AiWorkComposer still launches with an ad-hoc surfaceKey instead of runtime.surfaceName.",
  label: "AI Work Composer",
  urlPattern: "/work/new",
  intro: `<surface_intro>
You are on the AI Work composer: an eight-step form where the user assembles ONE run before it starts — what they want done, where it should run, which expert system and skills to use, what context to attach, and where the finished work should land.
Nothing here has executed yet unless launched_conversation_id is present. Read request_text as the user's actual ask; destination_id plus destination_available tell you whether that ask can even run right now; the assembly group is what will be handed to the run; the disposition group is where its output will be filed.
The user may also save this as a reusable request rather than run it — saved_request_id and saved_request_label describe that, not a run.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** One entry as emitted in `home_targets`. */
export interface AiWorkHomeTargetEntry {
  token: string;
  id: string;
}

/** Type-safe payload helper — required keys mirror `alwaysAvailable: true`. */
export function createAiWorkComposerScope(values: {
  destination_id: string;
  destination_available: boolean;
  agent_id: string;
  skill_ids: string[];
  home_targets: AiWorkHomeTargetEntry[];
  selection?: string;
  context?: Record<string, unknown>;
  request_text?: string;
  saved_request_label?: string;
  saved_request_id?: string;
  local_folder?: string;
  agent_name?: string;
  conversation_id?: string;
  launched_conversation_id?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
