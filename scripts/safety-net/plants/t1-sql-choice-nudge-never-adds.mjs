// SN-T1 plant (2026-10-01): the organization's choice nudge always answers never_add (custom.choice_nudge), rolled back with the suite
import { swapSql, atBeginSql, cleanSql, captureSql } from "./lib/t1-fn.mjs";
void swapSql; void atBeginSql; void cleanSql; void captureSql;
export default {
  id: "t1-sql-choice-nudge-never-adds",
  check: "tables.sql-choicecolumnedit_green",
  items: ["T09","T23"],
  description: "the organization's choice nudge always answers never_add (custom.choice_nudge), rolled back with the suite",
  mode: "in-transaction",
  apply: atBeginSql("custom.choice_nudge(uuid)", "return 'never_add';"),
};
