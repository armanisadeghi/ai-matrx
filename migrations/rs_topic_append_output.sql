-- rs_topic_append_output — atomic append into rs_topic.outputs (JSONB).
--
-- Why this exists: the Research Outputs Studio generates several assets
-- (podcast, blog, slides, seo) that all live in the single `rs_topic.outputs`
-- JSONB column. A podcast render takes 8–12 minutes; meanwhile the user can
-- generate a blog/slides/seo. The old client-side read-modify-write
-- (parse(topic.outputs) -> append -> update whole column) clobbered any asset
-- added during that window because the late-finishing job wrote back a stale
-- snapshot. This RPC performs the read-modify-write inside the DB under a row
-- lock (`FOR UPDATE`), so concurrent appends serialize and never overwrite
-- each other.
--
-- SECURITY INVOKER (default): RLS on rs_topic still applies — a caller can
-- only append to a topic they're allowed to update.

create or replace function public.rs_topic_append_output(
  p_topic_id uuid,
  p_kind text,
  p_asset jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_outputs jsonb;
  v_assets jsonb;
  v_kind_obj jsonb;
  v_asset_id text;
begin
  if p_kind is null or p_kind = '' then
    raise exception 'p_kind is required';
  end if;
  if p_asset is null or jsonb_typeof(p_asset) <> 'object' then
    raise exception 'p_asset must be a JSON object';
  end if;

  -- Lock the row so concurrent appends serialize.
  select coalesce(outputs, '{}'::jsonb)
    into v_outputs
    from public.rs_topic
   where id = p_topic_id
     for update;

  if not found then
    raise exception 'rs_topic % not found', p_topic_id;
  end if;

  v_asset_id := p_asset->>'id';

  -- Existing assets for this kind, with any same-id entry removed (de-dupe).
  v_assets := coalesce(v_outputs -> p_kind -> 'assets', '[]'::jsonb);
  v_assets := (
    select coalesce(jsonb_agg(elem), '[]'::jsonb)
      from jsonb_array_elements(v_assets) elem
     where v_asset_id is null
        or elem->>'id' is distinct from v_asset_id
  );

  -- Prepend the new asset (newest first).
  v_assets := jsonb_build_array(p_asset) || v_assets;

  -- Build the kind object then set it with a SINGLE-LEVEL path. A two-level
  -- `jsonb_set(v_outputs, '{kind,assets}', …, true)` SILENTLY NO-OPS when the
  -- `kind` key doesn't already exist (Postgres jsonb_set never creates missing
  -- intermediate parents) — that dropped the first blog/slides asset every time
  -- (seo/podcast only survived because their keys pre-existed). Setting the
  -- whole kind object via the one-level path `{kind}` does create it. Preserve
  -- any other fields already under the kind by merging onto the existing object.
  v_kind_obj := coalesce(v_outputs -> p_kind, '{}'::jsonb);
  v_kind_obj := jsonb_set(v_kind_obj, array['assets'], v_assets, true);
  v_outputs := jsonb_set(v_outputs, array[p_kind], v_kind_obj, true);

  update public.rs_topic set outputs = v_outputs where id = p_topic_id;

  return v_outputs;
end;
$$;
