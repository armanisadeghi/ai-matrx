// features/admin/relationships/access-planner/copy.ts
//
// Copy-payload builders for the Access Planner, consumed by <CopyButtons> in
// AccessPlannerImpl.
//
// THE RULE (Arman, 2026-08-12): the PRIMARY "Copy for AI" payload is WHAT THE
// USER IS LOOKING AT — the rendered panel/page converted to data, including
// LIVE unsaved form state, at roughly the size of what is on screen. The raw
// full-detail dump (every FK, rule, column object) exists only as the
// "Everything" menu variant, never as the default. A payload that dumps the
// universe while missing the decision blocker the user is staring at is a
// defect, not a copy button.
//
// DISPOSITION_COPY / ISSUE_COPY live here (imported by the Impl) so the copied
// text is, by construction, the same text the panel renders.

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import { RELATIONSHIPS_LOCATION } from "../utils";
import type { AccessPlannerSnapshot, PlannerTable } from "./types";

export const DISPOSITION_COPY: Record<
  PlannerTable["disposition"],
  { label: string; description: string }
> = {
  entity: {
    label: "Own access",
    description: "Can be granted directly and can contain descendants.",
  },
  nested_entity: {
    label: "Nested entity",
    description: "Inherits from a parent and can still be granted directly.",
  },
  component: {
    label: "Parent-owned",
    description:
      "Exists inside its parent and has no independent access opinion.",
  },
  infrastructure: {
    label: "Infrastructure",
    description: "Intentionally excluded from user-facing access planning.",
  },
  unplanned: {
    label: "Needs a decision",
    description: "This table has not been placed in the access model.",
  },
  derived: {
    label: "Derived",
    description:
      "A view; access follows its underlying query and is audited separately.",
  },
};

export const ISSUE_COPY: Record<string, string> = {
  unplanned_table: "No access decision has been recorded.",
  rls_disabled: "Row-level security is disabled.",
  no_policies: "No row-level security policies exist.",
  component_without_parent: "Parent-owned table has no composition parent.",
  // component_directly_shareable was RETIRED 2026-08-12: a component that is
  // also a share point is the ratified dual-identity model (SHARING_MODEL.md
  // §3), now surfaced as the nested_entity disposition — never a blocker.
  component_rls_mismatch: "Component metadata and its RLS template disagree.",
  entity_rls_mismatch: "Independent entity is using component RLS.",
  containment_without_visibility:
    "Nested entities need a visibility column before access can inherit.",
  sharing_not_enforced_by_rls:
    "Sharing is registered but direct grants are not enforced by RLS.",
};

export const issueText = (code: string) =>
  ISSUE_COPY[code] ??
  code.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------
// The panel view — the right pane exactly as rendered, from LIVE state.
// Built by the Impl inside the click handler so unsaved edits are captured.
// ---------------------------------------------------------------------------

export interface PlannerPanelView {
  schema: string;
  table: PlannerTable;
  /** The cascade trace shown as "Sharing this reaches N related entity types". */
  reach: { editor: number; viewer: number; tokens: string[] };
  isDerived: boolean;
  /** The Access decision form's CURRENT values — live inputs, possibly unsaved. */
  form: {
    /** The selected mode card. */
    mode: string;
    modeTitle: string;
    /** Live input values (what the user typed, not what is saved). */
    token: string;
    label: string;
    /** Human text of the chosen parent, e.g. "Site via site_id"; null if none. */
    parentRelationship: string | null;
    /** Infrastructure-mode reason textarea. */
    reason: string;
    /** Fields whose live value differs from the saved snapshot. */
    unsavedChanges: string[];
  };
  /** The red validation texts currently visible under the form. */
  warnings: string[];
  /** Whether "Apply access decision" is disabled, and every reason why. */
  applyBlocked: boolean;
  applyBlockedReasons: string[];
  /** The "Open the connected controls" doors. */
  doors: {
    entityRegistryToken: string | null;
    sharingRegistered: boolean;
    connectedRuleCount: number;
  };
  /** The "Physical evidence" block. */
  physical: {
    columnCount: number;
    estimatedRows: number;
    rlsEnabled: boolean;
    policyCount: number;
    parentFkCandidates: number;
    isManyToMany: boolean;
    columnNames: string[];
  };
  /** Left-panel big picture: every table currently showing a blocker badge. */
  schemaContext: {
    decided: number;
    baseTables: number;
    problemTables: { table: string; issues: string[] }[];
  };
}

export function plannerPanelHuman(view: PlannerPanelView): string {
  const { table, form } = view;
  const disposition = DISPOSITION_COPY[table.disposition];
  const lines: string[] = [
    `${table.label ?? table.table_name} — ${table.schema_name}.${table.table_name}`,
    `Disposition: ${disposition.label} — ${disposition.description}`,
  ];

  if (table.issue_codes.length > 0) {
    lines.push(
      "",
      `DECISION BLOCKER${table.issue_codes.length === 1 ? "" : "S"} (${table.issue_codes.length}):`,
      ...table.issue_codes.map((code) => `• ${issueText(code)}`),
    );
  }

  if (table.token) {
    lines.push(
      "",
      `Sharing this reaches ${view.reach.tokens.length} related entity types — ${view.reach.editor} inherit editor access, ${view.reach.viewer} are capped at viewer.`,
    );
  }

  if (view.isDerived) {
    lines.push(
      "",
      "Derived view — nothing to decide. Access follows the RLS of the tables in its underlying query.",
    );
  } else {
    lines.push(
      "",
      "Access decision form (LIVE values — may include unsaved edits):",
      `- Selected mode: ${form.modeTitle} (${form.mode})`,
      `- Entity token: ${form.token || "(empty)"}`,
      `- Label: ${form.label || "(empty)"}`,
      `- Parent relationship: ${form.parentRelationship ?? "(none chosen)"}`,
    );
    if (form.mode === "infrastructure")
      lines.push(`- Reason: ${form.reason || "(empty)"}`);
    if (form.unsavedChanges.length > 0)
      lines.push(
        `- UNSAVED: ${form.unsavedChanges.join("; ")} (not applied until "Apply access decision")`,
      );
    if (view.warnings.length > 0)
      lines.push("", "Validation warnings shown:", ...view.warnings.map((w) => `• ${w}`));
    lines.push(
      "",
      view.applyBlocked
        ? `"Apply access decision" is BLOCKED: ${view.applyBlockedReasons.join("; ")}`
        : `"Apply access decision" is enabled.`,
    );
  }

  lines.push(
    "",
    "Connected controls:",
    `- Entity registry: ${view.doors.entityRegistryToken ?? "not registered yet"}`,
    `- Sharing registry: ${view.doors.sharingRegistered ? "Registered" : "Not directly shareable"}`,
    `- ${view.doors.connectedRuleCount} connected association rules`,
    "",
    `Physical evidence: ${view.physical.columnCount} columns · ${view.physical.estimatedRows.toLocaleString()} estimated rows · RLS ${view.physical.rlsEnabled ? "enabled" : "disabled"} · ${view.physical.policyCount} policies · ${view.physical.parentFkCandidates} candidate parent FKs · ${view.physical.isManyToMany ? "many-to-many junction candidate" : "not a junction candidate"}`,
    `Columns: ${view.physical.columnNames.join(", ")}`,
    "",
    `Schema "${view.schema}": ${view.schemaContext.decided}/${view.schemaContext.baseTables} tables decided · ${view.schemaContext.problemTables.length} with blockers${
      view.schemaContext.problemTables.length > 0
        ? ` — ${view.schemaContext.problemTables
            .map((problem) => `${problem.table} (${problem.issues.length})`)
            .join(", ")}`
        : ""
    }`,
  );
  return lines.join("\n");
}

export function plannerPanelAgentPayload(
  view: PlannerPanelView,
): AgentPayloadInput {
  const { table } = view;
  return {
    kind: "access-planner-panel",
    location: RELATIONSHIPS_LOCATION,
    description:
      "The Access Planner's detail panel exactly as the user sees it: the selected table's disposition, its decision blockers, the sharing-reach trace, the LIVE (possibly unsaved) access-decision form values, visible validation warnings, connected controls, and the schema's open blockers.",
    data: {
      schema: view.schema,
      table: `${table.schema_name}.${table.table_name}`,
      title: table.label ?? table.table_name,
      disposition: {
        value: table.disposition,
        label: DISPOSITION_COPY[table.disposition].label,
        description: DISPOSITION_COPY[table.disposition].description,
      },
      decision_blockers: table.issue_codes.map((code) => ({
        code,
        text: issueText(code),
      })),
      sharing_reach: table.token
        ? {
            related_entity_types: view.reach.tokens.length,
            inherit_editor: view.reach.editor,
            capped_at_viewer: view.reach.viewer,
            tokens: view.reach.tokens,
          }
        : null,
      derived_view: view.isDerived,
      access_decision_form: view.isDerived
        ? null
        : {
            note: "LIVE input values at copy time — unsaved until the user clicks Apply access decision.",
            selected_mode: view.form.mode,
            selected_mode_title: view.form.modeTitle,
            entity_token: view.form.token,
            label: view.form.label,
            parent_relationship: view.form.parentRelationship,
            reason: view.form.mode === "infrastructure" ? view.form.reason : undefined,
            unsaved_changes: view.form.unsavedChanges,
            visible_warnings: view.warnings,
            apply_blocked: view.applyBlocked,
            apply_blocked_reasons: view.applyBlockedReasons,
          },
      connected_controls: view.doors,
      physical_evidence: view.physical,
      schema_context: view.schemaContext,
    },
    attributes: {
      schema: table.schema_name,
      table: table.table_name,
      token: table.token,
      disposition: table.disposition,
      blockers: table.issue_codes.length,
      unsaved_edits: view.form.unsavedChanges.length > 0,
    },
  };
}

// ---------------------------------------------------------------------------
// The page view (header copy) — the planner page as rendered: metric tiles,
// one line per table, blocker detail. The full filtered snapshot stays
// available as the "Everything" variant below.
// ---------------------------------------------------------------------------

export function plannerPageHuman(snapshot: AccessPlannerSnapshot): string {
  const baseTables = snapshot.tables.filter(
    (table) =>
      table.relation_kind === "table" ||
      table.relation_kind === "partitioned_table",
  );
  const problems = snapshot.tables.filter(
    (table) => table.issue_codes.length > 0,
  );
  const lines = [
    `Schema access planner — "${snapshot.schema}": ${baseTables.filter((t) => t.disposition !== "unplanned").length}/${baseTables.length} tables decided, ${problems.length} blockers`,
    `Own access: ${baseTables.filter((t) => t.disposition === "entity").length} · Nested: ${baseTables.filter((t) => t.disposition === "nested_entity").length} · Parent-owned: ${baseTables.filter((t) => t.disposition === "component").length} · Infrastructure: ${baseTables.filter((t) => t.disposition === "infrastructure").length} · Shareable: ${baseTables.filter((t) => t.is_shareable).length}`,
  ];
  if (problems.length > 0) {
    lines.push("", "TABLES WITH BLOCKERS:");
    for (const table of problems)
      lines.push(
        `• ${table.schema_name}.${table.table_name}: ${table.issue_codes.map(issueText).join(" / ")}`,
      );
  }
  lines.push("", "All relations:");
  for (const table of snapshot.tables)
    lines.push(
      `- ${table.schema_name}.${table.table_name} [${table.relation_kind}] ${DISPOSITION_COPY[table.disposition].label}${table.token ? ` token=${table.token}` : ""}${table.is_shareable ? " · shareable" : ""}`,
    );
  return lines.join("\n");
}

export function plannerPageAgentPayload(
  snapshot: AccessPlannerSnapshot,
): AgentPayloadInput {
  const problems = snapshot.tables.filter(
    (table) => table.issue_codes.length > 0,
  );
  return {
    kind: "access-planner-page",
    location: RELATIONSHIPS_LOCATION,
    description:
      "The Access Planner page as the user sees it: per-table access dispositions for the selected schema, with every open decision blocker spelled out.",
    data: {
      schema: snapshot.schema,
      generated_at: snapshot.generated_at,
      blockers: problems.map((table) => ({
        table: `${table.schema_name}.${table.table_name}`,
        issues: table.issue_codes.map((code) => ({
          code,
          text: issueText(code),
        })),
      })),
      tables: snapshot.tables.map((table) => ({
        table: `${table.schema_name}.${table.table_name}`,
        relation_kind: table.relation_kind,
        token: table.token,
        label: table.label,
        disposition: table.disposition,
        disposition_label: DISPOSITION_COPY[table.disposition].label,
        is_shareable: table.is_shareable,
        rls_enabled: table.rls_enabled,
        issue_codes: table.issue_codes,
      })),
    },
    attributes: {
      schema: snapshot.schema,
      tables: snapshot.tables.length,
      blockers: problems.length,
    },
  };
}

// ---------------------------------------------------------------------------
// "Everything" variants — the faithful full dumps, menu options only.
// ---------------------------------------------------------------------------

/** The filtered, per-table view of the loaded schema snapshot. */
export function plannerSnapshotData(snapshot: AccessPlannerSnapshot) {
  return {
    schema: snapshot.schema,
    generated_at: snapshot.generated_at,
    schemas: snapshot.schemas,
    tables: snapshot.tables.map((table) => ({
      table: `${table.schema_name}.${table.table_name}`,
      token: table.token,
      label: table.label,
      relation_kind: table.relation_kind,
      disposition: table.disposition,
      rls_variant: table.rls_variant,
      rls_enabled: table.rls_enabled,
      policy_count: table.policy_count,
      is_shareable: table.is_shareable,
      direct_grants: table.direct_grants,
      estimated_rows: table.estimated_rows,
      issue_codes: table.issue_codes,
      canonical_findings: table.canonical_findings,
    })),
  };
}

export function plannerSnapshotAgentPayload(
  snapshot: AccessPlannerSnapshot,
): AgentPayloadInput {
  return {
    kind: "access-planner-schema-snapshot",
    location: RELATIONSHIPS_LOCATION,
    description:
      "The Access Planner's full loaded schema snapshot: every relation's access disposition, RLS state, entity token, issue codes, and canonical findings.",
    data: plannerSnapshotData(snapshot),
    attributes: {
      schema: snapshot.schema,
      tables: snapshot.tables.length,
      problems: snapshot.tables.filter((t) => t.issue_codes.length > 0).length,
    },
    context: { generated_at: snapshot.generated_at },
  };
}

/** Everything the snapshot knows about ONE table: the full row plus the FKs,
 *  access relationships, and association rules that touch it. */
export function plannerTableDetailData(
  snapshot: AccessPlannerSnapshot,
  table: PlannerTable,
) {
  const touchesTable = (schema: string, name: string) =>
    schema === table.schema_name && name === table.table_name;
  return {
    schema: snapshot.schema,
    table,
    foreign_keys: snapshot.foreign_keys.filter(
      (fk) =>
        touchesTable(fk.source_schema, fk.source_table) ||
        touchesTable(fk.target_schema, fk.target_table),
    ),
    access_relationships: snapshot.access_relationships.filter(
      (relationship) =>
        (table.token !== null &&
          (relationship.child_type === table.token ||
            relationship.parent_type === table.token)) ||
        touchesTable(relationship.child_schema, relationship.child_table) ||
        touchesTable(relationship.parent_schema, relationship.parent_table),
    ),
    association_rules: snapshot.association_rules.filter(
      (rule) =>
        (table.token !== null &&
          (rule.source_type === table.token ||
            rule.target_type === table.token)) ||
        touchesTable(rule.source_schema, rule.source_table) ||
        touchesTable(rule.target_schema, rule.target_table),
    ),
  };
}

export function plannerTableAgentPayload(
  snapshot: AccessPlannerSnapshot,
  table: PlannerTable,
): AgentPayloadInput {
  return {
    kind: "access-planner-table-detail",
    location: RELATIONSHIPS_LOCATION,
    description:
      "Full raw detail for one table from the Access Planner snapshot: columns, RLS policies, and every foreign key, access relationship, and association rule touching it.",
    data: plannerTableDetailData(snapshot, table),
    attributes: {
      schema: table.schema_name,
      table: table.table_name,
      token: table.token,
      disposition: table.disposition,
      issues: table.issue_codes.length,
    },
  };
}
