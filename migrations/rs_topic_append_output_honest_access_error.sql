-- rs_topic_append_output: stop asserting "not found" for what is usually an
-- access denial, and refuse to report success on a zero-row write.
--
-- D167. The function is SECURITY INVOKER by design — RLS is the authority and
-- that is correct (never add a second security layer here). But that means its
-- `select … for update` returns zero rows for FOUR different reasons (row is
-- gone, row is soft-deleted, the caller's access does not reach it, the id is
-- wrong), and the old text picked the one answer that is definitely wrong when
-- the user can SEE the topic on screen: "rs_topic % not found".
--
-- An invoker function cannot distinguish those cases without probing with
-- elevated rights, so it does not try. It raises an honest, ambiguous error
-- under a stable errcode (P0002) and the client resolves the true state
-- through <AccessGate token="research_topic" id/> — the surface that already
-- exists for exactly this.
--
-- Also hardened: the UPDATE now checks its own row count. Previously a write
-- that matched zero rows returned the new `outputs` value to the caller as
-- though it had been persisted — a silent data-loss shape on a paid run.

create or replace function public.rs_topic_append_output(
  p_topic_id uuid,
  p_kind text,
  p_asset jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  v_outputs jsonb;
  v_assets jsonb;
  v_kind_obj jsonb;
  v_asset_id text;
  v_updated int;
begin
  if p_kind is null or p_kind = '' then
    raise exception 'p_kind is required';
  end if;
  if p_asset is null or jsonb_typeof(p_asset) <> 'object' then
    raise exception 'p_asset must be a JSON object';
  end if;

  select coalesce(outputs, '{}'::jsonb) into v_outputs
  from research.rs_topic
  where id = p_topic_id
  for update;

  if not found then
    -- Honest ambiguity. Do NOT assert deletion or non-existence: under RLS this
    -- branch fires for a denied reader looking at a topic they can plainly see.
    raise exception
      'research topic % is not available to this account — it may not exist, or your access may not reach it',
      p_topic_id
      using errcode = 'P0002';
  end if;

  v_asset_id := p_asset->>'id';
  v_assets := coalesce(v_outputs -> p_kind -> 'assets', '[]'::jsonb);
  v_assets := (
    select coalesce(jsonb_agg(elem), '[]'::jsonb)
    from jsonb_array_elements(v_assets) elem
    where v_asset_id is null or elem->>'id' is distinct from v_asset_id
  );
  v_assets := jsonb_build_array(p_asset) || v_assets;

  v_kind_obj := coalesce(v_outputs -> p_kind, '{}'::jsonb);
  v_kind_obj := jsonb_set(v_kind_obj, array['assets'], v_assets, true);
  v_outputs := jsonb_set(v_outputs, array[p_kind], v_kind_obj, true);

  update research.rs_topic set outputs = v_outputs where id = p_topic_id;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    -- Loud recovery: the lock succeeded but the write matched nothing. Never
    -- hand back an `outputs` value the caller will treat as persisted.
    raise exception
      'research topic % could not be saved (write matched zero rows)', p_topic_id
      using errcode = 'P0002';
  end if;

  return v_outputs;
end;
$function$;
