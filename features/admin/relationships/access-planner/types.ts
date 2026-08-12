import { z } from "zod";

const nullableText = z.string().nullable();

export const plannerColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
  primary: z.boolean(),
});

export const plannerTableSchema = z.object({
  schema_name: z.string(),
  table_name: z.string(),
  relation_kind: z.enum([
    "table",
    "partitioned_table",
    "view",
    "materialized_view",
  ]),
  estimated_rows: z.number(),
  rls_enabled: z.boolean(),
  token: nullableText,
  label: nullableText,
  is_component: z.boolean().nullable(),
  rls_variant: nullableText,
  default_visibility: nullableText,
  content_role: nullableText,
  is_shareable: z.boolean(),
  direct_grants: z.boolean(),
  link_shareable: z.boolean(),
  scopeable: z.boolean(),
  exclusion_reason: nullableText,
  columns: z.array(plannerColumnSchema),
  column_names: z.array(z.string()),
  policy_count: z.number(),
  policy_names: z.array(z.string()),
  has_composition_parent: z.boolean(),
  has_containment_parent: z.boolean(),
  child_count: z.number(),
  is_many_to_many: z.boolean(),
  disposition: z.enum([
    "derived",
    "infrastructure",
    "unplanned",
    "component",
    "nested_entity",
    "entity",
  ]),
  issue_codes: z.array(z.string()),
  canonical_findings: z.array(
    z.object({
      check: z.string(),
      status: z.string(),
      detail: z.unknown(),
    }),
  ),
});

export const plannerForeignKeySchema = z.object({
  conname: z.string(),
  source_schema: z.string(),
  source_table: z.string(),
  target_schema: z.string(),
  target_table: z.string(),
  source_columns: z.array(z.string()),
  target_columns: z.array(z.string()),
  source_token: nullableText,
  source_label: nullableText,
  target_token: nullableText,
  target_label: nullableText,
  access_effect: z.enum(["none", "composition", "containment"]),
  access_note: nullableText,
  is_plumbing: z.boolean(),
});

export const plannerAccessRelationshipSchema = z.object({
  child_type: z.string(),
  parent_type: z.string(),
  fk_column: z.string(),
  kind: z.enum(["composition", "containment"]),
  note: nullableText,
  child_schema: z.string(),
  child_table: z.string(),
  parent_schema: z.string(),
  parent_table: z.string(),
});

export const plannerAssociationSchema = z.object({
  source_type: z.string(),
  target_type: z.string(),
  label: nullableText,
  container_side: z.enum(["source", "target", "none"]),
  conveys_max: z.enum(["viewer", "editor", "none"]),
  is_active: z.boolean(),
  notes: nullableText,
  source_schema: z.string(),
  source_table: z.string(),
  source_label: z.string(),
  target_schema: z.string(),
  target_table: z.string(),
  target_label: z.string(),
});

export const accessPlannerSnapshotSchema = z.object({
  schema: z.string(),
  generated_at: z.string(),
  schemas: z.array(
    z.object({
      schema_name: z.string(),
      table_count: z.number(),
      planned_count: z.number(),
    }),
  ),
  tables: z.array(plannerTableSchema),
  foreign_keys: z.array(plannerForeignKeySchema),
  access_relationships: z.array(plannerAccessRelationshipSchema),
  association_rules: z.array(plannerAssociationSchema),
});

export type AccessPlannerSnapshot = z.infer<typeof accessPlannerSnapshotSchema>;
export type PlannerTable = z.infer<typeof plannerTableSchema>;
export type PlannerForeignKey = z.infer<typeof plannerForeignKeySchema>;

export const plannerTableId = (schemaName: string, tableName: string) =>
  `${schemaName}.${tableName}`;

export function parseAccessPlannerSnapshot(
  value: unknown,
): AccessPlannerSnapshot {
  return accessPlannerSnapshotSchema.parse(value);
}
