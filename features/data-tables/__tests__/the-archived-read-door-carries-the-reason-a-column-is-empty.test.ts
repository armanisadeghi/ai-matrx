// THE ARCHIVED READ DOOR CARRIES `_errors` LIKE EVERY SIBLING (lane NIGHT-SMALL, 2026-10-06).
// custom.read_records_archived built its document with custom.record_values_of, which has no
// `_errors`, so an archived row's "#ERROR" cell lost its reason. The siblings ask
// custom.record_values_step. This pins the migration that makes the door do the same, and its inverse.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const NAME = "nightsmall_the_archived_read_door_carries_the_reason_a_column_is_empty";
const root = join(__dirname, "..", "..", "..", "migrations");
const up = readFileSync(join(root, "campaign", `${NAME}.sql`), "utf8");
const down = readFileSync(join(root, "inverse", `${NAME}_down.sql`), "utf8");
const code = (sql: string) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("custom.read_records_archived and _errors", () => {
  it("builds each archived document through record_values_step, never record_values_of", () => {
    expect(code(up)).toContain("custom.record_values_step(q.rr)");
    expect(code(up)).not.toContain("custom.record_values_of(");
  });
  it("is additive: one function body, same signature, no grants or DDL on tables", () => {
    expect(code(up).match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(code(up)).toMatch(/read_records_archived\(p_organization_id uuid, p_table_id uuid, p_lane text DEFAULT 'org'::text, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0\)/);
    expect(code(up)).not.toMatch(/\b(grant|revoke|alter table|drop)\b/i);
  });
  it("declares the body it was based on", () => {
    expect(up).toMatch(/^-- based-on: custom\.read_records_archived\(.*\) [0-9a-f]{64}$/m);
  });
  it("has an inverse that restores record_values_of", () => {
    expect(code(down)).toContain("custom.record_values_of(q.rr)");
    expect(code(down)).not.toContain("record_values_step");
  });
});
