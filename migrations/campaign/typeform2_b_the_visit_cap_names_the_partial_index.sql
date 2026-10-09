-- lane: TYPEFORM-2
-- lock: custom
-- based-on: custom.form_visit_admit(uuid, text) f178abd6c2aa91e1958188a0985677e9840e6e73e06451065b0aa7285836d397
--
-- LANE TYPEFORM-2, part b. custom.anon_hit's unique index is PARTIAL (where deleted_at is null), so
-- an ON CONFLICT naming its columns must carry the same predicate; part a's body did not and every
-- call refused with 42P10. Replaces only custom.form_visit_admit (added by part a, same lane).
-- Inverse: re-apply part a's body is not needed; the inverse of part a drops the function.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

create or replace function custom.form_visit_admit(p_form_id uuid, p_bucket text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f     custom.anon_form;
  v_cap   integer;
  v_start timestamptz := date_trunc('minute', now());
  v_hits  integer;
begin
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then return true; end if;   -- form_visit ignores it anyway; nothing to count
  v_cap := coalesce((platform.knob_resolve('forms', 'visit_rate_per_minute', v_f.organization_id) #>> '{}')::integer, 60);
  insert into custom.anon_hit (organization_id, form_id, token_id, bucket, window_start, hits)
  values (v_f.organization_id, v_f.id, null, 'visit:' || left(coalesce(nullif(btrim(p_bucket), ''), 'anonymous'), 200), v_start, 1)
  on conflict (organization_id, form_id, bucket, window_start) where deleted_at is null
    do update set hits = custom.anon_hit.hits + 1
  returning hits into v_hits;
  return v_hits <= v_cap;
end;
$fn$;
