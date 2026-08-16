/**
 * CHANGE_TYPE_CATALOGUE — the single source of truth for every kind of change
 * the platform's self-improvement machinery (Hindsight, Internal Affairs) can
 * propose, and how each is handled by default.
 *
 * Contract C-18 of the Dynamic Agent Graph program. The row list is CODE —
 * reviewed and versioned here; an organization's choices are DATA
 * (`platform.org_change_policy`, written only by `set_org_change_policy`).
 *
 * Source of the 41 numbered rows: dynamic-agent-graph-design-v2.md Part 0.10,
 * transcribed faithfully. Rows sort by increasing difficulty of reversal —
 * that ladder (not what the change touches) drives the defaults. Two
 * distinctions matter most: modifying an existing unit vs. creating a new
 * one, and changing a unit vs. changing the composition.
 *
 * Row 42 (`outreach.attribution_credit`) is the first CONSUMER-REGISTERED row
 * — the doc says "the row list grows over time". It was already declared by
 * aidream's `services/outcome_attribution/disposition.py` (D-W4-8/9) with the
 * default Arman ruled in D-W4-7 (`auto_with_audit`).
 *
 * THE SEED IS GENERATED FROM THIS FILE. `platform.change_type_default` mirrors
 * these rows so SQL (`platform.resolve_change_handling`) can resolve without
 * app code. After editing this file run:
 *
 *     pnpm tsx features/change-policy/generate-seed.ts          # prints seed SQL
 *     pnpm tsx features/change-policy/generate-seed.ts --check  # diff vs live DB
 *
 * and apply the seed via the Supabase MCP in the same session.
 *
 * THE ROW-38 FLOOR IS STRUCTURAL (research finding #4): `change_own_handling_mode`
 * is hard-coded in the BODY of `platform.resolve_change_handling` — the floor
 * holds even if this catalogue, the seed table, or an org row says otherwise.
 * The `floorHumanOnly` flag here exists so UIs can render the floor honestly;
 * it is not what enforces it.
 *
 * Timeout defaults follow D-13: "review with timeout" expires-to-PROCEED only
 * in Tier 1; every tier above expires-to-HOLD, org-overridable.
 */

/** The five handling modes, exactly the vocabulary of doc Part 0.10 + IV-A. */
export const CHANGE_HANDLING_MODES = [
    "off",
    "automatic",
    "review",
    "review_with_timeout",
    "auto_with_audit",
] as const;

export type ChangeHandlingMode = (typeof CHANGE_HANDLING_MODES)[number];

export const CHANGE_HANDLING_MODE_LABELS: Record<ChangeHandlingMode, string> = {
    off: "Off",
    automatic: "Automatic",
    review: "Review",
    review_with_timeout: "Review + timeout",
    auto_with_audit: "Auto + audit",
};

/** Compact labels for tight controls (segmented at mobile widths). */
export const CHANGE_HANDLING_MODE_SHORT_LABELS: Record<ChangeHandlingMode, string> = {
    off: "Off",
    automatic: "Auto",
    review: "Review",
    review_with_timeout: "Timeout",
    auto_with_audit: "Audit",
};

export const CHANGE_HANDLING_MODE_DESCRIPTIONS: Record<ChangeHandlingMode, string> = {
    off: "The system does not propose this kind of change at all.",
    automatic: "The change is made once the evidence threshold is met. No human involved.",
    review: "The system proposes; a person approves or rejects; nothing happens until they do.",
    review_with_timeout: "The system proposes; if nobody responds within the window, the timeout rule decides.",
    auto_with_audit: "The change ships immediately and lands in the audit queue with one-click revert.",
};

/** What happens when a review_with_timeout window lapses. */
export type TimeoutExpiry = "proceed" | "hold";

export type ChangeTypeTier = 1 | 2 | 3 | 4 | 5 | 6;

export interface ChangeTypeTierMeta {
    tier: ChangeTypeTier;
    title: string;
    /** The tier's reversibility story — shown once per tier group, per Part 0.10. */
    reversibilityNote: string;
    /** D-13: what a lapsed review window does by default in this tier. */
    defaultTimeoutExpiry: TimeoutExpiry;
}

export const CHANGE_TYPE_TIERS: readonly ChangeTypeTierMeta[] = [
    {
        tier: 1,
        title: "Local and trivially reversible",
        reversibilityNote:
            "Replay proves these mechanically. A swap back is one setting; nothing else in the system moves.",
        defaultTimeoutExpiry: "proceed",
    },
    {
        tier: 2,
        title: "Unit-level edits",
        reversibilityNote:
            "Reversible, but not trivially — the previous version exists and can be re-promoted, yet the change may already have shaped downstream runs.",
        defaultTimeoutExpiry: "hold",
    },
    {
        tier: 3,
        title: "Substitution",
        reversibilityNote:
            "Swapping units we already have. The old unit still exists, so reverting is re-pointing — but behaviour differences can be broad.",
        defaultTimeoutExpiry: "hold",
    },
    {
        tier: 4,
        title: "Creation",
        reversibilityNote:
            "The system authored something that did not exist, and by default put it where other runs can pick it up. A different trust question than any edit.",
        defaultTimeoutExpiry: "hold",
    },
    {
        tier: 5,
        title: "Topology",
        reversibilityNote:
            "Changing the shape of the composition itself. These stay human-approved far longer — reverting means restructuring, not re-pointing.",
        defaultTimeoutExpiry: "hold",
    },
    {
        tier: 6,
        title: "Oversight itself",
        reversibilityNote:
            "The settings that govern the settings. Row 38 is deliberately floored at human-only: the system may never widen its own permissions.",
        defaultTimeoutExpiry: "hold",
    },
] as const;

export interface ChangeTypeDef {
    /** Stable key — the platform contract. Never rename a shipped key. */
    key: string;
    /** Part 0.10 row number (1–41); consumer-registered rows continue the sequence. */
    rowNum: number;
    tier: ChangeTypeTier;
    label: string;
    description: string;
    defaultMode: ChangeHandlingMode;
    /**
     * Human-only floor. Rendered as a disabled control; enforced STRUCTURALLY
     * in `platform.resolve_change_handling` + rejected by the write RPC.
     */
    floorHumanOnly?: boolean;
    /** Row-level nuance beyond the tier note, where the doc gives one. */
    note?: string;
    /**
     * What kind of thing this row governs, for door-rendering (no-dead-ends):
     * a row naming agents links to agents, workflows to workflows, etc.
     */
    subject?: "agent" | "workflow" | "orchestra" | "tool" | "model" | "policy";
}

/** Platform default window for a pending review_with_timeout, in minutes (48h). */
export const DEFAULT_TIMEOUT_MINUTES = 2880;

export const CHANGE_TYPE_CATALOGUE: readonly ChangeTypeDef[] = [
    // ── Tier 1 — Local and trivially reversible ────────────────────────────
    {
        key: "swap_to_cheaper_model",
        rowNum: 1,
        tier: 1,
        label: "Swap to a cheaper model that replays equivalently",
        description: "Replace the model behind a step with a cheaper one that replay has proven equivalent on real history.",
        defaultMode: "automatic",
        subject: "model",
    },
    {
        key: "swap_to_stronger_model",
        rowNum: 2,
        tier: 1,
        label: "Swap to a stronger model where quality is failing",
        description: "Replace the model behind a failing step with a stronger (usually costlier) one.",
        defaultMode: "review_with_timeout",
        subject: "model",
    },
    {
        key: "adjust_model_settings",
        rowNum: 3,
        tier: 1,
        label: "Adjust model settings",
        description: "Temperature, max tokens, reasoning effort, and other per-call parameters.",
        defaultMode: "automatic",
        subject: "model",
    },
    {
        key: "tighten_loop_stop_condition",
        rowNum: 4,
        tier: 1,
        label: "Tighten a loop's stopping condition",
        description: "Stop a loop earlier once continued iterations are measured to add nothing.",
        defaultMode: "automatic",
    },
    {
        key: "adjust_retry_policy",
        rowNum: 5,
        tier: 1,
        label: "Adjust a retry policy or backoff",
        description: "Change how many times a step retries and how long it waits between attempts.",
        defaultMode: "automatic",
    },
    {
        key: "reorder_independent_steps",
        rowNum: 6,
        tier: 1,
        label: "Reorder independent steps for latency",
        description: "Run steps with no data dependency in a faster order or in parallel.",
        defaultMode: "automatic",
        subject: "workflow",
    },
    {
        key: "convert_full_to_preview_return",
        rowNum: 7,
        tier: 1,
        label: "Convert a full response return to a preview return",
        description: "Return a bounded preview plus a reference instead of a full payload where the full payload is waste.",
        defaultMode: "automatic",
    },
    {
        key: "adjust_context_eviction",
        rowNum: 8,
        tier: 1,
        label: "Add or adjust context eviction on an Orchestrator",
        description: "Change what an Orchestrator forgets as its context window fills.",
        defaultMode: "review_with_timeout",
        subject: "orchestra",
    },

    // ── Tier 2 — Unit-level edits ──────────────────────────────────────────
    {
        key: "edit_agent_instructions",
        rowNum: 9,
        tier: 2,
        label: "Edit an Agent's system prompt / instructions",
        description: "Rewrite part of an Agent's standing instructions based on reviewed evidence.",
        defaultMode: "review_with_timeout",
        subject: "agent",
    },
    {
        key: "edit_roster_description",
        rowNum: 10,
        tier: 2,
        label: "Edit an Orchestrator's roster description of an Agent",
        description: "Change how an Agent is described to the Orchestrator that decides when to call it.",
        defaultMode: "review_with_timeout",
        subject: "orchestra",
    },
    {
        key: "change_gate_threshold",
        rowNum: 11,
        tier: 2,
        label: "Change a step's pass/fail definition or gate threshold",
        description: "Move the line that decides whether a step's output counts as good enough.",
        defaultMode: "review",
    },
    {
        key: "edit_rubric",
        rowNum: 12,
        tier: 2,
        label: "Edit a rubric",
        description: "Change the criteria a judge scores against.",
        defaultMode: "review",
    },
    {
        key: "change_agent_tools",
        rowNum: 13,
        tier: 2,
        label: "Add or remove a Tool from an Agent",
        description: "Change what an Agent is able to do by changing its toolset.",
        defaultMode: "review",
        subject: "agent",
    },
    {
        key: "change_output_schema",
        rowNum: 14,
        tier: 2,
        label: "Change an output schema / Content IR shape",
        description: "Change the structured shape a unit promises to produce — every consumer of that shape is affected.",
        defaultMode: "review",
    },
    {
        key: "adjust_completion_criteria",
        rowNum: 15,
        tier: 2,
        label: "Adjust an Orchestrator's completion criteria",
        description: "Change what an Orchestrator treats as 'done'.",
        defaultMode: "review",
        subject: "orchestra",
    },

    // ── Tier 3 — Substitution ──────────────────────────────────────────────
    {
        key: "replace_agent_with_agent",
        rowNum: 16,
        tier: 3,
        label: "Replace an Agent with a different existing Agent",
        description: "Point a slot at another Agent already in the catalog.",
        defaultMode: "review",
        subject: "agent",
    },
    {
        key: "replace_workflow_with_workflow",
        rowNum: 17,
        tier: 3,
        label: "Replace a Workflow with a different existing Workflow",
        description: "Point a slot at another Workflow already in the catalog.",
        defaultMode: "review",
        subject: "workflow",
    },
    {
        key: "replace_agent_with_orchestra",
        rowNum: 18,
        tier: 3,
        label: "Replace an Agent with an existing Orchestra",
        description: "Swap a single Agent for a composed Orchestra where one mind was not enough.",
        defaultMode: "review",
        subject: "orchestra",
    },
    {
        key: "replace_orchestra_with_workflow",
        rowNum: 19,
        tier: 3,
        label: "Replace an Orchestra with an existing Workflow",
        description: "Layer collapse using a catalog unit: the pattern held, so the improvisation hardens into steps.",
        defaultMode: "review",
        subject: "workflow",
    },
    {
        key: "replace_agent_call_with_function",
        rowNum: 20,
        tier: 3,
        label: "Replace an Agent call with a Function, Tool, or Matrx Action",
        description: "Swap judgment for determinism where the judgment call always lands the same way.",
        defaultMode: "review",
        subject: "tool",
    },
    {
        key: "replace_function_with_agent",
        rowNum: 21,
        tier: 3,
        label: "Replace a Function with an Agent where determinism was too rigid",
        description: "Swap determinism for judgment where fixed code keeps mishandling real variety.",
        defaultMode: "review",
        subject: "agent",
    },

    // ── Tier 4 — Creation ──────────────────────────────────────────────────
    {
        key: "create_replacement_agent",
        rowNum: 22,
        tier: 4,
        label: "Create a new Agent to replace one that isn't getting the job done",
        description: "Author a brand-new Agent, not pick an existing one.",
        defaultMode: "review",
        subject: "agent",
    },
    {
        key: "crystallize_workflow_from_orchestra",
        rowNum: 23,
        tier: 4,
        label: "Create a new Workflow by crystallizing an Orchestra's repeated pattern",
        description: "Turn a pattern an Orchestra keeps improvising into a fixed, cheaper Workflow.",
        defaultMode: "review",
        subject: "workflow",
    },
    {
        key: "create_orchestra_from_workflow",
        rowNum: 24,
        tier: 4,
        label: "Create a new Orchestra to replace an over-rigid Workflow",
        description: "Expand fixed steps back into judgment where the Workflow keeps failing on variety.",
        defaultMode: "review",
        subject: "orchestra",
    },
    {
        key: "create_function_or_tool",
        rowNum: 25,
        tier: 4,
        label: "Create a new Function or Tool",
        description: "Author new executable capability.",
        defaultMode: "review",
        // Doc says "(plus the existing context-starved code reviewer)". That
        // reviewer EXISTS since D-18 (2026-08-15, pinned version 1215a990-…)
        // but is not wired into any apply path yet — so this row ships as
        // plain Review. See FEATURE.md § Row 25.
        note: "Will additionally route through the context-starved code reviewer once that guard is wired into the apply path.",
        subject: "tool",
    },
    {
        key: "create_rubric_or_gate",
        rowNum: 26,
        tier: 4,
        label: "Create a new rubric or gate where none existed",
        description: "Add a quality bar where output previously shipped unjudged.",
        defaultMode: "review",
    },
    {
        key: "admit_unit_to_catalog",
        rowNum: 27,
        tier: 4,
        label: "Admit a newly created unit into the org catalog",
        description: "Make a new unit visible for other runs and builders to pick up.",
        defaultMode: "review",
    },

    // ── Tier 5 — Topology ──────────────────────────────────────────────────
    {
        key: "add_workflow_step",
        rowNum: 28,
        tier: 5,
        label: "Add a step to a Workflow",
        description: "Grow the shape of a Workflow by one step.",
        defaultMode: "review",
        subject: "workflow",
    },
    {
        key: "remove_workflow_step",
        rowNum: 29,
        tier: 5,
        label: "Remove a step from a Workflow",
        description: "Shrink the shape of a Workflow by one step.",
        defaultMode: "review",
        subject: "workflow",
    },
    {
        key: "add_orchestra_member",
        rowNum: 30,
        tier: 5,
        label: "Add an Agent to an Orchestra's roster",
        description: "Give an Orchestra a new member to delegate to.",
        defaultMode: "review",
        subject: "orchestra",
    },
    {
        key: "remove_orchestra_member",
        rowNum: 31,
        tier: 5,
        label: "Remove an Agent from an Orchestra's roster",
        description: "Take a member away from an Orchestra.",
        defaultMode: "review",
        subject: "orchestra",
    },
    {
        key: "collapse_layer",
        rowNum: 32,
        tier: 5,
        label: "Collapse a layer (Orchestra → Workflow)",
        description: "Harden a judgment layer into deterministic steps.",
        defaultMode: "review",
        subject: "workflow",
    },
    {
        key: "expand_layer",
        rowNum: 33,
        tier: 5,
        label: "Expand a layer (Workflow → Orchestra) after failures",
        description: "Reopen a hardened layer into judgment after the fixed shape keeps failing.",
        defaultMode: "review",
        subject: "orchestra",
    },
    {
        key: "split_or_merge_units",
        rowNum: 34,
        tier: 5,
        label: "Split one unit into two, or merge two into one",
        description: "Change how responsibility is divided between units.",
        defaultMode: "review",
    },
    {
        key: "move_layer_boundary",
        rowNum: 35,
        tier: 5,
        label: "Change where a layer boundary sits",
        description: "Move responsibility between layers of the composition.",
        defaultMode: "review",
    },

    // ── Tier 6 — Oversight itself ──────────────────────────────────────────
    {
        key: "promote_provisional_path",
        rowNum: 36,
        tier: 6,
        label: "Promote a provisional path to compiled",
        description: "Make a provisional route the standing one.",
        defaultMode: "review",
    },
    {
        key: "remove_passing_gate",
        rowNum: 37,
        tier: 6,
        label: "Remove a gate that has passed N consecutive times",
        description: "Judge compilation (Part VII): retire a check that never fires — which is also how a system blinds itself.",
        defaultMode: "review",
    },
    {
        key: "change_own_handling_mode",
        rowNum: 38,
        tier: 6,
        label: "Change a change-type's own handling mode",
        description: "Edit THIS surface — how any kind of change is handled. Human only, always: the system may never widen its own permissions.",
        defaultMode: "off",
        floorHumanOnly: true,
        note: "Floored structurally in platform.resolve_change_handling — no catalogue edit, seed, or org row can lift it.",
        subject: "policy",
    },
    {
        key: "revert_human_approved_change",
        rowNum: 39,
        tier: 6,
        label: "Auto-revert a human-approved change to its prior version",
        description: "Undo something a person explicitly approved (Part 0.13). The system may propose the revert; a person decides.",
        defaultMode: "review",
        note: "Doc default is 'Propose revert' — expressed here as Review: the proposal is the revert.",
    },
    {
        key: "rewrite_unit_purpose",
        rowNum: 40,
        tier: 6,
        label: "Rewrite a unit's stated purpose",
        description: "Change what a unit SAYS it is for (Part 0.14) — the reference Internal Affairs measures it against.",
        defaultMode: "review",
        note: "Stricter than its tier alone implies: purpose drift is how a system quietly redefines success.",
    },
    {
        key: "internal_affairs_revert_ai_change",
        rowNum: 41,
        tier: 6,
        label: "Internal Affairs reverting an AI-authored change",
        description: "AI may freely undo what AI did (Part 0.13) — the original change's review window does not transfer to the correction.",
        defaultMode: "automatic",
        note: "No waiting period inherited from the change being reverted.",
    },

    // ── Consumer-registered rows (the list grows over time) ────────────────
    {
        key: "outreach.attribution_credit",
        rowNum: 42,
        tier: 1,
        label: "Credit an outreach outcome to a campaign (attribution)",
        description: "A pitched domain plus a link inside the window is credited to the campaign that pitched it — reversible in one click.",
        defaultMode: "auto_with_audit",
        note: "Registered by aidream services/outcome_attribution (D-W4-7/8/9). Default is Arman's low-bar ruling: act, show, keep it reversible.",
    },
] as const;

// ── Derived lookups ─────────────────────────────────────────────────────────

export const CHANGE_TYPE_BY_KEY: ReadonlyMap<string, ChangeTypeDef> = new Map(
    CHANGE_TYPE_CATALOGUE.map((row) => [row.key, row]),
);

export const TIER_META_BY_TIER: ReadonlyMap<ChangeTypeTier, ChangeTypeTierMeta> = new Map(
    CHANGE_TYPE_TIERS.map((t) => [t.tier, t]),
);

export function changeTypesForTier(tier: ChangeTypeTier): ChangeTypeDef[] {
    return CHANGE_TYPE_CATALOGUE.filter((row) => row.tier === tier);
}

/** D-13 default expiry for a row: proceed only in Tier 1, hold above. */
export function defaultTimeoutExpiryFor(row: ChangeTypeDef): TimeoutExpiry {
    const meta = TIER_META_BY_TIER.get(row.tier);
    if (!meta) throw new Error(`[change-policy] tier ${row.tier} missing from CHANGE_TYPE_TIERS`);
    return meta.defaultTimeoutExpiry;
}

/** The one structurally floored key — mirrored in SQL; see resolve_change_handling. */
export const FLOORED_CHANGE_TYPE_KEY = "change_own_handling_mode";
