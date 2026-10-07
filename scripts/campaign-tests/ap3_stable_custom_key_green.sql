-- AP-3 — A CUSTOM FIELD'S KEY IS THE SAME FOR EVERY VIEWER (contract §0). GREEN probe, run 2026-10-07 after
-- migration ap3_a_custom_field_key_is_the_same_for_every_viewer. Expected verdict: every case ok=true.
--
-- THE USE CASE: Holloway Creative's contacts carry a "preferred_channel" custom field, and a second organization
-- the admin belongs to declares the same key. An Applet reads row._custom.preferred_channel; its code must work
-- whoever runs it.
-- RED (before, captured live 2026-10-07): admin@admin.com (two organizations declaring the key) got columns
-- preferred_channel@2643e470-… and preferred_channel@344cfaa8-…, and rows keyed preferred_channel@344cfaa8-…;
-- test@test.com (one organization) got plain preferred_channel. Cases A and B failed for the admin.
-- Each case is a rolled-back subtransaction (raise P0099 → caught); nothing persists.
do $probe$
declare
  c_org   constant uuid := '344cfaa8-2b0c-4971-854a-9694614816f2'; -- Holloway Creative
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd'; -- admin@admin.com
  c_test  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14'; -- test@test.com
  v_out jsonb := '[]'::jsonb;
  v_who uuid;
  v_cols jsonb; v_rows jsonb; v_id uuid; v_after jsonb;
begin
  foreach v_who in array array[c_admin, c_test] loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_who, 'role', 'authenticated')::text, true);
    -- A. the column list names preferred_channel once, plainly.
    begin
      perform set_config('role', 'authenticated', true);
      select jsonb_agg(c ->> 'key') into v_cols from jsonb_array_elements(platform.entity_columns(null, 'party') -> 'columns') c
       where c ->> 'origin' = 'custom';
      perform set_config('role', 'none', true);
      raise exception using errcode = 'P0099', message = jsonb_build_object('case', 'A columns', 'who', v_who, 'keys', v_cols,
        'ok', v_cols ? 'preferred_channel' and not exists (select 1 from jsonb_array_elements_text(v_cols) k where k like '%@%')
              and (select count(*) from jsonb_array_elements_text(v_cols) k where k = 'preferred_channel') = 1)::text;
    exception when sqlstate 'P0099' then v_out := v_out || sqlerrm::jsonb;
    end;
    -- B. every row's _custom is keyed plainly.
    begin
      perform set_config('role', 'authenticated', true);
      v_rows := platform.entity_list_scoped('party', jsonb_build_object('kind', 'all', 'organization_id', c_org),
                  null, null, null, null, null, null, null, null, null, null, 20, null, false, null) -> 'rows';
      perform set_config('role', 'none', true);
      raise exception using errcode = 'P0099', message = jsonb_build_object('case', 'B row keys', 'who', v_who,
        'ok', jsonb_array_length(v_rows) > 0 and not exists (select 1 from jsonb_array_elements(v_rows) r, jsonb_object_keys(r -> '_custom') k where k like '%@%')
              and not exists (select 1 from jsonb_array_elements(v_rows) r where not (r -> '_custom') ? 'preferred_channel'))::text;
    exception when sqlstate 'P0099' then v_out := v_out || sqlerrm::jsonb;
    end;
  end loop;
  -- C. a write by the plain key lands in the row's own organization's field, and reads back under the plain key.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  begin
    perform set_config('role', 'authenticated', true);
    v_id := (platform.entity_list_scoped('party', jsonb_build_object('kind', 'all', 'organization_id', c_org),
               null, null, null, null, null, null, null, null, null, null, 1, null, false, null) -> 'rows' -> 0 ->> 'id')::uuid;
    perform platform.entity_update('party', v_id, null, '{"_custom":{"preferred_channel":"phone"}}'::jsonb);
    v_after := platform.entity_get('party', array[v_id], null) -> 'rows' -> 0 -> '_custom';
    perform set_config('role', 'none', true);
    raise exception using errcode = 'P0099', message = jsonb_build_object('case', 'C plain-key write', 'custom', v_after,
      'ok', coalesce(v_after ->> 'preferred_channel' = 'phone', false))::text;
  exception when sqlstate 'P0099' then v_out := v_out || sqlerrm::jsonb;
  end;
  raise exception using errcode = 'P0098', message = jsonb_build_object('verdict',
    case when not exists (select 1 from jsonb_array_elements(v_out) c where not coalesce((c ->> 'ok')::boolean, false)) then 'ALL_OK' else 'FAIL' end,
    'cases', v_out)::text;
end $probe$;
