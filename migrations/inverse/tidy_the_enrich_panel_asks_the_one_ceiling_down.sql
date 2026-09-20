-- INVERSE of migrations/campaign/tidy_the_enrich_panel_asks_the_one_ceiling.sql
-- Restores the third copy of the freshness ceiling inside custom.enrich_due — the bytes
-- the forward file's `-- based-on:` line hashes. It exists because an inverse that cannot
-- be executed is not an inverse; running it makes `pnpm check:one-freshness-ceiling` go red
-- again, which is exactly what it is for.

set lock_timeout = '3s';
set statement_timeout = '2min';

CREATE OR REPLACE FUNCTION custom.enrich_due(p_organization_id uuid, p_field_id uuid, p_limit integer DEFAULT 50, p_include_fresh boolean DEFAULT false)
 RETURNS TABLE(record_id uuid, title text, inputs jsonb, current_value jsonb, written_at timestamp with time zone, reason text, trimmed_to integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := auth.uid();
  v_table  uuid;
  v_key    text;
  v_every  integer;
  v_cfg    jsonb;
  v_inputs text[];
  v_seen   text[];
  v_k      text;
  v_ceil   integer;
  v_take   integer;
  v_cap    numeric;
  v_spent  numeric;
  v_level  public.permission_level;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.enrich_due');

  select (f.data ->> 'entity_definition_id')::uuid, f.data ->> 'key',
         nullif(f.data ->> 'review_interval_days', '')::integer,
         coalesce(f.data -> 'source_config', '{}'::jsonb)
    into v_table, v_key, v_every, v_cfg
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'source' = 'agent';
  if v_table is null then
    raise exception 'There is no column here that a model fills in.'
      using errcode = '23503',
            hint = 'Either that field id belongs to another organization, or nobody has set an enrichment up on it yet — custom.enrich_declare does that.';
  end if;

  perform custom.assert_may_know_table(p_organization_id, v_table, 'custom.enrich_due');

  -- ── THE COST REFUSAL, asked BEFORE any work is handed out rather than after the money
  -- is spent. The figure and the cap are both said, because "there was nothing to do" and
  -- "you have spent your budget" look identical from a screen otherwise.
  v_cap := coalesce((platform.knob_resolve('custom', 'enrichment_cost_cap_cents', p_organization_id) #>> '{}')::numeric, 2000);
  select coalesce(sum(coalesce((x.data ->> 'cost_cents')::numeric, 0)), 0) into v_spent
    from custom.record x
   where x.organization_id = p_organization_id
     and x.table_id = custom.organization_kernel_id()
     and x.data_class = custom.enrich_run_class()
     and x.deleted_at is null
     and x.created_at >= date_trunc('month', now());
  if v_spent >= v_cap then
    raise exception 'This organization has spent % cents on filling columns in this month, and its budget is % cents, so nothing more was started.',
                    round(v_spent, 2), v_cap
      using errcode = '53400',
            hint = 'The budget is custom/enrichment_cost_cap_cents and an organization may change it. It resets on the first of the month. Nothing was written and nothing was charged.';
  end if;

  -- ── THE RATE REFUSAL. One run takes at most the organization's ceiling, and when the ask
  -- was larger every row says what it was trimmed to, so a scheduled pass over a big Table
  -- walks it in bounded batches instead of one unbounded sweep.
  v_ceil := coalesce((platform.knob_resolve('custom', 'enrichment_batch_ceiling', p_organization_id) #>> '{}')::integer, 200);
  v_take := least(greatest(coalesce(p_limit, 50), 1), v_ceil);

  -- ── FIELD-LEVEL SECURITY IS NOT SUSPENDED FOR AN AGENT (DOOR-5 / AGT-N-4). The run reads
  -- exactly what the operating person may read. An input this caller cannot see is refused
  -- BY NAME rather than quietly dropped, because an instruction that silently loses one of
  -- its inputs answers confidently out of half a record.
  select coalesce(array_agg(value), '{}'::text[]) into v_inputs
    from jsonb_array_elements_text(coalesce(v_cfg -> 'inputs', '[]'::jsonb));
  v_level := custom.my_level(p_organization_id, v_table, 'table');
  select coalesce(array_agg(f.field_key), '{}'::text[]) into v_seen
    from iam.visible_field_ids(v_me, p_organization_id, v_table, coalesce(v_level, 'viewer'::public.permission_level), 'read') f;
  foreach v_k in array (v_inputs || v_key) loop
    if not (v_k = any (v_seen)) then
      raise exception 'You cannot see the column "%", so this enrichment cannot be run by you.', v_k
        using errcode = '42501',
              hint = 'AGT-N-4: an agent reads exactly what the person operating it may read, never more. Ask somebody who holds that column to run it, or have it shared with you.';
    end if;
  end loop;

  return query
  select r.id,
         coalesce(nullif(r.data ->> 'title', ''), r.id::text),
         coalesce((select jsonb_object_agg(k, r.data -> k)
                     from unnest(v_inputs) k), '{}'::jsonb),
         r.data -> v_key,
         nullif(r.data -> '_values' -> v_key ->> 'at', '')::timestamptz,
         case when (r.data -> '_values' -> v_key ->> 'at') is null then 'never filled in'
              else format('past its freshness date — written %s days ago and looked at again every %s',
                          round(extract(epoch from (now() - (r.data -> '_values' -> v_key ->> 'at')::timestamptz)) / 86400.0),
                          coalesce(v_every::text || ' days', 'never')) end,
         case when p_limit is not null and p_limit > v_ceil then v_ceil end
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = v_table
     and r.deleted_at is null
     and r.data_class = 'record'
     and r.id in (select v from custom.query_visible_ids(p_organization_id, v_table) v)
     -- A CELL A PERSON PINNED IS NOT WORK. It is somebody's decision, and the run never
     -- sees it at all — not as a row it then skips, which is one bug away from overwriting.
     and not coalesce((r.data -> '_values' -> v_key ->> 'pinned')::boolean, false)
     and (p_include_fresh
          or (r.data -> '_values' -> v_key ->> 'at') is null
          or (v_every is not null
              and (r.data -> '_values' -> v_key ->> 'at')::timestamptz + make_interval(days => v_every) < now()))
   order by (r.data -> '_values' -> v_key ->> 'at') nulls first, r.created_at
   limit v_take;
end;
$function$

;
