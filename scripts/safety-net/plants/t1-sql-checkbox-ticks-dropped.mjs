// SN-T1 plant (2026-10-01): a tick box's answer never lands — custom.record_write drops every true/false
// from the document it is given (rolled back with the suite).
import { atBeginSql } from "./lib/t1-fn.mjs";
export default {
  id: "t1-sql-checkbox-ticks-dropped",
  check: "tables.sql-checkbox_green",
  items: ["T16"],
  description: "a tick box's answer never lands: custom.record_write drops every true / false it is given, rolled back with the suite",
  mode: "in-transaction",
  apply: atBeginSql(
    "custom.record_write(uuid,uuid,jsonb)",
    "p_data := coalesce((select jsonb_object_agg(k, v) from jsonb_each(p_data) e(k, v) where jsonb_typeof(v) <> 'boolean'), '{}'::jsonb);",
  ),
};
