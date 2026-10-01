// SN-T1 plant (2026-10-01): a typed word answered Add saves nothing (custom.record_update_adding_choices returns 0 at once), rolled back with the suite
import { swapSql, atBeginSql, cleanSql, captureSql } from "./lib/t1-fn.mjs";
void swapSql; void atBeginSql; void cleanSql; void captureSql;
export default {
  id: "t1-sql-adding-choices-saves-nothing",
  check: "tables.sql-choicecolumnedit_b_green",
  items: ["T05","T23"],
  description: "a typed word answered Add saves nothing (custom.record_update_adding_choices returns 0 at once), rolled back with the suite",
  mode: "in-transaction",
  apply: atBeginSql("custom.record_update_adding_choices(uuid,uuid,jsonb,jsonb,integer)", "return 0;"),
};
