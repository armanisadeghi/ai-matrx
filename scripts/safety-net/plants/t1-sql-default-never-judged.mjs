// SN-T1 plant (2026-10-01): a column's default is stored unjudged (custom._field_default_fitted returns its input), rolled back with the suite
import { swapSql, atBeginSql, cleanSql, captureSql } from "./lib/t1-fn.mjs";
void swapSql; void atBeginSql; void cleanSql; void captureSql;
export default {
  id: "t1-sql-default-never-judged",
  check: "tables.sql-databasics2_a_default_fits_its_column",
  items: ["T25"],
  description: "a column's default is stored unjudged (custom._field_default_fitted returns its input), rolled back with the suite",
  mode: "in-transaction",
  apply: atBeginSql("custom._field_default_fitted(uuid,jsonb)", "return p_doc;"),
};
