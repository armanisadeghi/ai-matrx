// SN-T1 plant (2026-10-01): a type change converts no value, so nothing is set aside or brought back (custom._field_type_converts_values returns at once), rolled back with the suite
import { swapSql, atBeginSql, cleanSql, captureSql } from "./lib/t1-fn.mjs";
void swapSql; void atBeginSql; void cleanSql; void captureSql;
export default {
  id: "t1-sql-retype-converts-nothing-e",
  check: "tables.sql-databasics2_a_value_set_aside_comes_back",
  items: ["T26","T29"],
  description: "a type change converts no value, so nothing is set aside or brought back (custom._field_type_converts_values returns at once), rolled back with the suite",
  mode: "in-transaction",
  apply: atBeginSql("custom._field_type_converts_values()", "return null;"),
};
