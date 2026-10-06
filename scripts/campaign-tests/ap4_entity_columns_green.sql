-- AP-4 — platform.entity_columns ANSWERS CONTRACTS §0 Column[] FOR A PLATFORM TYPE, READ AS THE CALLER.
--
-- THE USE CASE (no fake data): Oak Street Studio, a design studio whose contacts live in the CRM
-- (party). Its owner (admin@admin.com) added a "Preferred channel" choice field to contacts
-- (Email / Phone / Text message); Dana Ruiz prefers a text message. An app built on the data doors
-- asks for the contact columns once and must get one honest list: the platform's own columns, the
-- studio's custom field with its choices, each saying where it comes from.
-- Elfrieda Weber (persona factory, tagged test_fixture) runs her own organization and has no tie to
-- the studio.
--
-- 1 · the owner, asking from ANOTHER organization's context (Cedar Ridge — the active organization
--     never narrows a read), gets "Preferred channel" as origin custom, keyed by its store key, with
--     its field id, its organization and its three choices; and platform columns as origin platform
--     (display_name writable, id read-only). Every column carries key/label/type/origin/required/
--     readOnly; no platform key starts with "_".
-- 2 · THE KEY IS THE STORE'S: Dana's record read (custom.entity_record_read) carries her value under
--     custom[col.key] — the same key a write's p_custom takes.
-- 3 · THE CLASS FIX IS IN THE ONE DESCRIBER: platform.drill_describe (api: true) — the Table API's
--     door — now carries the same choices on the custom column.
-- 4 · A SECOND ORGANIZATION'S MEMBER SEES NONE OF THE STUDIO'S CUSTOM COLUMNS: Elfrieda asking in
--     her own organization gets no column of the studio's, and asking in the studio's name is refused.
--
-- RED TWIN: ap4_entity_columns_red.sql takes the choices back out of platform._drill_resolve inside
-- its own rolled-back transaction and requires clause 1's choices to be missing. Ends in ROLLBACK.

\set suite 'ap4_entity_columns_green.sql'
\set requires 'function:platform.entity_columns|function:platform.drill_describe|relation:custom.record'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  c_owner    uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com, studio owner
  c_outsider uuid := 'c62de98e-46e2-4bc4-bfe3-8b19e7909e32';  -- elfrieda.weber.859b00@fixtures.aimatrx.com
  c_outsider_org uuid := '92f75c84-3df2-4b36-b570-01c4d170b470'; -- Elfrieda's Org
  c_studio   uuid := '2643e470-b275-47f3-95f3-ae275ad3ca47';  -- Oak Street Studio
  c_other    uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';  -- Cedar Ridge Physical Therapy (owner is a member)
  c_field    uuid := '2e39664c-91bf-4eea-8de7-2736189bbd54';  -- party field "Preferred channel"
  c_dana     uuid := '686f46e7-74d4-48df-8e54-aff77a22114e';  -- contact, prefers a text message
  v_boss     text := current_user;
  v_res      jsonb; v_col jsonb; v_n int; v_rec jsonb;
begin
  perform set_config('app.actor_system', 'campaign.ap4_entity_columns_suite', true);
  if exists (select 1 from iam.memberships m where m.user_id = c_outsider and m.organization_id = c_studio) then
    raise exception '0: the outsider holds a membership in the studio, so clause 4 would test nothing';
  end if;

  -- ══ 1 · THE OWNER, FROM ANOTHER ORGANIZATION'S CONTEXT ═══════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_res := platform.entity_columns(c_other, 'party');
  if v_res ->> 'token' <> 'party' or nullif(v_res ->> 'label', '') is null then
    raise exception '1: the answer names no token or label: %', v_res - 'columns';
  end if;
  select c into v_col from jsonb_array_elements(v_res -> 'columns') c where c ->> 'field_id' = c_field::text;
  if v_col is null
     or v_col ->> 'origin' <> 'custom' or v_col ->> 'key' <> 'preferred_channel'
     or v_col ->> 'label' <> 'Preferred channel' or v_col ->> 'type' <> 'choice'
     or (v_col ->> 'organization_id')::uuid <> c_studio
     or (v_col ->> 'readOnly')::boolean or (v_col ->> 'required')::boolean is null then
    raise exception '1: "Preferred channel" should be a writable custom choice column keyed preferred_channel, saw %', v_col;
  end if;
  if jsonb_typeof(v_col -> 'choices') is distinct from 'array'
     or not (v_col -> 'choices') @> '["Email", "Phone", "Text message"]'::jsonb then
    raise exception '1: "Preferred channel" should carry its words Email / Phone / Text message, saw %', v_col -> 'choices';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_res -> 'columns') c
                  where c ->> 'key' = 'display_name' and c ->> 'origin' = 'platform' and not (c ->> 'readOnly')::boolean)
     or not exists (select 1 from jsonb_array_elements(v_res -> 'columns') c
                     where c ->> 'key' = 'id' and c ->> 'origin' = 'platform' and (c ->> 'readOnly')::boolean) then
    raise exception '1: display_name (writable) and id (read-only) should be platform columns';
  end if;
  select count(*) into v_n from jsonb_array_elements(v_res -> 'columns') c
   where not (c ? 'key' and c ? 'label' and c ? 'type' and c ? 'origin' and c ? 'required' and c ? 'readOnly')
      or c ->> 'origin' not in ('platform', 'custom')
      or (c ->> 'origin' = 'platform' and left(c ->> 'key', 1) = '_');
  if v_n <> 0 then
    raise exception '1: % column(s) break the Column shape', v_n;
  end if;

  -- ══ 2 · THE KEY IS THE STORE'S ═══════════════════════════════════════════════════════════════
  v_rec := custom.entity_record_read(c_studio, 'party', c_dana);
  if v_rec -> 'custom' ->> (v_col ->> 'key') is distinct from 'text_message' then
    raise exception '2: Dana''s record does not carry her value under custom[%]: %', v_col ->> 'key', v_rec -> 'custom';
  end if;

  -- ══ 3 · THE ONE DESCRIBER CARRIES THE CHOICES ═══════════════════════════════════════════════
  select c into v_col
    from jsonb_array_elements(platform.drill_describe(c_studio, '{"kind":"entity","token":"party","api":true}'::jsonb) -> 'api' -> 'columns') c
   where c ->> 'api_name' = 'cf:' || c_field;
  if not coalesce((v_col -> 'choices') @> '["Text message"]'::jsonb, false) then
    raise exception '3: drill_describe''s custom column carries no choices: %', v_col;
  end if;

  -- ══ 4 · A SECOND ORGANIZATION'S MEMBER ══════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', c_outsider::text, 'role', 'authenticated')::text, true);
  v_res := platform.entity_columns(c_outsider_org, 'party');
  select count(*) into v_n from jsonb_array_elements(v_res -> 'columns') c
   where c ->> 'organization_id' = c_studio::text or c ->> 'field_id' = c_field::text or c ->> 'key' = 'preferred_channel';
  if v_n <> 0 or jsonb_array_length(v_res -> 'columns') = 0 then
    raise exception '4a: the outsider should see the platform columns and none of the studio''s (% of the studio''s seen, % columns)', v_n, jsonb_array_length(v_res -> 'columns');
  end if;
  begin
    perform platform.entity_columns(c_studio, 'party');
    raise exception '4b: the outsider asked in the studio''s name and was not refused';
  exception when insufficient_privilege then null;
  end;

  perform set_config('role', v_boss, true);
  raise notice 'ap4_entity_columns_green: all clauses passed — Preferred channel is custom with its three words, platform columns are platform, the key is the store''s, drill_describe carries the words, an outsider sees none of it';
end $$;

rollback;
