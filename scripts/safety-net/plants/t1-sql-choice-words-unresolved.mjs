// SN-T1 plant (2026-10-01): a typed choice word never finds its choice (the custom._resolve_choice_words trigger lets every write through untouched), rolled back with the suite
import { swapSql, atBeginSql, cleanSql, captureSql } from "./lib/t1-fn.mjs";
void swapSql; void atBeginSql; void cleanSql; void captureSql;
export default {
  id: "t1-sql-choice-words-unresolved",
  check: "tables.sql-choiceval_green",
  items: ["T17","T18"],
  description: "a typed choice word never finds its choice (the custom._resolve_choice_words trigger lets every write through untouched), rolled back with the suite",
  mode: "in-transaction",
  apply: atBeginSql("custom._resolve_choice_words()", "return new;"),
};
