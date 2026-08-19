import type { SurfaceScopePayload } from "@/features/surfaces/types";
// ONE Rulebook renderer — the surface's `content` and the bound
// `rulebook_document` variable must never show two different Rulebooks.
import { renderRulebookDocument } from "./rulebookDocument";
import {
  ruleState,
  type Masterwork,
  type Rulebook,
  type RulebookRule,
} from "../types";

export interface RulebookDraftSnapshot {
  mode: "new" | "edit";
  rule_id: string | null;
  name: string;
  statement: string;
  rationale: string;
  detection: string;
  quote: string;
  severity: RulebookRule["severity"];
  section: string;
}

export interface RulebookWorkspaceState {
  editor_open: boolean;
  interview_open: boolean;
  ingest_open: boolean;
  corpus_open: boolean;
  chat_import_open: boolean;
  build_open: boolean;
  review_wizard_open: boolean;
  activate_confirmation_open: boolean;
  feedback_rule_id: string | null;
  feedback_mode: string | null;
  dump_focus: boolean;
  assist_key: string | null;
}

/**
 * The `workspace_state` every lane route publishes: nothing on the detail
 * page's dialog stack is open, because the lane IS the mode. `lane` names
 * which door the Expert came through so the agent is never guessing.
 */
export const CLOSED_RULEBOOK_WORKSPACE_STATE: RulebookWorkspaceState = {
  editor_open: false,
  interview_open: false,
  ingest_open: false,
  corpus_open: false,
  chat_import_open: false,
  build_open: false,
  review_wizard_open: false,
  activate_confirmation_open: false,
  feedback_rule_id: null,
  feedback_mode: null,
  dump_focus: false,
  assist_key: null,
};

export interface BuildRulebookSurfaceScopeArgs {
  rulebook: Rulebook;
  canEdit: boolean;
  /**
   * Everything below is the DETAIL PAGE's live workspace. A lane route
   * (`/masterwork/[id]/<lane>`) publishes the same Rulebook truth without a
   * rules list, editor, or dialog stack of its own, so each is optional and
   * defaults to the honest "nothing open, nothing filtered" reading. ONE
   * builder — a lane must never emit a second, thinner shape of this surface.
   */
  masterworks?: Masterwork[];
  searchQuery?: string;
  visibleRules?: RulebookRule[];
  activeRule?: RulebookRule | null;
  activeRuleDraft?: RulebookDraftSnapshot | null;
  workspaceState?: RulebookWorkspaceState;
  /** Lane slug (`conduct`, `interview`, `sources`, …) when not the detail page. */
  lane?: string;
}

export function buildRulebookSurfaceScope({
  rulebook,
  canEdit,
  masterworks = [],
  searchQuery = "",
  visibleRules = rulebook.rules,
  activeRule = null,
  activeRuleDraft = null,
  workspaceState = CLOSED_RULEBOOK_WORKSPACE_STATE,
  lane,
}: BuildRulebookSurfaceScopeArgs): SurfaceScopePayload {
  const approvedRules = rulebook.rules.filter(
    (rule) => ruleState(rule) === "approved",
  );
  const draftRules = rulebook.rules.filter(
    (rule) => ruleState(rule) === "draft",
  );
  const rejectedRules = rulebook.rules.filter(
    (rule) => ruleState(rule) === "rejected",
  );
  const retiredRules = rulebook.rules.filter(
    (rule) => ruleState(rule) === "retired",
  );
  const understudy = masterworks.find((item) => item.understudy) ?? null;
  const builtMasterworks = masterworks.filter((item) => !item.understudy);

  return {
    selection: "",
    text_before: "",
    text_after: "",
    content: renderRulebookDocument(rulebook),
    context: {
      surface: "masterwork_rulebook",
      rulebook_id: rulebook.id,
      current_filter: searchQuery,
      lane: lane ?? "rulebook",
    },
    rulebook_id: rulebook.id,
    rulebook_name: rulebook.name,
    rulebook_description: rulebook.description ?? "",
    rulebook_status: rulebook.status,
    rulebook_version: rulebook.version,
    rulebook_visibility: rulebook.visibility,
    rulebook_organization_id: rulebook.organization_id,
    can_edit: canEdit,
    rulebook,
    source: rulebook.source,
    source_title: rulebook.source.title ?? "",
    source_author: rulebook.source.author ?? "",
    sections: rulebook.sections,
    rules: rulebook.rules,
    approved_rules: approvedRules,
    draft_rules: draftRules,
    rejected_rules: rejectedRules,
    retired_rules: retiredRules,
    rule_counts: {
      total: rulebook.rules.length,
      approved: approvedRules.length,
      draft: draftRules.length,
      rejected: rejectedRules.length,
      retired: retiredRules.length,
    },
    masterworks,
    understudy,
    built_masterworks: builtMasterworks,
    search_query: searchQuery,
    visible_rules: visibleRules,
    active_rule: activeRule,
    active_rule_draft: activeRuleDraft,
    workspace_state: workspaceState,
  };
}
