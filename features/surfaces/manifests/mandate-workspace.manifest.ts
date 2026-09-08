/**
 * Surface manifest — ONE mandate's admin workspace (`matrx-admin/mandate-workspace`).
 *
 * ADMIN SURFACE. Drives `/administration/mandates/[mandateKey]` — the page
 * that shows ONE job in the mandate's own order, INPUT → GOAL → OUTPUT, plus
 * the system rung's holder and the admin's platform tools. Backed by
 * `features/mandates/admin/AdminMandateWorkspacePage.tsx` (mounts the
 * provider) with the goal fields published upward from
 * `features/mandates/workspace/TriadSections.tsx` through
 * `useSurfaceScopeContribution`. Cross-repo system-of-record:
 * common-docs/systems/mandates/STATE.md + CLIENT-SURFACES.md.
 *
 * Why this is its own surface and not `matrx-admin/mandates`: the console is
 * a LIST over every mandate (its scope is measured health across the fleet);
 * this page is ONE job's definition, and the only thing here that a person
 * authors is the goal. A goal is the exact artifact an agent drafts better
 * than a person hand-typing — which is why the platform runs a job for it
 * (`mandate.goal_writer`, declared below as this surface's fixed worker).
 *
 * ── THE JUDGMENT BAR ON THIS SURFACE ────────────────────────────────────────
 * ONE target earns a place: the goal DRAFT. Everything else on the page
 * deliberately has none — the mandate key (identity), the output kind and
 * required output keys (the contract every bound holder must satisfy;
 * changing it silently re-judges every holder), the holder assignment
 * (identity by UUID over live production capacity — the same verdict the
 * console manifest recorded), enable/disable, promote and remove. The draft
 * inputs are authored too, but they are edited as a STRUCTURE (name, kind,
 * sourcing) through their own converter job, not as a value an agent pastes.
 *
 * The goal target is `mode: "draft"`: applying it opens the goal editor with
 * the value staged, and the admin still presses "Save goal" — the only
 * write that marks a goal human-ratified. `applyPolicy: "ask"` because a
 * staged draft REPLACES whatever the admin had typed into that editor.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const MANDATE_WORKSPACE_SURFACE_NAME = "matrx-admin/mandate-workspace";

/**
 * THE GOAL WRITER — the job this page runs for its one authored field. The
 * key is the entire wiring (`features/mandates/authoring/constants.ts` holds
 * the same string for the button); this declaration is what puts the job in
 * the header Agents menu without adding a pixel to the page.
 */
export const MANDATE_WORKSPACE_GOAL_WRITER_MANDATE_KEY = "mandate.goal_writer";

const groups: SurfaceValueGroup[] = [
  {
    key: "mandate",
    label: "This mandate",
    sortOrder: 100,
    description:
      "The one job open on this page — its identity, its declared output contract, and its goal as stored.",
  },
  {
    key: "goal_editor",
    label: "Goal editor",
    sortOrder: 200,
    description:
      "The goal editor's live state — what is staged but not yet saved. The write target of the same name lands here.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "mandate_key",
    label: "Mandate key",
    description:
      "The job's stable key (e.g. `research_client.output_slides`) — how every caller names it. Never changes on this page.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    sortOrder: 100,
    group: "mandate",
  },
  {
    name: "mandate_label",
    label: "Mandate label",
    description:
      "The job's human name. Absent while the mandate is still loading or when the address on this page names no live job.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 110,
    group: "mandate",
  },
  {
    name: "mandate_description",
    label: "Mandate description",
    description:
      "The job's one-line description as stored. Absent when none is written.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 120,
    group: "mandate",
  },
  {
    name: "mandate_goal",
    label: "Goal",
    description:
      "The job's goal AS SAVED — what done-well means for every holder that ever runs it. Empty string when no goal is written yet. This is the read twin of the `mandate_goal_draft` write target: read it before proposing a replacement so you refine rather than restart.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 130,
    group: "mandate",
  },
  {
    name: "mandate_goal_grounding",
    label: "Goal grounding",
    description:
      'How the saved goal was established: "H" (human-ratified — an admin saved it here), "V" (verified), or "A" (agent-written / code-seeded). Saving through this page always makes it "H".',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1,
    sortOrder: 140,
    group: "mandate",
  },
  {
    name: "mandate_output_kind",
    label: "Output kind",
    description:
      "The registered `__kind` the job's output must be (e.g. `presentation_deck`), or empty when the job answers in prose. A goal must describe THIS deliverable — read it before drafting.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 150,
    group: "mandate",
  },
  {
    name: "mandate_goal_draft",
    label: "Goal draft",
    description:
      "The goal editor's live state and the read twin of the write target of the same name: { editing, text }. `editing` is whether the editor is open; `text` is what is staged in it right now (equal to `mandate_goal` when nothing is staged). Absent on hosts where the goal is read-only.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 200,
    group: "goal_editor",
  },
];

/**
 * Names of the write targets, exported so the page handler and any kind
 * component that offers "use as goal" can never drift from the manifest by
 * re-typing a string.
 */
export const MANDATE_WORKSPACE_WRITE_TARGETS = {
  goalDraft: "mandate_goal_draft",
} as const;

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: MANDATE_WORKSPACE_WRITE_TARGETS.goalDraft,
    label: "Goal draft",
    description:
      "Stages a goal into this page's goal editor and opens it — NOTHING is saved; the admin reads it and presses \"Save goal\", which is the only write that changes the job. " +
      "Value: a STRING — the goal text itself, plain prose, the tight operational paragraph that states exactly what done-well means for this job (a goal writer's `charge` is the right shape; never the whole structured specification). " +
      "It REPLACES whatever is in the editor, which is why this asks. Read `mandate_goal` first and refine rather than restart. Refused when the value is empty or not a string.",
    valueType: "string",
    updatesValue: "mandate_goal_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "goal_editor",
    sortOrder: 210,
  },
];

export const mandateWorkspaceManifest: SurfaceManifest = {
  surfaceName: MANDATE_WORKSPACE_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Provider mounted on the admin route; identity + goal + goal-draft values live; the one write target (goal draft) is wired and user-verified. Inputs/holder/health are not yet emitted as values.",
  label: "Mandate Workspace",
  urlPattern: "/administration/mandates/:mandateKey",
  intro: `<surface_intro>
This is an ADMIN surface: ONE mandate's workspace at /administration/mandates/<key>.

A mandate is a named platform JOB (mandate.definition) — the thing a caller asks for by key — done by whichever Holder the platform assigns. This page shows that one job in its own order: INPUT (what it is told), GOAL (what done-well means), OUTPUT (the __kind it must produce), then who holds it and the admin's tools.

The GOAL is the only thing here a person authors, and it is a SYSTEM definition: one edit changes the job for every user on the platform, which is why it is edited only on this admin page and why saving it marks it human-ratified.

You may read everything. You may WRITE exactly one thing, through apply_surface_write: \`mandate_goal_draft\` — a string that becomes the staged text in the goal editor. It stages only; the admin still presses "Save goal". Read \`mandate_goal\` and \`mandate_output_kind\` first: a goal must describe THIS job's deliverable, and a refinement keeps what already works. Send the compressed operational paragraph (a charge), never a structured specification.
</surface_intro>`,
  groups,
  writeTargets,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "goal_writer",
      label: "Goal Writer",
      description:
        "Reviews the job's inputs, output contract and current goal, and drafts the exact, concise goal — with the structured specification behind it and clarifying questions — in a conversation the admin can continue before applying the charge as the goal.",
      kind: "single",
      defaultAgentId: null,
      mandateKey: MANDATE_WORKSPACE_GOAL_WRITER_MANDATE_KEY,
      allowCustom: false,
      autoRun: "never",
      sortOrder: 100,
    },
  ],
};

/** The goal editor's live state as the surface exposes it. */
export interface MandateGoalDraftState {
  editing: boolean;
  text: string;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable:
 * false`.
 */
export function createMandateWorkspaceScope(values: {
  // alwaysAvailable: true → required
  mandate_key: string;
  // alwaysAvailable: false → optional
  mandate_label?: string;
  mandate_description?: string;
  mandate_goal?: string;
  mandate_goal_grounding?: string;
  mandate_output_kind?: string;
  mandate_goal_draft?: MandateGoalDraftState;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
