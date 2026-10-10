import { open, q } from "./_dd4_lib.mts";
import { writeFileSync } from "node:fs";
const c = await open();
const names = ["custom_record_choice_words","custom_record_containment_guard","custom_record_dated_values_guard","custom_record_field_shape_guard","custom_record_field_shape_guard_class","custom_record_field_type_parity_guard","custom_record_field_validation","custom_record_merge_field_shape_guard","custom_record_merge_field_temporal_guard","custom_record_organization_wall","custom_record_rule_shape_guard","custom_record_rule_topology_guard","custom_record_rule_uses","custom_record_table_shape_guard","custom_record_zz_derived_fields","zz_promoted_field_cap","zz_w3_work_shape_guard","zzzz_a_undeclared_key_guard","zzzz_unique_rule_holds","_value_envelope","custom_record_field_type_converts_values"];
const WHEN = `(new.data_class IS DISTINCT FROM 'record'::text OR old.data_class IS DISTINCT FROM new.data_class OR old.data IS DISTINCT FROM new.data OR old.table_id IS DISTINCT FROM new.table_id OR old.organization_id IS DISTINCT FROM new.organization_id OR old.metadata IS DISTINCT FROM new.metadata OR old.custom_fields IS DISTINCT FROM new.custom_fields OR old.visibility IS DISTINCT FROM new.visibility)`;
const defs: Record<string,string> = {};
for (const n of names) {
  const r = await q(c, `select pg_get_triggerdef(oid) d, tgenabled from pg_trigger where tgrelid='custom.record'::regclass and tgname=$1 and not tgisinternal`, [n]);
  if (r.length !== 1 || r[0].tgenabled !== "O") throw new Error("trigger " + n + " " + JSON.stringify(r));
  defs[n] = r[0].d;
}
const parts: string[][] = [names.slice(0, 7), names.slice(7, 14), names.slice(14)];
const out: any[] = [];
parts.forEach((grp, gi) => {
  const letter = ["b1","b2","b3"][gi];
  let up = "", down = "";
  for (const n of grp) {
    const d = defs[n];
    const m = d.match(/^CREATE TRIGGER (\S+) (BEFORE|AFTER) (INSERT OR UPDATE|UPDATE) ON custom\.record FOR EACH ROW EXECUTE FUNCTION (.+)$/);
    if (!m) throw new Error("unexpected def: " + d);
    const [, , timing, events, fn] = m;
    up += `-- ${n}\nDROP TRIGGER "${n}" ON custom.record;\n`;
    if (events === "INSERT OR UPDATE") up += `CREATE TRIGGER "${n}!i" ${timing} INSERT ON custom.record FOR EACH ROW EXECUTE FUNCTION ${fn};\n`;
    up += `CREATE TRIGGER "${n}" ${timing} UPDATE ON custom.record FOR EACH ROW WHEN ${WHEN} EXECUTE FUNCTION ${fn};\n\n`;
    down += `DROP TRIGGER IF EXISTS "${n}!i" ON custom.record;\nDROP TRIGGER "${n}" ON custom.record;\n${d};\n\n`;
  }
  out.push({ letter, grp, up, down });
});
writeFileSync("/private/tmp/claude-501/dd4/gen_b.json", JSON.stringify(out));
console.log(out.map(o => o.letter + ":" + o.grp.length).join(" "));
await c.end();
