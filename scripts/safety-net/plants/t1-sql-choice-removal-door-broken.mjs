// SN-T1 plant (2026-10-01): the door that removes a used choice and moves its records is broken (custom.field_update_rehoming_choices refuses at once), rolled back with the suite
import { swapSql, atBeginSql, cleanSql, captureSql } from "./lib/t1-fn.mjs";
void swapSql; void atBeginSql; void cleanSql; void captureSql;
export default {
  id: "t1-sql-choice-removal-door-broken",
  check: "tables.sql-choicetails_green",
  items: ["T09","T29"],
  description: "the door that removes a used choice and moves its records is broken (custom.field_update_rehoming_choices refuses at once), rolled back with the suite",
  mode: "in-transaction",
  apply: atBeginSql("custom.field_update_rehoming_choices(uuid,uuid,jsonb,jsonb,jsonb)", "raise exception 'SN-T1 PLANT: the choice removal door is broken';"),
};
