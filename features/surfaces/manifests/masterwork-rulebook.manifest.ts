/**
 * Surface manifest — one Rulebook inside Masterwork Studio.
 *
 * Runtime emitter: `features/masterwork/agent-context/rulebookSurfaceScope.ts`,
 * mounted by `features/masterwork/components/detail/RulebookDetailPage.tsx`.
 */

import type {
  SurfaceClientTool,
  SurfaceManifest,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";

export const MASTERWORK_RULEBOOK_SURFACE_NAME =
  "matrx-user/masterwork-rulebook";

const groups: SurfaceValueGroup[] = [
  {
    key: "rulebook_identity",
    label: "Rulebook identity",
    sortOrder: 100,
    description: "The open Rulebook and its ownership and lifecycle state.",
  },
  {
    key: "rulebook_source",
    label: "Source",
    sortOrder: 200,
    description: "The source work or expertise this Rulebook distills.",
  },
  {
    key: "rulebook_rules",
    label: "Rules",
    sortOrder: 300,
    description:
      "The full rules, their sections, and review-state projections.",
  },
  {
    key: "rulebook_outputs",
    label: "Masterworks",
    sortOrder: 400,
    description:
      "The Understudy and built Masterworks powered by this Rulebook.",
  },
  {
    key: "rulebook_workspace",
    label: "Workspace state",
    sortOrder: 500,
    description: "What the user is filtering, editing, or viewing right now.",
  },
];

const values: SurfaceValue[] = [
  {
    name: "rulebook_id",
    label: "Rulebook ID",
    description: "UUID of the Rulebook open on this page.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 100,
    group: "rulebook_identity",
  },
  {
    name: "rulebook_name",
    label: "Rulebook name",
    description: "The Rulebook's current human-readable name.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    sortOrder: 110,
    group: "rulebook_identity",
  },
  {
    name: "rulebook_description",
    label: "Rulebook description",
    description:
      "The Rulebook's current description; empty when none was supplied.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 300,
    sortOrder: 120,
    group: "rulebook_identity",
  },
  {
    name: "rulebook_status",
    label: "Rulebook status",
    description: "Lifecycle state: draft, active, or archived.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 130,
    group: "rulebook_identity",
  },
  {
    name: "rulebook_version",
    label: "Rulebook version",
    description:
      "Current optimistic-concurrency version; every rules save advances it.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 140,
    group: "rulebook_identity",
  },
  {
    name: "rulebook_visibility",
    label: "Rulebook visibility",
    description: "Visibility policy currently stamped on the Rulebook.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 150,
    group: "rulebook_identity",
    autoContext: false,
  },
  {
    name: "rulebook_organization_id",
    label: "Rulebook organization ID",
    description: "Organization UUID that owns the Rulebook.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 160,
    group: "rulebook_identity",
    autoContext: false,
  },
  {
    name: "can_edit",
    label: "Can edit",
    description: "Whether the signed-in user may change this Rulebook.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 170,
    group: "rulebook_identity",
  },
  {
    name: "rulebook",
    label: "Rulebook",
    description:
      "Complete open Rulebook record, including source, sections, rules, metadata, ownership, and timestamps.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 16000,
    sortOrder: 180,
    group: "rulebook_identity",
    autoContext: false,
  },
  {
    name: "source",
    label: "Source",
    description:
      "Source title, author, year, provenance URL, license, and note when known.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 500,
    sortOrder: 200,
    group: "rulebook_source",
  },
  {
    name: "source_title",
    label: "Source title",
    description:
      "Title of the source work; empty for expertise captured without a titled source.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 120,
    sortOrder: 210,
    group: "rulebook_source",
  },
  {
    name: "source_author",
    label: "Source author",
    description:
      "Author of the source work; empty when unknown or not applicable.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    sortOrder: 220,
    group: "rulebook_source",
  },
  {
    name: "sections",
    label: "Rulebook sections",
    description:
      "Section-code to section-label dictionary that organizes the rules.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 1000,
    sortOrder: 300,
    group: "rulebook_rules",
  },
  {
    name: "rules",
    label: "All rules",
    description:
      "Every rule, including approved, draft, rejected, and retired rules with provenance and feedback.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 14000,
    sortOrder: 310,
    group: "rulebook_rules",
  },
  {
    name: "approved_rules",
    label: "Approved rules",
    description: "Rules currently approved to power a Masterwork.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 9000,
    sortOrder: 320,
    group: "rulebook_rules",
  },
  {
    name: "draft_rules",
    label: "Draft rules",
    description: "Rules waiting for the Expert's review and approval.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 5000,
    sortOrder: 330,
    group: "rulebook_rules",
  },
  {
    name: "rejected_rules",
    label: "Rejected rules",
    description:
      "Rejected rules waiting for the interviewer to rewrite or withdraw them.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 3000,
    sortOrder: 340,
    group: "rulebook_rules",
  },
  {
    name: "retired_rules",
    label: "Retired rules",
    description:
      "Rules retained for citation history but excluded from new Masterworks.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 3000,
    sortOrder: 350,
    group: "rulebook_rules",
  },
  {
    name: "rule_counts",
    label: "Rule counts",
    description:
      "Approved, draft, rejected, retired, and total rule counts shown by the workspace.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 120,
    sortOrder: 360,
    group: "rulebook_rules",
  },
  {
    name: "masterworks",
    label: "Masterworks",
    description:
      "Every workflow projection loaded for this Rulebook, including the Understudy.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 3000,
    sortOrder: 400,
    group: "rulebook_outputs",
  },
  {
    name: "understudy",
    label: "Understudy",
    description:
      "The running-from-minute-one Masterwork, or null until one exists.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 410,
    group: "rulebook_outputs",
  },
  {
    name: "built_masterworks",
    label: "Built Masterworks",
    description: "Built Masterworks excluding the Understudy.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2500,
    sortOrder: 420,
    group: "rulebook_outputs",
  },
  {
    name: "search_query",
    label: "Rule search",
    description:
      "Current text filtering the rules list; empty means no filter.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    sortOrder: 500,
    group: "rulebook_workspace",
  },
  {
    name: "visible_rules",
    label: "Visible rules",
    description:
      "Rules matching the current search query in their displayed section order.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 8000,
    sortOrder: 510,
    group: "rulebook_workspace",
    autoContext: false,
  },
  {
    name: "active_rule",
    label: "Active rule",
    description:
      "Existing rule currently open in the editor, or null when adding or not editing.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 520,
    group: "rulebook_workspace",
  },
  {
    name: "active_rule_draft",
    label: "Active rule draft",
    description:
      "Live unsaved values in the open Add/Edit Rule dialog, including mode and rule id; null while the editor is closed.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 530,
    group: "rulebook_workspace",
  },
  {
    name: "workspace_state",
    label: "Workspace state",
    description:
      "Open dialogs and routed launch lanes: editor, interview, ingest, corpus, build, review wizard, activation confirmation, and current feedback target.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 500,
    sortOrder: 540,
    group: "rulebook_workspace",
    autoContext: false,
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "rule_draft",
    label: "Rule draft",
    description:
      "Stages a complete or partial proposed rule in the page's Add/Edit Rule dialog. For edit mode, rule_id must identify a rule already present; the user sees the populated form and still decides whether to save it.",
    valueType: "object",
    updatesValue: "active_rule_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "rulebook_workspace",
    sortOrder: 100,
  },
  {
    name: "search_query",
    label: "Rule search",
    description: "Changes only the visible rule filter; nothing is persisted.",
    valueType: "string",
    updatesValue: "search_query",
    mode: "ui",
    applyPolicy: "auto",
    group: "rulebook_workspace",
    sortOrder: 110,
  },
  {
    name: "checkup_decision",
    label: "Final Checkup decision",
    description:
      "The Expert's own Approve / Improve / Reject / Edit click on ONE Final Checkup finding, carried from the rendered finding card to the checkup panel. Value: { finding_id: string, verb: 'approve' | 'improve' | 'reject' | 'edit', alternative_index?: number }. Nothing is written to the Rulebook here — decisions accumulate and land in one save when the Expert presses Apply. applyPolicy is deliberately 'manual': deciding which of the Expert's own rules to change is the one judgement this product exists to keep with him, so an agent-originated write is refused outright.",
    valueType: "object",
    mode: "ui",
    applyPolicy: "manual",
    group: "rulebook_workspace",
    sortOrder: 120,
  },
];

const clientTools: SurfaceClientTool[] = [
  {
    name: "masterwork_refresh_rulebook",
    label: "Refresh Rulebook",
    description:
      "Refetches the open Rulebook and its Masterworks through the page's canonical data loaders. Use after another actor or completed run may have changed this Rulebook; it preserves the route and returns the refreshed version and output count.",
    inputSchema: { type: "object", properties: {}, required: [] },
    mode: "ui",
  },
];

export const masterworkRulebookManifest: SurfaceManifest = {
  surfaceName: MASTERWORK_RULEBOOK_SURFACE_NAME,
  label: "Rulebook",
  readiness: "verified",
  urlPattern: "/masterwork/[rulebookId]",
  intro: `<surface_intro>
You are on one Rulebook inside Masterwork Studio: the durable, versioned capture of an Expert's judgment. The page is where the Expert reviews, corrects, sources, and approves rules; approved rules power the Understudy and every built Masterwork.
Read rules for the complete truth, and use approved_rules, draft_rules, rejected_rules, retired_rules, and rule_counts for the current review picture. source and each rule's source_ref are evidence, not decoration. masterworks includes the Understudy; built_masterworks deliberately excludes it.
The user owns every judgment call. To help author a rule, write one rule_draft object: it opens and stages the human-readable form but never saves. Use mode "new" for a proposed addition or mode "edit" with a rule_id already present in rules. The user reviews and presses Add rule or Save rule. search_query is a harmless view filter.
If another agent, interview, ingestion, or tab may have changed the data, call masterwork_refresh_rulebook. It refetches this workspace's client-owned Rulebook and Masterwork state; do not substitute a browser reload.
Never approve, reject, retire, activate, build, or release on the user's behalf. Explain the recommendation and leave those consequential controls to the Expert.
</surface_intro>`,
  groups,
  values,
  writeTargets,
  clientTools,
  agentRoles: [
    {
      name: "rulebook_advisor",
      label: "Rulebook advisor",
      description:
        "Audits the complete Rulebook for gaps, conflicts, weak evidence, and rules that are difficult to apply, then recommends the smallest useful improvements.",
      kind: "single",
      defaultAgentId: null,
      allowCustom: true,
      autoRun: "never",
      sortOrder: 100,
    },
    {
      name: "rule_editor",
      label: "Rule editor",
      description:
        "Turns the Expert's intent and evidence into precise proposed rules and stages them through the Rule draft write target for human review.",
      kind: "single",
      defaultAgentId: null,
      allowCustom: true,
      autoRun: "never",
      sortOrder: 200,
    },
    // System jobs — each behind its Mandate (`agent.mandate` decides the
    // Holder; code never names an agent UUID). These are the same jobs the
    // page's own panels run; declaring them as roles makes them visible and
    // ad-hoc runnable from the header Agents menu.
    {
      name: "scout",
      label: "Interviewer",
      description:
        "Conducts the guided interview that draws the Expert's method out of them in conversation and drafts rules from it (the Scout).",
      kind: "single",
      defaultAgentId: null,
      mandateKey: "masterwork.scout",
      allowCustom: true,
      autoRun: "never",
      sortOrder: 300,
    },
    {
      name: "conductor",
      label: "Conductor",
      // THE ONE canonical Masterwork system (2026-08-18). Nothing else makes a
      // Masterwork. Held as a live streaming conversation on this surface and
      // at /masterwork/[id]/conduct.
      description:
        "The one system that turns what the Expert already has into a working Masterwork: reads what is attached, learns what the platform can really do, pokes holes in the method input by input, turns anything unresolved into a real Plan step, and authors the workflow — or refuses and says what is missing.",
      kind: "single",
      defaultAgentId: null,
      mandateKey: "masterwork.conductor",
      allowCustom: true,
      autoRun: "never",
      sortOrder: 310,
    },
    {
      name: "rule_improver",
      label: "Rule improver",
      // The ONE rule-rewrite Mandate (live in agent.mandate since 2026-08-17):
      // feedback rewrite, new-rule drafting (empty rule_json), and the
      // editor's no-feedback tidy (empty expert_input). The sibling
      // `masterwork.rule_cleanup` was retired into it on 2026-08-17.
      description:
        "Rewrites a rejected or weak rule from the Expert's review feedback and stages the improved version for approval.",
      kind: "single",
      defaultAgentId: null,
      mandateKey: "masterwork.rule_improver",
      allowCustom: true,
      autoRun: "never",
      sortOrder: 400,
    },
    {
      name: "checkup_auditor",
      label: "Checkup auditor",
      description:
        "Checks work against the Rulebook's approved rules — every verdict cites the exact rule it applied.",
      kind: "single",
      defaultAgentId: null,
      mandateKey: "masterwork.checkup_auditor",
      allowCustom: true,
      autoRun: "never",
      sortOrder: 500,
    },
    {
      name: "corpus_cleaner",
      label: "Corpus cleaner",
      description:
        "Cleans raw captured expertise (dictations, dumps, transcripts) into reviewable source material before distillation.",
      kind: "single",
      defaultAgentId: null,
      mandateKey: "masterwork.corpus_cleaner",
      allowCustom: true,
      autoRun: "never",
      sortOrder: 600,
    },
  ],
};
