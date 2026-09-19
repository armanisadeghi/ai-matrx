-- chair-step: switch-checklist step 5, and only step 5. Adding `custom` to `pgrst.db_schemas` is what lets PostgREST ROUTE to the store's already-granted doors; it grants nothing and revokes nothing. Measured on this database before writing this file: `authenticated` holds SELECT or INSERT on ZERO of the tables in schema `custom` and EXECUTE on 22 of its 255 functions — the registered doors. So exposure makes exactly those 22 doors callable over HTTP and no table readable, which is the whole design (`platform.client_callable_door`). The declaration row in `platform.schema_client_exposure` is DELIBERATELY LEFT CLOSED: flipping it would make `iam.apply_table_grants` issue table privileges to client roles on the next provision into `custom`, which is the raw table access DOOR-N-1 forbids. A person reads the four statements below before they run.
--
-- W6-EXT — THE DOORS ARE REACHABLE FROM A BROWSER.
--
-- WHY THIS FILE EXISTS. Contract row CUT-N-11 says the Chrome extension's record
-- read and write paths resolve through the new store, proven on one real turn.
-- The first real turn (2026-09-18, admin@admin.com, headless Chrome, the built
-- extension unpacked) answered:
--
--   PGRST106  "Invalid schema: custom. Only the following schemas are exposed:
--              api, public, graphql_public, rag, … commerce"
--
-- Every client — this extension, the desktop app (`W6-LOCAL`), the web app —
-- reaches the database through PostgREST. `custom` was not in
-- `authenticator`'s `pgrst.db_schemas`, so NO client could call ANY door of the
-- record store, however correctly it was written and however open the store's
-- knob was for its organization. That is the wall behind `C-28`, `C-29` and
-- `C-30` at once, and it is one line of configuration.
--
-- THE SECOND HALF: `custom.store_is_open(uuid)` — the switch itself — had no
-- EXECUTE grant for `authenticated`. Every client must ask the store whether it
-- is open before it does anything (that is the campaign's OFF switch, and the
-- reason a closed store answers a sentence instead of data). A switch a client
-- cannot read is a switch that reads as "off" for a reason nobody can print,
-- which is the silent failure the platform's fourth law forbids. So it is
-- granted AND declared in `platform.client_callable_door` beside the other
-- doors, with its reason, rather than granted quietly.
--
-- WHAT THIS FILE DOES NOT DO: it does not open the schema to table access, does
-- not touch `platform.schema_client_exposure`, does not change any knob, and
-- does not widen any organization's reach. The store stays switched off at
-- platform scope; it is on for exactly one organization, by an override row
-- another lane wrote.
--
-- THE INVERSE: `migrations/inverse/w6_ext_the_doors_are_reachable_from_a_browser_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── 1. the switch is readable by the clients it governs ───────────────────────
grant execute on function custom.store_is_open(uuid) to authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
values (
  'custom', 'store_is_open', 'p_organization_id', array['uuid'::regtype::oid],
  true, false,
  'migrations/campaign/w6_ext_the_doors_are_reachable_from_a_browser.sql (lane W6-EXT)',
  'THE OFF SWITCH, asked by the client it governs. Every client — the Chrome extension, the desktop app, the web app — must ask whether the record store is open for the organization it is acting in BEFORE it calls any other door, so that a closed store produces a sentence a person can act on instead of an empty screen. It answers one boolean about a knob (`platform.feature_knob` custom/system_enabled, resolved for the organization) and reads no record, no Table and no Field; a caller who is not a member of the organization learns only whether a feature is on, which is not that organization''s data. Declared by lane W6-EXT after the extension''s first real browser turn could not read the switch it is required to obey.')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- ── 2. PostgREST may route to the schema the doors live in ───────────────────
-- The list is production's own, read from `pg_db_role_setting` and re-stated
-- here with `custom` appended: an `alter role … set` replaces the value whole,
-- so the existing schemas are named rather than assumed.
alter role authenticator set pgrst.db_schemas =
  'api,public,graphql_public,rag,scraper,workflow,files,legal,knowledge,agent,ai,app,chat,context,skill,tool,workspace,work,admin,billing,browser,canvas,code,communication,content_ir,crm,dictionary,docproc,education,extend,graveyard,growth,hindsight,history,iam,interview,marketing,media,meta,ops,pdf,plan,platform,podcast,research,runtime,scheduler,seo,transcripts,ui,users,web,workbench,assignment,audit,batch,mandate,commerce,custom';

-- ── 3. and is told to re-read its configuration ──────────────────────────────
notify pgrst, 'reload config';
