// SN-T1 plant (2026-10-01): on the clone, for Cedar Ridge's "Home Exercise …" tables only, a column
// whose type changes LOSES every value it held (no conversion, nothing set aside, nothing to undo).
import { swapSql, captureManySql, cleanManySql, CEDAR, fixtureTable } from "./lib/t1-fn.mjs";

const CONVERT = "custom._field_type_converts_values()";
const ANCHOR = "  if v_key is null or v_table is null then\n    return null;\n  end if;\n";

export default {
  id: "t1-walk-retype-drops-values",
  check: "tables.walk-life",
  items: ["T26", "T29"],
  description: "a type change drops the column's values — nothing converted, nothing set aside, Undo has nothing to bring back (clone, Cedar Ridge 'Home Exercise …' tables only)",
  mode: "committed",
  captureRestore: captureManySql([CONVERT]),
  apply: swapSql(
    CONVERT,
    ANCHOR,
    `${ANCHOR}  if new.organization_id = '${CEDAR}'::uuid and ${fixtureTable("v_table")} then
    update custom.record x set data = case when x.data ? '_values' then (x.data - v_key) || jsonb_build_object('_values', (x.data -> '_values') - v_key) else x.data - v_key end
     where x.organization_id = new.organization_id and x.table_id = v_table and x.deleted_at is null and x.data ? v_key;
    return null;
  end if;
`,
  ),
  readback: cleanManySql([CONVERT]),
};
