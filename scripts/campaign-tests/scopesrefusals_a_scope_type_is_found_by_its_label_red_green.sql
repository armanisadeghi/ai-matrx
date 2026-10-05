-- LANE 9 SCOPES-ON-THE-STORE — A SCOPE TYPE IS FOUND IN SEARCH BY ITS LABEL, NOT ITS SLUG, measured RED then GREEN on
-- the dev clone (migrations/campaign/scopesrefusals_a_scope_type_is_found_by_its_label.sql).
--
-- THE USE CASE. Harbor Point Veterinary Group tracks its patients' owners as a scope type "Clients" (singular "Client").
-- A front-desk lead types "Clients" into search and expects the scope type to be listed under that name; before this
-- file the index held its slug ("clients-2026") because the three writers of the index (the store's change-feed twin,
-- the older table's search trigger and the canonical reindex) all titled a scope type with its slug.
--
-- THE BREAK THIS CATCHES: any one of the three writers titling a scope type with its slug (or a stale label after a
-- rename). WHAT MUST HOLD, each in its own run of the writers:
--   T1  a type made through the door is indexed as its plural label ("Clients"), not "clients-2026"
--   T2  a rename of the plural label re-titles it ("Pet Owners")
--   T3  the canonical reindex (platform.search_item_backfill('scope_type', ...)) keeps the label after the index row was
--       set back to the slug by hand inside this rolled-back transaction (so the reindex, not luck, produces the title)
--   T4  the older table's search trigger (an update to context.scope_types.label_plural) re-titles the row too
--   T5  a type with no plural label falls back to its singular label, then to its slug
-- RED before the migration (T1: title is the slug); GREEN after. Rolled back; nothing of anyone's survives.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesrefusals_a_scope_type_is_found_by_its_label_red_green.sql'
\set expect 'clone'
\set requires 'function:custom.context_type_write|function:platform.search_item_backfill'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '240s';

do $suite$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_cedar constant uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';   -- Cedar Ridge Physical Therapy
  v_type uuid; v_t2 uuid; v_title text; v_after uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/scopesrefusals', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_type := (custom.context_type_write(c_cedar, null, '{"label_singular":"Client","label_plural":"Clients","slug":"clients-2026"}'::jsonb) -> 'row' ->> 'id')::uuid;

  -- ══ T1 ══
  perform set_config('role', 'none', true);
  select title into v_title from platform.search_item where entity_token = 'scope_type' and entity_id = v_type;
  if v_title is distinct from 'Clients' then
    raise exception 'T1 RED: the new scope type is indexed as [%], not as its label [Clients]', v_title;
  end if;

  -- ══ T2 ══
  perform set_config('role', 'authenticated', true);
  perform custom.context_type_write(c_cedar, v_type, '{"label_singular":"Pet Owner","label_plural":"Pet Owners"}'::jsonb);
  perform set_config('role', 'none', true);
  select title into v_title from platform.search_item where entity_token = 'scope_type' and entity_id = v_type;
  if v_title is distinct from 'Pet Owners' then
    raise exception 'T2 RED: after the rename the scope type is indexed as [%], not [Pet Owners]', v_title;
  end if;

  -- ══ T3: the canonical reindex ══
  update platform.search_item set title = 'clients-2026', title_norm = 'clients 2026' where entity_token = 'scope_type' and entity_id = v_type;
  select id into v_after from context.scope_types where id < v_type order by id desc limit 1;
  perform platform.search_item_backfill('scope_type', v_after, 20000);
  select title into v_title from platform.search_item where entity_token = 'scope_type' and entity_id = v_type;
  if v_title is distinct from 'Pet Owners' then
    raise exception 'T3 RED: the reindex titles the scope type [%], not its label [Pet Owners]', v_title;
  end if;

  -- ══ T4: the older table's trigger ══
  update context.scope_types set label_plural = 'Animal Owners' where id = v_type;
  select title into v_title from platform.search_item where entity_token = 'scope_type' and entity_id = v_type;
  if v_title is distinct from 'Animal Owners' then
    raise exception 'T4 RED: after an update of the older row the scope type is indexed as [%], not [Animal Owners]', v_title;
  end if;

  -- ══ T5: fallbacks ══
  perform set_config('role', 'authenticated', true);
  v_t2 := (custom.context_type_write(c_cedar, null, '{"label_singular":"Referral Source","label_plural":" ","slug":"referral-sources"}'::jsonb) -> 'row' ->> 'id')::uuid;
  perform set_config('role', 'none', true);
  select title into v_title from platform.search_item where entity_token = 'scope_type' and entity_id = v_t2;
  if v_title is distinct from 'Referral Source' then
    raise exception 'T5 RED: a type with a singular label only is indexed as [%], not its label [Referral Source]', v_title;
  end if;

  raise notice 'GREEN T1-T5: a scope type is indexed by its label through the door, a rename, the reindex and the older table''s trigger.';
end
$suite$;

rollback;
