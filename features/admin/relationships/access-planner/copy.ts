// features/admin/relationships/access-planner/copy.ts
//
// Pure copy-payload builders for the Access Planner — consumed by
// <CopyButtons> in AccessPlannerImpl. Kept out of the Impl so the payload
// shape is testable and the graph component's diff stays small. The agent
// flavor always goes through buildAgentPayload (via CopyButtons); never
// hand-roll the envelope here.

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import { RELATIONSHIPS_LOCATION } from "../utils";
import type { AccessPlannerSnapshot, PlannerTable } from "./types";

/** The filtered, per-table view of the loaded schema snapshot — the fields an
 *  agent needs to reason about access decisions, without the column noise. */
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

export function plannerSnapshotHuman(snapshot: AccessPlannerSnapshot): string {
  const lines = snapshot.tables.map((table) => {
    const issues =
      table.issue_codes.length > 0
        ? ` — issues: ${table.issue_codes.join(", ")}`
        : "";
    return `${table.schema_name}.${table.table_name} [${table.relation_kind}] disposition=${table.disposition}${
      table.token ? ` token=${table.token}` : ""
    } rls=${table.rls_enabled ? "on" : "off"}(${table.policy_count} policies)${
      table.rls_variant ? ` variant=${table.rls_variant}` : ""
    }${table.is_shareable ? " shareable" : ""}${issues}`;
  });
  return [
    `Access planner snapshot — schema "${snapshot.schema}" (${snapshot.tables.length} relations, generated ${snapshot.generated_at})`,
    ...lines,
  ].join("\n");
}

export function plannerSnapshotAgentPayload(
  snapshot: AccessPlannerSnapshot,
): AgentPayloadInput {
  const problemCount = snapshot.tables.filter(
    (table) => table.issue_codes.length > 0,
  ).length;
  return {
    kind: "access-planner-schema-snapshot",
    location: RELATIONSHIPS_LOCATION,
    description:
      "The Access Planner's loaded schema snapshot: every relation's access disposition, RLS state, entity token, issue codes, and canonical findings.",
    data: plannerSnapshotData(snapshot),
    attributes: {
      schema: snapshot.schema,
      tables: snapshot.tables.length,
      problems: problemCount,
    },
    context: { generated_at: snapshot.generated_at },
  };
}

/** Everything the planner knows about ONE table: the full row (columns,
 *  policies) plus the FKs, access relationships, and association rules that
 *  touch it. */
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

export function plannerTableHuman(
  snapshot: AccessPlannerSnapshot,
  table: PlannerTable,
): string {
  const detail = plannerTableDetailData(snapshot, table);
  return [
    `${table.schema_name}.${table.table_name} [${table.relation_kind}]`,
    `disposition=${table.disposition}${table.token ? ` token=${table.token}` : ""}${
      table.label ? ` label="${table.label}"` : ""
    }`,
    `RLS ${table.rls_enabled ? "enabled" : "disabled"} · ${table.policy_count} policies${
      table.rls_variant ? ` · variant=${table.rls_variant}` : ""
    }${table.policy_names.length > 0 ? ` (${table.policy_names.join(", ")})` : ""}`,
    `shareable=${table.is_shareable} direct_grants=${table.direct_grants} scopeable=${table.scopeable} estimated_rows=${table.estimated_rows}`,
    table.issue_codes.length > 0
      ? `issues: ${table.issue_codes.join(", ")}`
      : "no open issues",
    `columns (${table.columns.length}): ${table.columns
      .map((column) => `${column.name}:${column.type}`)
      .join(", ")}`,
    `${detail.foreign_keys.length} touching foreign keys · ${detail.access_relationships.length} access relationships · ${detail.association_rules.length} association rules`,
  ].join("\n");
}

export function plannerTableAgentPayload(
  snapshot: AccessPlannerSnapshot,
  table: PlannerTable,
): AgentPayloadInput {
  return {
    kind: "access-planner-table-detail",
    location: RELATIONSHIPS_LOCATION,
    description:
      "One table from the Access Planner with its full detail: columns, RLS policies, and every foreign key, access relationship, and association rule touching it.",
    data: plannerTableDetailData(snapshot, table),
    summary: plannerTableHuman(snapshot, table),
    attributes: {
      schema: table.schema_name,
      table: table.table_name,
      token: table.token,
      disposition: table.disposition,
      issues: table.issue_codes.length,
    },
  };
}
