// SN-T1 plant (2026-10-01): an archive under way never says so (table_archive answers in_progress false), rolled back with the suite
import { swapSql, atBeginSql, cleanSql, captureSql } from "./lib/t1-fn.mjs";
void swapSql; void atBeginSql; void cleanSql; void captureSql;
export default {
  id: "t1-sql-archive-never-in-progress",
  check: "tables.sql-databasics2_an_archive_under_way_says_so",
  items: ["T03"],
  description: "an archive under way never says so (table_archive answers in_progress false), rolled back with the suite",
  mode: "in-transaction",
  apply: swapSql("custom.table_archive(uuid,uuid,integer,boolean)", "'in_progress', v_open,", "'in_progress', false,"),
};
