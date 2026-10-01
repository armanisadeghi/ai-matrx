// SN-T1 plant helpers (2026-10-01): SQL that rewrites ONE function body on the clone, read from the
// live definition (pg_get_functiondef) so nothing is copied by hand. Every rewrite carries the
// marker "SN-T1 PLANT" and refuses to run when its anchor is not found (a plant that silently does
// nothing would prove nothing).
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Replace the first `from` with `to` in the body of `sig`. */
export function swapSql(sig, from, to) {
  return `do $sn_t1$
declare d text := pg_get_functiondef(${lit(sig)}::regprocedure);
begin
  if position(${lit(from)} in d) = 0 then raise exception 'SN-T1 PLANT: anchor not found in %', ${lit(sig)}; end if;
  d := regexp_replace(d, '\\$function\\$', '$function$ -- SN-T1 PLANT', '');
  d := overlay(d placing ${lit(to)} from position(${lit(from)} in d) for length(${lit(from)}));
  execute d;
end $sn_t1$;`;
}

/** Put `stmt` as the first statement of `sig`'s body (right after its top-level begin). */
export function atBeginSql(sig, stmt) {
  return `do $sn_t1$
declare
  d text := pg_get_functiondef(${lit(sig)}::regprocedure);
  n text;
begin
  n := regexp_replace(d, '\\nbegin\\n', E'\\nbegin\\n  ' || ${lit(stmt)} || E' -- SN-T1 PLANT\\n', 'i');
  if n = d then raise exception 'SN-T1 PLANT: no top-level begin in %', ${lit(sig)}; end if;
  execute n;
end $sn_t1$;`;
}

/** Prints t when `sig` carries no SN-T1 marker (the committed plants' readback). */
export function cleanSql(sig) {
  return `select position('SN-T1 PLANT' in pg_get_functiondef(${lit(sig)}::regprocedure)) = 0;`;
}
export const captureSql = (sig) => `select pg_get_functiondef(${lit(sig)}::regprocedure);`;

/** The restore of several functions at once: their definitions as they are now, ';'-separated. */
export const captureManySql = (sigs) =>
  `select string_agg(pg_get_functiondef(x::regprocedure), E';\\n') from unnest(array[${sigs.map(lit).join(", ")}]) x;`;
/** Prints t when none of `sigs` carries the SN-T1 marker. */
export const cleanManySql = (sigs) =>
  `select bool_and(position('SN-T1 PLANT' in pg_get_functiondef(x::regprocedure)) = 0) from unnest(array[${sigs.map(lit).join(", ")}]) x;`;
/** The walk's fixture: Cedar Ridge Physical Therapy, a table this walk made ("Home Exercise …"). */
export const CEDAR = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
export const fixtureTable = (idExpr) =>
  `exists (select 1 from custom.record t where t.id = ${idExpr} and t.table_id = custom.table_kernel_id() and t.organization_id = '${CEDAR}'::uuid and t.data ->> 'name' like 'Home Exercise %')`;
