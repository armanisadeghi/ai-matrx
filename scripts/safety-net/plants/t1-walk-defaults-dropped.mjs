// SN-T1 plant (2026-10-01): on the clone, for Cedar Ridge's "Home Exercise …" tables only, a column's
// default is dropped when the column is made or changed, and a new record is never filled from one.
import { swapSql, atBeginSql, captureManySql, cleanManySql, CEDAR, fixtureTable } from "./lib/t1-fn.mjs";

const DECLARE = "custom.field_declare(uuid,uuid,jsonb)";
const UPDATE = "custom.field_update(uuid,uuid,jsonb)";
const FILL = "custom._record_defaults_filled(uuid,uuid,jsonb)";
const SIGS = [DECLARE, UPDATE, FILL];

export default {
  id: "t1-walk-defaults-dropped",
  check: "tables.walk-life",
  items: ["T25"],
  description: "a column's default is dropped and never fills a new record (clone, Cedar Ridge 'Home Exercise …' tables only)",
  mode: "committed",
  captureRestore: captureManySql(SIGS),
  apply: [
    swapSql(
      DECLARE,
      "v_doc := custom._field_default_fitted(p_organization_id, v_doc);",
      `v_doc := custom._field_default_fitted(p_organization_id, v_doc); if p_organization_id = '${CEDAR}'::uuid and ${fixtureTable("p_table_id")} then v_doc := v_doc - 'default'; end if;`,
    ),
    swapSql(
      UPDATE,
      "v_next := custom._field_default_fitted(p_organization_id, v_next);",
      `v_next := custom._field_default_fitted(p_organization_id, v_next); if p_organization_id = '${CEDAR}'::uuid and ${fixtureTable("nullif(v_next ->> 'entity_definition_id', '')::uuid")} then v_next := v_next - 'default'; end if;`,
    ),
    atBeginSql(FILL, `if p_organization_id = '${CEDAR}'::uuid and ${fixtureTable("p_table_id")} then return case when p_data is not null and jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end; end if;`),
  ].join("\n"),
  readback: cleanManySql(SIGS),
};
