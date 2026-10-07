-- based-on: audit.classify_broken_function(oid, text, text, text) 82d8328d713302dee7eb9c99fdeb16d129f9f0221e58d8ca87ac7f4f1bc68f62
-- audit_classifier_checker_timeout_is_unchecked.sql
--
-- When plpgsql_check itself hits the statement timeout while ANALYSING a function
-- (SQLSTATE 57014, "canceling statement due to statement timeout"), the function
-- was never checked. Recording that as severity 'real' put custom.field_restore on
-- the broken list on 2026-10-06 although nothing about it was found wrong. It is
-- now 'unchecked', the same verdict a checker failure already gets elsewhere
-- (audit.function_broken_live returns false when the checker falls over). A
-- runtime probe (level runtime_error) that times out is decided earlier and stays real.
-- Live body patched in place at a count-asserted anchor.

do $patch$
declare
  v_def    text;
  v_anchor text := E'  v_def := pg_get_functiondef(p_func_oid);\n';
  v_ins    text := E'  -- the checker timed out while analysing: nothing was checked\n'
                || E'  if p_sqlstate = ''57014'' then\n'
                || E'    return query select ''unchecked''::text, ''checker_timeout''::text; return;\n'
                || E'  end if;\n\n';
  v_n integer;
begin
  v_def := pg_get_functiondef('audit.classify_broken_function(oid,text,text,text)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then raise exception 'anchor found % times, expected 1', v_n; end if;
  execute replace(v_def, v_anchor, v_ins || v_anchor);
end $patch$;

do $assert$
declare v_sev text; v_probe oid := 'audit.refresh_log_recount()'::regprocedure::oid;
begin
  select severity into v_sev from audit.classify_broken_function(v_probe, 'error', '57014', 'canceling statement due to statement timeout');
  if v_sev is distinct from 'unchecked' then raise exception 'checker timeout classified %', v_sev; end if;
  select severity into v_sev from audit.classify_broken_function(v_probe, 'runtime_error', '57014', 'canceling statement due to statement timeout');
  if v_sev is distinct from 'real' then raise exception 'runtime-probe timeout classified %', v_sev; end if;
  select severity into v_sev from audit.classify_broken_function(v_probe, 'error', '42P10', 'there is no unique or exclusion constraint matching the ON CONFLICT specification');
  if v_sev is distinct from 'real' then raise exception 'REGRESSION: 42P10 classified %', v_sev; end if;
end $assert$;
