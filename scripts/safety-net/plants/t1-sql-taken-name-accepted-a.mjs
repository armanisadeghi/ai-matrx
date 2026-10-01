// SN-T1 plant (2026-10-01): a column name another column carries is only noticed, never refused (field_declare / field_update), rolled back with the suite
import { swapSql, atBeginSql, cleanSql, captureSql } from "./lib/t1-fn.mjs";
void swapSql; void atBeginSql; void cleanSql; void captureSql;
export default {
  id: "t1-sql-taken-name-accepted-a",
  check: "tables.sql-databasics_two_columns_never_carry_the_same_name",
  items: ["T05","T06"],
  description: "a column name another column carries is only noticed, never refused (field_declare / field_update), rolled back with the suite",
  mode: "in-transaction",
  apply: [swapSql("custom.field_declare(uuid,uuid,jsonb)", "raise exception 'You already have a column called", "raise notice 'You already have a column called"), swapSql("custom.field_update(uuid,uuid,jsonb)", "raise exception 'You already have a column called", "raise notice 'You already have a column called")].join("\n"),
};
