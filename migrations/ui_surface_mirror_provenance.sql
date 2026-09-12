-- Provenance on the four surface MIRROR tables (WP5, mirror hygiene).
--
-- WHY.
-- The four `ui.ui_surface_*` mirrors are projections of code manifests, and a
-- row that outlives its manifest is indistinguishable from a row a sibling
-- branch synced ten minutes ago: both read as "DB has it, code doesn't". The
-- drift report can now show a row's AGE, which separates old from fresh — but
-- age alone never answers WHOSE row it is or WHERE it came from, which is the
-- question an admin actually has to answer before deleting anything on a
-- shared checkout with dozens of concurrent agents.
--
-- These two columns record that, written by the ONE sync path
-- (`applyManifestSync`, and its SQL twin `scripts/emit-surface-sync-sql.ts`):
--
--   synced_by    the auth user whose session ran the sync (the super admin who
--                clicked, since the endpoint is super-admin gated). NULL for a
--                row written by the SQL emitter or seeded by a migration —
--                there is no session there, and NULL says exactly that rather
--                than inventing an actor.
--   synced_from  where the sync ran: "manifest-sync:api:<build id>" for the
--                admin endpoint, "manifest-sync:sql:<git sha>" for the emitter.
--                Both name the CHANNEL and the best build identity that channel
--                can truthfully prove; when it can prove none it says so in the
--                value ("local", "sha-unknown") instead of omitting the field.
--
-- No FK to `auth.users`: a mirror row must survive the deletion of the admin
-- who synced it, and losing the provenance (ON DELETE SET NULL) or the row
-- (CASCADE) would both be worse than a dangling id. Both columns are NULL on
-- every pre-existing row and stay NULL until that row is next synced — the
-- honest reading, since nothing recorded who wrote them.

alter table ui.ui_surface_value
  add column if not exists synced_by uuid,
  add column if not exists synced_from text;

alter table ui.ui_surface_agent_role
  add column if not exists synced_by uuid,
  add column if not exists synced_from text;

alter table ui.ui_surface_write_target
  add column if not exists synced_by uuid,
  add column if not exists synced_from text;

alter table ui.ui_surface_client_tool
  add column if not exists synced_by uuid,
  add column if not exists synced_from text;

comment on column ui.ui_surface_value.synced_by is
  'auth.users id of the super admin whose session ran the manifest sync that last wrote this row. NULL = written without a session (SQL emitter, migration seed) or never re-synced since provenance existed. No FK on purpose: the row outlives the user.';
comment on column ui.ui_surface_value.synced_from is
  'Channel + build identity of the sync that last wrote this row: "manifest-sync:api:<build>" or "manifest-sync:sql:<git sha>". Names what the channel could truthfully prove; never omitted, never guessed.';

comment on column ui.ui_surface_agent_role.synced_by is
  'auth.users id of the super admin whose session ran the manifest sync that last wrote this row. NULL = written without a session (SQL emitter, migration seed) or never re-synced since provenance existed. No FK on purpose: the row outlives the user.';
comment on column ui.ui_surface_agent_role.synced_from is
  'Channel + build identity of the sync that last wrote this row: "manifest-sync:api:<build>" or "manifest-sync:sql:<git sha>". Names what the channel could truthfully prove; never omitted, never guessed.';

comment on column ui.ui_surface_write_target.synced_by is
  'auth.users id of the super admin whose session ran the manifest sync that last wrote this row. NULL = written without a session (SQL emitter, migration seed) or never re-synced since provenance existed. No FK on purpose: the row outlives the user.';
comment on column ui.ui_surface_write_target.synced_from is
  'Channel + build identity of the sync that last wrote this row: "manifest-sync:api:<build>" or "manifest-sync:sql:<git sha>". Names what the channel could truthfully prove; never omitted, never guessed.';

comment on column ui.ui_surface_client_tool.synced_by is
  'auth.users id of the super admin whose session ran the manifest sync that last wrote this row. NULL = written without a session (SQL emitter, migration seed) or never re-synced since provenance existed. No FK on purpose: the row outlives the user.';
comment on column ui.ui_surface_client_tool.synced_from is
  'Channel + build identity of the sync that last wrote this row: "manifest-sync:api:<build>" or "manifest-sync:sql:<git sha>". Names what the channel could truthfully prove; never omitted, never guessed.';

-- The mirrors are world-readable (`grant select on <table> to anon, authenticated`
-- already covers every column, new ones included) and super-admin-write, so the
-- new columns inherit the existing access shape with no policy change. Stated
-- rather than assumed: a column added to an RLS table with column-level grants
-- would NOT be readable, and these tables deliberately have none.

notify pgrst, 'reload schema';
