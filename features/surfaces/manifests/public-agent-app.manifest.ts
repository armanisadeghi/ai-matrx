/**
 * Surface manifest — Public Agent App Runner (`matrx-public/p`).
 *
 * The ANONYMOUS-facing runner at `/p/[slug]` (and its `?embed=widget` iframe
 * mode). A visitor — usually not signed in — opens a published `app.definition`
 * row by slug/id, fills in whatever form variables the app declares, types an
 * optional message, and the page launches the app's bound agent directly
 * (`CustomComponentRenderer` in `AgentAppPublicRendererImpl.tsx`).
 *
 * This is a genuinely anonymous surface: `useApiAuth` resolves either a real
 * session OR a browser fingerprint (`X-Fingerprint-ID`), and `useGuestLimit`
 * caps unauthenticated runs. Nothing here may assume a signed-in user.
 *
 * Distinct from `matrx-user/agent-apps` (`agent-apps.manifest.ts`), which is
 * the AUTHED builder/catalog surface where an app is authored and configured.
 * This manifest covers the opposite end: the public consumer surface where the
 * finished app actually runs for a stranger.
 *
 * Readiness: partial — the manifest + emitter are wired and the runtime
 * value set matches what `AgentAppPublicRendererImpl.tsx` actually holds
 * (audited against the live component), but no live agent-binding test has
 * been run yet against an anonymous session. See `readinessNote`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const PUBLIC_AGENT_APP_SURFACE_NAME = "matrx-public/p";

const groups: SurfaceValueGroup[] = [
  {
    key: "app_identity",
    label: "App identity",
    sortOrder: 100,
    description:
      "Which published app.definition row is running and the agent it is bound to.",
  },
  {
    key: "visitor",
    label: "Visitor",
    sortOrder: 200,
    description:
      "Who is running the app: a signed-in user or an anonymous guest identified by browser fingerprint, plus the guest run-limit state.",
  },
  {
    key: "run_input",
    label: "Run input",
    sortOrder: 300,
    description:
      "What the visitor supplied for this run: the free-text message and the form variable values validated against the app's variable_schema.",
  },
  {
    key: "run_state",
    label: "Run state",
    sortOrder: 400,
    description:
      "The resulting conversation and the live/streamed outcome of the current or most recent execution.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── App identity ─────────────────────────────────────────────────────
  {
    name: "app_id",
    label: "App ID",
    description:
      "UUID of the published `app.definition` row being run (`app.id`). Always available — the page 404s before rendering if the slug/id does not resolve to a published, public app.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    group: "app_identity",
    sortOrder: 100,
  },
  {
    name: "app_slug",
    label: "App slug",
    description:
      "The app's public URL slug (`app.slug`), as used in `/p/[slug]`. Always available.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    group: "app_identity",
    sortOrder: 110,
  },
  {
    name: "app_name",
    label: "App name",
    description: "Display name of the app (`app.name`). Always available.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    group: "app_identity",
    sortOrder: 120,
  },
  {
    name: "agent_id",
    label: "Bound agent ID",
    description:
      "UUID of the `agent.definition` the app is bound to (`app.agent_id`) — the agent `launchAgentExecution` runs on submit. Always available.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    autoContext: false,
    group: "app_identity",
    sortOrder: 130,
  },
  {
    name: "agent_version_id",
    label: "Pinned agent version ID",
    description:
      "UUID of the pinned `agx_version` row when the app is NOT configured to use_latest (`app.agent_version_id`). Empty when the app tracks the agent's latest published version.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    group: "app_identity",
    sortOrder: 140,
  },
  {
    name: "shell_kind",
    label: "Shell kind",
    description:
      "Which top-level UI shell renders the app (`app.shell_kind`) — e.g. \"chat\", \"form_to_result\", \"widget\", \"fully_custom\". Always available. `?embed=widget` forces \"widget\" regardless of the row's configured kind.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 16,
    autoContext: false,
    group: "app_identity",
    sortOrder: 150,
  },

  // ── Visitor ──────────────────────────────────────────────────────────
  {
    name: "is_authenticated",
    label: "Visitor is signed in",
    description:
      "True when the visitor has a real Supabase session; false for an anonymous guest identified only by fingerprint. Always available.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "visitor",
    sortOrder: 200,
  },
  {
    name: "guest_fingerprint_id",
    label: "Guest fingerprint ID",
    description:
      "Browser fingerprint identifying an anonymous visitor across runs (`X-Fingerprint-ID`), used in place of a user id for guest rate limiting. Empty once the visitor is authenticated or before the fingerprint has resolved.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    autoContext: false,
    group: "visitor",
    sortOrder: 210,
  },
  {
    name: "guest_runs_remaining",
    label: "Guest runs remaining",
    description:
      "Free executions left for this anonymous guest before signup is required (from `useGuestLimit`). Meaningless once `is_authenticated` is true.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    autoContext: false,
    group: "visitor",
    sortOrder: 220,
  },

  // ── Run input ────────────────────────────────────────────────────────
  {
    name: "user_input",
    label: "User message",
    description:
      "Free-text message the visitor typed for this run, passed as `runtime.userInput` to the agent. Empty for apps whose custom UI collects only form variables and no chat-style message.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "run_input",
    sortOrder: 300,
  },
  {
    name: "form_variable_values",
    label: "Form variable values",
    description:
      "The visitor's submitted form values, validated and coerced against `app.variable_schema` (string/number/boolean per field, required fields defaulted or flagged). Object keyed by variable name. Empty object for apps with no declared variables.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "run_input",
    sortOrder: 310,
  },

  // ── Run state ────────────────────────────────────────────────────────
  {
    name: "conversation_id",
    label: "Conversation ID",
    description:
      "UUID of the `cx_conversation` row created for this run, captured synchronously via `onConversationCreated` right after the launcher creates it. Empty until the visitor's first submit of this page view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "run_state",
    sortOrder: 400,
  },
  {
    name: "run_status",
    label: "Run status",
    description:
      "Status of the active/most-recent execution's request: \"streaming\", \"complete\", \"error\", or empty before any run has started this page view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    autoContext: false,
    group: "run_state",
    sortOrder: 410,
  },
  {
    name: "response_text",
    label: "Response text",
    description:
      "Accumulated streamed text of the current/most recent run, read live from Redux (`selectAccumulatedText`). Empty before the first run completes any output.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    group: "run_state",
    sortOrder: 420,
  },
];

export const publicAgentAppManifest: SurfaceManifest = {
  surfaceName: PUBLIC_AGENT_APP_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Manifest + emitter wired (runtime.surfaceName now passed to launchAgentExecution and a SurfaceRuntimeProvider mounted). Anonymous surface — no live agent-binding / Matrx-vs-matrix verification run yet; also covers only the CustomComponentRenderer path (component_code / template apps). The built-in shells in features/agent-apps/components/shells/ and AgentAppFullyCustomShell run their own execution paths and are NOT yet audited or wired to this surface.",
  label: "Public Agent App",
  urlPattern: "/p",
  intro: `<surface_intro>
You are bound to a PUBLISHED, PUBLIC agent app running for an anonymous or newly-arrived visitor at /p/[slug] — not the app's builder/owner. App identity tells you which app.definition row and which agent are running. Visitor tells you whether this person is signed in or an anonymous guest tracked only by browser fingerprint, and how many free guest runs remain — anonymous guests are the common case here, never assume a logged-in user. Run input is what THIS visitor just submitted (a typed message and/or form variable values validated against the app's schema); read it as their actual request, not a template. Run state is the resulting conversation and the live/streamed response for their run.
Treat this like any first-contact interaction with a stranger: no prior context about this person exists beyond what is declared here.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
};

/** One entry of `form_variable_values`. */
export type PublicAgentAppFormVariableValues = Record<string, unknown>;

/**
 * Type-safe payload helper. `CustomComponentRenderer` calls this at launch
 * time so TypeScript catches missing required keys and unknown keys at the
 * callsite.
 *
 * Required keys (no `?`) mirror every value declared `alwaysAvailable: true`
 * above; optional keys (`?`) mirror `alwaysAvailable: false`.
 */
export function createPublicAgentAppScope(values: {
  // alwaysAvailable: true → required
  app_id: string;
  app_slug: string;
  app_name: string;
  agent_id: string;
  shell_kind: string;
  is_authenticated: boolean;
  // alwaysAvailable: false → optional
  agent_version_id?: string;
  guest_fingerprint_id?: string;
  guest_runs_remaining?: number;
  user_input?: string;
  form_variable_values?: PublicAgentAppFormVariableValues;
  conversation_id?: string;
  run_status?: "streaming" | "complete" | "error";
  response_text?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
