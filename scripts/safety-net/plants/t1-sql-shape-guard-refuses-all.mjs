// SN-T1 plant (2026-10-01): the field shape guard refuses every field row write, a retired column's included, rolled back with the suite
import { swapSql, atBeginSql, cleanSql, captureSql } from "./lib/t1-fn.mjs";
void swapSql; void atBeginSql; void cleanSql; void captureSql;
export default {
  id: "t1-sql-shape-guard-refuses-all",
  check: "tables.sql-databasics_a_retired_column_row_can_still_be_written",
  items: ["T07"],
  description: "the field shape guard refuses every field row write, a retired column's included, rolled back with the suite",
  mode: "in-transaction",
  apply: atBeginSql("custom._field_shape_guard()", "raise exception 'SN-T1 PLANT: the field shape guard refuses this write';"),
};
