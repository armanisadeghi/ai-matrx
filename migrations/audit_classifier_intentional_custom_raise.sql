-- based-on: audit.classify_broken_function(oid, text, text, text) a5be8368912dd023581f1993d47e15dd5160145410fecf7b25769f9daf2bbc03
-- audit_classifier_intentional_custom_raise.sql
--
-- FALSE-POSITIVE class in audit.classify_broken_function(): a function's OWN
-- deliberate refusal reported as breakage. On 2026-10-06, 35 of the "real"
-- findings were the canonical entity door (platform.entity_get / entity_insert /
-- entity_update / entity_list_scoped / _entity_trash_or_restore) answering with
-- their designed messages under the platform's custom SQLSTATE class MX
-- ("Listing records needs a signed-in person." MX003, "Choose the organization
-- this new record belongs to." MX002, …). Each code and each message is written
-- in the function's own body.
--
-- Rule: an error is suppressed as `intentional_raise` only when ALL hold:
--   * its SQLSTATE is NOT in any class Postgres itself defines (00-5Z, F0, HV,
--     P0, XX) — i.e. a code only a RAISE ... USING ERRCODE could have produced;
--   * that exact code appears in the function body; and
--   * the message text (up to its first % placeholder, 25 chars) appears in the
--     function body.
-- A Postgres-raised error (42P01, 42883, 55000, …) is never touched by this rule.
--
-- Blast radius: audit.refresh_static / audit.function_broken_live / refresh_log
-- counts only (same as every classifier change). No client or server caller.
-- The live body is patched in place at a count-asserted anchor.

do $patch$
declare
  v_def    text;
  v_anchor text := E'  v_def := pg_get_functiondef(p_func_oid);\n';
  v_ins    text := $ins$
  -- A deliberate RAISE with a platform-defined (non-Postgres) SQLSTATE whose code
  -- and message are both written in this function's own body.
  if coalesce(p_sqlstate, '') ~ '^[0-9A-Z]{5}$'
     and p_sqlstate !~ '^([0-5][0-9A-Z]|F0|HV|P0|XX)'
     and strpos(v_def, p_sqlstate) > 0
     and length(btrim(left(split_part(coalesce(p_message, ''), '%', 1), 25))) >= 8
     and strpos(v_def, left(split_part(p_message, '%', 1), 25)) > 0 then
    return query select 'suppressed'::text, 'intentional_raise'::text; return;
  end if;

$ins$;
  v_n integer;
begin
  v_def := pg_get_functiondef('audit.classify_broken_function(oid,text,text,text)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then raise exception 'anchor found % times, expected 1', v_n; end if;
  execute replace(v_def, v_anchor, v_anchor || v_ins);
end $patch$;

do $assert$
declare
  v_sev text; v_reason text;
  v_probe oid := 'audit.refresh_log_recount()'::regprocedure::oid;
  v_door  oid := 'platform.entity_insert(text,uuid,jsonb)'::regprocedure::oid;
begin
  -- the designed refusal is suppressed
  select severity, suppression_reason into v_sev, v_reason from audit.classify_broken_function(
    v_door, 'error', 'MX002', 'Choose the organization this new record belongs to.');
  if v_sev is distinct from 'suppressed' or v_reason is distinct from 'intentional_raise' then
    raise exception 'designed refusal classified % / %', v_sev, v_reason;
  end if;
  -- a custom code whose message is NOT in the body stays real
  select severity into v_sev from audit.classify_broken_function(
    v_door, 'error', 'MX002', 'Some message this body never writes anywhere.');
  if v_sev is distinct from 'real' then raise exception 'foreign message classified %', v_sev; end if;
  -- a Postgres-defined code stays real even with a matching message
  select severity into v_sev from audit.classify_broken_function(
    v_door, 'error', '42P01', 'Choose the organization this new record belongs to.');
  if v_sev is distinct from 'real' then raise exception 'Postgres code classified %', v_sev; end if;
  -- a function that never mentions the code stays real
  select severity into v_sev from audit.classify_broken_function(
    v_probe, 'error', 'MX002', 'Choose the organization this new record belongs to.');
  if v_sev is distinct from 'real' then raise exception 'unrelated function classified %', v_sev; end if;
end $assert$;
