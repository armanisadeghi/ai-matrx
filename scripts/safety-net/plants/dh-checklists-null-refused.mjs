// The checklist door refuses "no organization" again (the B4-02 defect: a red 400 on every data-home visit).
export default {
  id: "dh-checklists-null-refused",
  check: "datahome.sql-checklists-all-orgs",
  items: ["D01", "D02"],
  description: "custom.checklist_runs(null, …) is refused with the old 'a door that took null' sentence (in the suite's own transaction)",
  mode: "in-transaction",
  apply: `do $p$ declare d text; begin
  d := pg_get_functiondef('custom.checklist_runs(uuid,uuid,uuid,boolean,integer)'::regprocedure);
  d := regexp_replace(d, E'\\nbegin\\n', E'\\nbegin\\n  if p_organization_id is null then raise exception ''A door that took null would be a door onto every organization at once'' using errcode = ''22023''; end if;\\n');
  execute d;
end $p$;`,
};
