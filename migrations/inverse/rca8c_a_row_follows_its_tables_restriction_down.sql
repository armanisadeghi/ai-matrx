-- chair-step: rehearsal inverse of rca8c — the org-admin arm reads the record's own visibility again; drops platform.held_by_its_organization.
-- Inverse of migrations/rca8c_a_row_follows_its_tables_restriction.sql (rehearsal only).

set local lock_timeout = '2s';

do $patch$
declare
  v_def text := pg_get_functiondef('public.access_denied_context(text,uuid)'::regprocedure);
  v_anchor text := $a$              -- RC-A8 L1: the container's visibility wins (a row of a personal Table is personal)
              and platform.held_by_its_organization(v_meta.token, p_id)
$a$;
  v_repl text := $a$              and v_attrs.o_vis is distinct from 'personal'::platform.visibility
$a$;
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'rca8c inverse: anchor occurs % time(s), expected 1', v_n;
  end if;
  execute replace(v_def, v_anchor, v_repl);
end
$patch$;

drop function platform.held_by_its_organization(text, uuid, integer);
