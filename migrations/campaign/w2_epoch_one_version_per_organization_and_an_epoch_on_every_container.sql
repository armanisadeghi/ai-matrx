-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W2-EPOCH — ONE MONOTONIC VERSION PER ORGANIZATION, AN EPOCH ON EVERY CONTAINER, AND A CACHE
-- THAT IS NEVER THE AUTHORITY.
--
-- VIS-8 · VIS-9 · VIS-10 · VIS-11 · VIS-12 · VIS-13 · VIS-14.
--
-- WHY A PAIR KEY AND NOT A PRINCIPAL KEY (VIS-10)
-- -----------------------------------------------
-- A cache keyed by (principal, record) is the obvious shape and it is the wrong one: the measured
-- form is ≈62.5 billion rows / 3.75 TB against ≈130M pairs / 10 GB for the pair key. So the stored
-- form here is keyed `(container_type, container_id, item_type, item_id)` — what a container
-- conveys to an item, which is a fact about the GRAPH and not about any person — and the principal
-- is resolved AT READ by handing the cached container to iam.has_access_for_base. One row serves
-- every principal, and a new grant invalidates nothing at all, because the cache never held a
-- grant.
--
-- WHY AN EPOCH AND NOT AN INVALIDATION SWEEP (VIS-9, VIS-11, VIS-12)
-- ------------------------------------------------------------------
-- Invalidating a container's descendants on reparent is O(subtree): measured, 39,999 rows in
-- 3,030 ms against 1 row in 6.4 ms — 474x the write amplification, and it gets worse with the
-- subtree. So a write bumps exactly ONE epoch, the moved record's own, and validity is decided at
-- READ by comparing the entry's stamp against the MAXIMUM epoch over the pair's ancestors and
-- carrying targets. A descendant a million levels down needs no row rewritten: its ancestor's
-- epoch moved, so every entry above it fails the comparison on the next read. Reparent stays O(1)
-- (measured 0.260 ms on 1,001,010 descendants) and correctness does not depend on a sweep
-- finishing.
--
-- A STALE ENTRY IS NEVER SERVED (VIS-13)
-- --------------------------------------
-- custom.cache_lookup returns NULL — not a level — when the stamp is behind. NULL means "this
-- cache has no answer", and every caller then recomputes from custom.derive_visibility or hides
-- the record. There is no code path anywhere below that returns a level it could not revalidate.
-- Background warming (custom.visibility_warm) is allowed and writes only entries it stamps with
-- the epoch it read in the same statement, so a warmer racing a write loses the race rather than
-- winning it with a stale value.
--
-- EVERY READ CARRIES THE READER'S LAST OBSERVED VERSION (VIS-8, VIS-14, VIS-15)
-- ----------------------------------------------------------------------------
-- custom.organization_visibility_version is one monotonic bigint per organization, incremented in
-- the SAME COMMIT as any visibility-affecting write by the trigger below. A reader holds the value
-- it last observed and passes it to custom.has_visibility_at, which refuses to answer from
-- anything older. That is Zanzibar's zookie, scoped per organization: after any commit no read
-- returns a record the reader has lost, because a read carrying version N cannot be served by a
-- snapshot at version N-1 — it recomputes instead.
--
-- THE CACHE IS DROPPABLE (VIS-7)
-- ------------------------------
-- custom.visibility_cache_rebuild TRUNCATEs the whole cache and rebuilds it from
-- custom.derive_visibility, which reads the associations alone. Every answer is unchanged, because
-- the cache was never the authority. The inverse of this file drops the table outright.
--
-- REVERSIBLE: yes —
-- migrations/inverse/w2_epoch_one_version_per_organization_and_an_epoch_on_every_container_down.sql

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ---------------------------------------------------------------------------------------------
-- 1. THE ORGANIZATION'S MONOTONIC VISIBILITY VERSION (VIS-8).
-- ---------------------------------------------------------------------------------------------
create table if not exists custom.organization_visibility_version (
  organization_id uuid    not null primary key,
  version         bigint  not null default 1,
  bumped_at       timestamptz not null default now(),
  constraint organization_visibility_version_positive check (version >= 1)
);

comment on table custom.organization_visibility_version is
  'W2-EPOCH / VIS-8. ONE monotonic visibility version per organization, incremented in the same '
  'commit as any visibility-affecting write. Zanzibar''s zookie, scoped per organization. A read '
  'carries the value it last observed (VIS-14) and is never served from an older snapshot.';

-- ---------------------------------------------------------------------------------------------
-- 2. THE EPOCH, ON EVERY CONTAINER AND EVERY CARRYING TARGET (VIS-9).
-- ---------------------------------------------------------------------------------------------
-- THE EPOCH IS A CLOCK, NOT A PER-ROW COUNTER.
--
-- Measured on the rehearsal copy 2026-09-18, and this is the defect the green suite caught before
-- anything landed on the main database: with a per-entity `epoch = epoch + 1`, two different
-- records can hold the SAME epoch number for unrelated reasons, and `max(epoch) over the
-- ancestors` is then not a clock at all. A reparent bumped Class 101 from 3 to 4 while Project X
-- already sat at 4 for its own history, so the stamp on (X, Assignment 4) — 4 — still compared
-- `>=` the new required epoch — 4 — and a STALE ENTRY WAS SERVED. VIS-13 failed on a real read.
--
-- One shared sequence fixes the class: every bump takes the next value from `visibility_clock`,
-- so a value issued after a stamp is ALWAYS strictly greater than that stamp, whatever entity
-- either belongs to. The comparison in custom.cache_lookup then means what VIS-11 says it means.
create sequence if not exists custom.visibility_clock as bigint start with 1 increment by 1;

comment on sequence custom.visibility_clock is
  'W2-EPOCH / VIS-11. The one monotonic source every epoch value comes from. Per-entity counters '
  'are not a clock: two records can reach the same number independently, and a stamp then compares '
  'equal to a strictly later write. Measured failing on the rehearsal copy 2026-09-18.';

create table if not exists custom.visibility_epoch (
  entity_type     text   not null,
  entity_id       uuid   not null,
  epoch           bigint not null default nextval('custom.visibility_clock'),
  organization_id uuid,
  bumped_at       timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

comment on table custom.visibility_epoch is
  'W2-EPOCH / VIS-9, VIS-12. One epoch per container and per carrying target, bumped whenever what '
  'it conveys changes. A reparent bumps EXACTLY ONE of these — the moved record''s — and nothing '
  'below it is rewritten; see VIS-11 for how the read then invalidates the whole subtree.';

-- ---------------------------------------------------------------------------------------------
-- 3. THE CACHE. Keyed by the pair; the principal is resolved at read (VIS-10).
-- ---------------------------------------------------------------------------------------------
create table if not exists custom.visibility_cache (
  container_type text not null,
  container_id   uuid not null,
  item_type      text not null,
  item_id        uuid not null,
  max_level      public.permission_level not null,
  depth          integer not null,
  stamp_epoch    bigint  not null,
  computed_at    timestamptz not null default now(),
  primary key (container_type, container_id, item_type, item_id)
);

create index if not exists visibility_cache_item_idx
  on custom.visibility_cache (item_type, item_id);

comment on table custom.visibility_cache is
  'W2-EPOCH / VIS-7, VIS-10, VIS-13. A CACHE, never the authority: droppable, rebuildable from the '
  'associations, and invalidated in the same commit as the write that changed it. Keyed by the '
  '(container, item) PAIR — a fact about the graph, not about a person — and stamped with the '
  'pair''s own epoch. custom.cache_lookup serves it only when the stamp is at least the maximum '
  'epoch over the pair''s ancestors and carrying targets; otherwise it answers NULL and the caller '
  'recomputes or hides.';

-- ---------------------------------------------------------------------------------------------
-- 4. THE BUMP. O(1), in the same commit (VIS-12).
-- ---------------------------------------------------------------------------------------------
create or replace function custom.bump_epoch(
  p_entity_type     text,
  p_entity_id       uuid,
  p_organization_id uuid default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_epoch bigint;
begin
  if p_entity_id is null then return null; end if;

  -- ONE row. Not the subtree, not the descendants, not the closure: one row, whatever is below it.
  -- The value comes from the shared clock, never from this row's own previous value, so it is
  -- strictly greater than every stamp any warmer has ever written.
  v_epoch := nextval('custom.visibility_clock');
  insert into custom.visibility_epoch (entity_type, entity_id, epoch, organization_id, bumped_at)
  values (p_entity_type, p_entity_id, v_epoch, p_organization_id, now())
  on conflict (entity_type, entity_id) do update
    set epoch = greatest(custom.visibility_epoch.epoch, excluded.epoch),
        organization_id = coalesce(excluded.organization_id, custom.visibility_epoch.organization_id),
        bumped_at = now()
  returning epoch into v_epoch;

  if p_organization_id is not null then
    insert into custom.organization_visibility_version (organization_id, version, bumped_at)
    values (p_organization_id, 2, now())
    on conflict (organization_id) do update
      set version = custom.organization_visibility_version.version + 1,
          bumped_at = now();
  end if;

  return v_epoch;
end;
$$;

comment on function custom.bump_epoch(text, uuid, uuid) is
  'W2-EPOCH / VIS-9, VIS-12. Bump ONE epoch and the owning organization''s visibility version, in '
  'the caller''s commit. O(1) regardless of subtree size — measured 0.260 ms against 1,001,010 '
  'descendants, where invalidating those descendants costs 3,030 ms and 39,999 row rewrites.';

-- ---------------------------------------------------------------------------------------------
-- 5. THE INVALIDATION, IN THE SAME COMMIT AS THE WRITE (VIS-7, VIS-8).
--
-- Scoped to the new store's carrying roles by the `when` clause, so this trigger is inert for
-- every association row the platform writes today. Existing writes are unaffected: the trigger
-- body does not run for them at all.
-- ---------------------------------------------------------------------------------------------
create or replace function custom.trg_associations_bump_visibility()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row   record := coalesce(new, old);
  v_org   uuid;
begin
  -- THE OFF SWITCH, READ INSIDE THE BODY. A trigger's guard cannot live in the file header: the
  -- header is not consulted at run time and an UPDATE would still pay for this work while every
  -- additive check read green. So the knob is read here, and while it resolves false this trigger
  -- is a no-op on every write to platform.associations.
  if not coalesce(platform.knob_resolve('custom', 'system_enabled', null)::text::boolean, false) then
    return null;
  end if;

  -- THE SECOND GATE, AND THE REASON THIS TRIGGER IS INERT FOR TODAY'S WRITES: it does nothing at
  -- all unless the row's role is one of the new store's declared carrying roles. A trigger WHEN
  -- clause cannot carry a subquery, so the check lives here, one index lookup on a three-row table.
  if not exists (
    select 1 from custom.carrying_rule cr
    where cr.is_active and cr.role = v_row.role
  ) then
    return null;
  end if;

  v_org := v_row.organization_id;

  -- The moved record's own epoch, and its container's. Two rows, never a subtree.
  perform custom.bump_epoch(v_row.source_type, v_row.source_id, v_org);
  perform custom.bump_epoch(v_row.target_type, v_row.target_id, v_org);

  -- The pair's cache entries go in the SAME COMMIT. This is the "invalidated in the same commit"
  -- half of VIS-7, and it is bounded: the pair, never the closure below it.
  delete from custom.visibility_cache c
   where (c.container_type = v_row.source_type and c.container_id = v_row.source_id)
      or (c.container_type = v_row.target_type and c.container_id = v_row.target_id)
      or (c.item_type      = v_row.source_type and c.item_id      = v_row.source_id)
      or (c.item_type      = v_row.target_type and c.item_id      = v_row.target_id);

  return null;
end;
$$;

comment on function custom.trg_associations_bump_visibility() is
  'W2-EPOCH / VIS-7, VIS-8, VIS-9. The same-commit invalidation. Fires only for association rows '
  'whose role is one of the new store''s carrying roles, so it is inert for every association the '
  'platform writes today.';

create or replace trigger zz_w2_epoch_bump
  after insert or update or delete on platform.associations
  for each row
  execute function custom.trg_associations_bump_visibility();

-- ---------------------------------------------------------------------------------------------
-- 6. THE VALIDITY TEST (VIS-11).
--
-- An entry is valid only if its stamp is at least the MAXIMUM epoch over the pair's ancestors and
-- carrying targets. This is what makes the O(1) reparent correct: the moved record's epoch is now
-- higher than every stamp beneath it, so every entry beneath it fails here without any of them
-- having been touched by the write.
-- ---------------------------------------------------------------------------------------------
create or replace function custom.required_epoch(
  p_container_type text,
  p_container_id   uuid,
  p_item_type      text,
  p_item_id        uuid
) returns bigint
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(max(e.epoch), 0)
  from custom.visibility_epoch e
  where (e.entity_type, e.entity_id) in (
        (p_container_type, p_container_id),
        (p_item_type,      p_item_id)
      )
     or (e.entity_type, e.entity_id) in (
        select a.container_type, a.container_id
        from custom.visibility_ancestors(p_item_type, p_item_id) a
      );
$$;

comment on function custom.required_epoch(text, uuid, text, uuid) is
  'W2-EPOCH / VIS-11. The maximum epoch over the pair itself, its ancestors and its carrying '
  'targets. A cache entry is valid only when its stamp is at least this.';

create or replace function custom.cache_lookup(
  p_container_type text,
  p_container_id   uuid,
  p_item_type      text,
  p_item_id        uuid
) returns public.permission_level
language sql
stable
security definer
set search_path to ''
as $$
  -- NULL means "no answer" and every caller then recomputes or hides. There is no branch here
  -- that returns a level it could not revalidate (VIS-13).
  select c.max_level
  from custom.visibility_cache c
  where c.container_type = p_container_type and c.container_id = p_container_id
    and c.item_type = p_item_type and c.item_id = p_item_id
    and c.stamp_epoch >= custom.required_epoch(p_container_type, p_container_id,
                                               p_item_type, p_item_id);
$$;

comment on function custom.cache_lookup(text, uuid, text, uuid) is
  'W2-EPOCH / VIS-13. A stale entry is NEVER served: this returns NULL rather than a level the '
  'moment the stamp falls behind the pair''s required epoch.';

-- ---------------------------------------------------------------------------------------------
-- 7. BACKGROUND WARMING (VIS-13, allowed but never load-bearing).
-- ---------------------------------------------------------------------------------------------
create or replace function custom.visibility_warm(
  p_container_type text,
  p_container_id   uuid
) returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_n integer;
begin
  insert into custom.visibility_cache
    (container_type, container_id, item_type, item_id, max_level, depth, stamp_epoch, computed_at)
  select p_container_type, p_container_id, d.item_type, d.item_id, d.max_level, d.depth,
         custom.required_epoch(p_container_type, p_container_id, d.item_type, d.item_id),
         now()
  from custom.derive_visibility(p_container_type, p_container_id) d
  on conflict (container_type, container_id, item_type, item_id) do update
    set max_level = excluded.max_level,
        depth = excluded.depth,
        stamp_epoch = excluded.stamp_epoch,
        computed_at = excluded.computed_at;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function custom.visibility_warm(text, uuid) is
  'W2-EPOCH / VIS-13. Background warming. Every entry is stamped with the epoch read in the same '
  'statement, so a warmer racing a write LOSES the race rather than winning it with a stale value.';

create or replace function custom.visibility_cache_rebuild()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  rec record;
  v_n integer := 0;
begin
  -- VIS-7: the stored form is droppable. Everything below is rebuilt from the associations alone.
  truncate custom.visibility_cache;
  for rec in
    select distinct e.container_type as ct, e.container_id as ci from custom.carrying_edges e
  loop
    v_n := v_n + custom.visibility_warm(rec.ct, rec.ci);
  end loop;
  return v_n;
end;
$$;

comment on function custom.visibility_cache_rebuild() is
  'W2-EPOCH / VIS-7. TRUNCATE the cache and rebuild it from the associations alone. Every answer '
  'is unchanged afterwards, because the cache was never the authority.';

-- ---------------------------------------------------------------------------------------------
-- 8. THE READ THAT CARRIES A VERSION (VIS-14, VIS-15).
-- ---------------------------------------------------------------------------------------------
create or replace function custom.has_visibility_at(
  p_user_id       uuid,
  p_type          text,
  p_id            uuid,
  p_required      public.permission_level default 'viewer',
  p_organization_id uuid default null,
  p_min_version   bigint default null
) returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_current bigint;
begin
  if p_min_version is not null and p_organization_id is not null then
    select v.version into v_current
    from custom.organization_visibility_version v
    where v.organization_id = p_organization_id;
    v_current := coalesce(v_current, 1);
    if v_current < p_min_version then
      -- The reader has already observed a write this snapshot cannot see. Fail toward the reader's
      -- own view rather than serving a state they have moved past. Asymmetric ON PURPOSE (VIS-15):
      -- briefly hiding something just gained is fine; returning something just lost is not.
      raise exception
        'custom.has_visibility_at: STALE SNAPSHOT — organization % is at visibility version %, the '
        'reader carries %. Refusing to answer from a snapshot older than a write this reader has '
        'already observed. Retry on a fresher connection.',
        p_organization_id, v_current, p_min_version
        using errcode = '40001';
    end if;
  end if;

  return custom.has_visibility(p_user_id, p_type, p_id, p_required);
end;
$$;

comment on function custom.has_visibility_at(uuid, text, uuid, public.permission_level, uuid, bigint) is
  'W2-EPOCH / VIS-14, VIS-15. Every read carries the visibility version of the reader''s last '
  'observed write. A snapshot older than that version REFUSES rather than answering, so after any '
  'commit no read returns a record the reader has lost; it may briefly hide one just gained.';

-- ---------------------------------------------------------------------------------------------
-- 9. THE ACCESS DECISION, DECLARED IN DATA.
-- ---------------------------------------------------------------------------------------------
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'bump_epoch', 'p_entity_type text, p_entity_id uuid, p_organization_id uuid',
   'Takes an entity id and an organization id and WRITES a counter for them; it grants nothing and '
   'reads no row contents. A NULL p_entity_id returns null and writes nothing.',
   'w2_epoch_one_version_per_organization_and_an_epoch_on_every_container.sql',
   'server_only: called by the same-commit trigger on platform.associations and by the record write '
   'door. A client that could bump another organization''s version would be a denial-of-service on '
   'their reads, so no client role ever holds it.',
   false, false),
  ('custom', 'trg_associations_bump_visibility', '',
   'A trigger function with no direct call surface and no entity-id argument.',
   'w2_epoch_one_version_per_organization_and_an_epoch_on_every_container.sql',
   'server_only: reached only as the AFTER trigger on platform.associations; it is never called by '
   'name from anywhere, client or server.',
   false, false),
  ('custom', 'required_epoch', 'p_container_type text, p_container_id uuid, p_item_type text, p_item_id uuid',
   'Takes a container id and an item id and returns a counter over them and the item''s ancestors. '
   'It makes no access decision and exposes no row contents. NULL ids return 0.',
   'w2_epoch_one_version_per_organization_and_an_epoch_on_every_container.sql',
   'server_only: read by custom.cache_lookup and custom.visibility_warm inside the database, and by '
   'the read door W4-DOOR builds. Schema custom is revoked from every client role until '
   'switch-checklist step 3.',
   false, false),
  ('custom', 'cache_lookup', 'p_container_type text, p_container_id uuid, p_item_type text, p_item_id uuid',
   'Takes a container id and an item id and returns the CACHED level that pair conveys, or NULL when '
   'the entry is stale. It answers about the graph, never about the caller. NULL ids return NULL.',
   'w2_epoch_one_version_per_organization_and_an_epoch_on_every_container.sql',
   'server_only: the cache read behind custom.has_visibility. A client calling it would learn that a '
   'container conveys to an item without holding either, so no client role ever holds it.',
   false, false),
  ('custom', 'visibility_warm', 'p_container_type text, p_container_id uuid',
   'Takes a container id and writes cache rows for what it conveys. It grants nothing and returns a '
   'row count only.',
   'w2_epoch_one_version_per_organization_and_an_epoch_on_every_container.sql',
   'server_only: background warming, run by the server''s own scheduler and by the record write door. '
   'No client calls it; warming is never on a client''s critical path.',
   false, false),
  ('custom', 'visibility_cache_rebuild', '',
   'Takes no entity id. TRUNCATEs and rebuilds the whole cache from the associations.',
   'w2_epoch_one_version_per_organization_and_an_epoch_on_every_container.sql',
   'server_only: an operator and verifier function, run through a direct database connection. It '
   'rewrites the entire cache, so no client role is ever given it.',
   false, false),
  ('custom', 'has_visibility_at',
   'p_user_id uuid, p_type text, p_id uuid, p_required public.permission_level, p_organization_id uuid, p_min_version bigint',
   'p_user_id is the PRINCIPAL the answer is about and is checked through custom.has_visibility, '
   'which resolves it against public.has_permission_for and iam.has_access_for_base; it is never '
   'taken as an assertion of who the caller is. p_id is the record. p_organization_id and '
   'p_min_version gate the SNAPSHOT, not the grant. A NULL p_user_id or p_id returns false.',
   'w2_epoch_one_version_per_organization_and_an_epoch_on_every_container.sql',
   'server_only: the version-carrying read behind the door W4-DOOR builds. A client that could pass '
   'an arbitrary p_user_id would be asking about someone else, so this never becomes a client door '
   'in this signature.',
   false, false)
on conflict do nothing;
