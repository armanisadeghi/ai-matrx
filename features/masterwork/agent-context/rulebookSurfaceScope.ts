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

export interface BuildRulebookSurfaceScopeArgs {
  rulebook: Rulebook;
  masterworks: Masterwork[];
  canEdit: boolean;
  searchQuery: string;
  visibleRules: RulebookRule[];
  activeRule: RulebookRule | null;
  activeRuleDraft: RulebookDraftSnapshot | null;
  workspaceState: RulebookWorkspaceState;
}

export function buildRulebookSurfaceScope({
  rulebook,
  masterworks,
  canEdit,
  searchQuery,
  visibleRules,
  activeRule,
  activeRuleDraft,
  workspaceState,
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
