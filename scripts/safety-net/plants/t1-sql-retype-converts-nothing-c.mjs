// SN-T1 plant (2026-10-01): a type change converts no value (custom._field_type_converts_values returns at once), rolled back with the suite
import { swapSql, atBeginSql, cleanSql, captureSql } from "./lib/t1-fn.mjs";
void swapSql; void atBeginSql; void cleanSql; void captureSql;
export default {
  id: "t1-sql-retype-converts-nothing-c",
  check: "tables.sql-databasics2_a_list_of_words_becomes_several_choices",
  items: ["T26"],
  description: "a type change converts no value (custom._field_type_converts_values returns at once), rolled back with the suite",
  mode: "in-transaction",
  apply: atBeginSql("custom._field_type_converts_values()", "return null;"),
};
