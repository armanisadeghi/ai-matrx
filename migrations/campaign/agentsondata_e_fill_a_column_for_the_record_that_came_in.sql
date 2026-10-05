-- lane: AGENTS-ON-DATA
-- based-on: custom.enrich_due(uuid, uuid, integer, boolean) dbc0c199594f2a1133a1e960d8077854468f68acedd2d5fca6ca3939131536db
-- chair-step: the old 4-argument custom.enrich_due is DROPPED and re-created with a fifth, optional argument (same body + one narrowing filter); every 4-argument caller resolves to it through the default; the door registration moves to the new identity in the same transaction
--
-- AGENTS-ON-DATA item 5 — "fill a column with AI" for the record that triggered a workflow.
-- custom.enrich_due takes p_record_ids: when given, only those records are considered (still narrowed
-- by organization, visibility, pinning and freshness exactly as before).

set local statement_timeout = '60s';

drop function custom.enrich_due(uuid, uuid, integer, boolean);

CREATE FUNCTION custom.enrich_due(p_organization_id uuid, p_field_id uuid, p_limit integer DEFAULT 50, p_include_fresh boolean DEFAULT false, p_record_ids uuid[] DEFAULT NULL::uuid[])
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
  v_mask   jsonb;
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
  -- READ-MASK-ONCE: the columns this caller may read are the one mask's answer.
  v_mask := custom.read_mask_for(v_me, p_organization_id, v_table, coalesce(v_level, 'viewer'::public.permission_level), 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_seen
    from jsonb_array_elements(v_mask -> 'visible') x;
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
         -- ONE FRESHNESS CEILING. This used to derive the age and the sentence here, which
         -- made it the THIRD copy of the same rule after `custom.context_resolve` and the
         -- merge resolver; `pnpm check:one-freshness-ceiling` is what found it.
         case when (r.data -> '_values' -> v_key ->> 'at') is null then 'never filled in'
              else coalesce(
                     custom.freshness_verdict(
                       nullif(r.data -> '_values' -> v_key ->> 'at', '')::timestamptz,
                       v_every * 86400) ->> 'stale_note',
                     'inside the freshness this column declares') end,
         case when p_limit is not null and p_limit > v_ceil then v_ceil end
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = v_table
     and r.deleted_at is null
     and r.data_class = 'record'
     and r.id in (select v from custom.query_visible_ids(p_organization_id, v_table) v)
     -- ONE RECORD, NOT THE BACKLOG (AGENTS-ON-DATA item 5): a workflow step that fills the column for
     -- the record that just came in from a form names it, so it is never behind older empty rows.
     and (p_record_ids is null or r.id = any (p_record_ids))
     -- A CELL A PERSON PINNED IS NOT WORK. It is somebody's decision, and the run never
     -- sees it at all — not as a row it then skips, which is one bug away from overwriting.
     and not coalesce((r.data -> '_values' -> v_key ->> 'pinned')::boolean, false)
     and (p_include_fresh
          or (r.data -> '_values' -> v_key ->> 'at') is null
          -- The SAME verdict that writes the sentence above decides whether the row is work,
          -- so a row can never be listed as due with a reason that says it is fresh.
          or (custom.freshness_verdict(
                nullif(r.data -> '_values' -> v_key ->> 'at', '')::timestamptz,
                v_every * 86400) ->> 'freshness') = 'stale')
   order by (r.data -> '_values' -> v_key ->> 'at') nulls first, r.created_at
   limit v_take;
end;
$function$;
grant execute on function custom.enrich_due(uuid, uuid, integer, boolean, uuid[]) to authenticated;

update platform.client_callable_door
   set identity_args = 'p_organization_id uuid, p_field_id uuid, p_limit integer, p_include_fresh boolean, p_record_ids uuid[]',
       identity_argtypes = array[2950, 2950, 23, 16, 2951]::oid[],
       argument_rules = jsonb_set(argument_rules, '{arguments,p_record_ids}', jsonb_build_object(
         'type', 'uuid[]',
         'check', 'NARROWING ONLY. Each id is compared with r.id beside organization_id = p_organization_id, the table, and custom.query_visible_ids for this caller; an id of another organization, an invisible row or an invented id simply matches nothing.',
         'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-10-04 lane AGENTS-ON-DATA — read from this body'))
 where schema_name = 'custom' and function_name = 'enrich_due';
