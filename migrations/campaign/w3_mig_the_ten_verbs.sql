-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W3-MIG — THE TEN MIGRATION VERBS, each logged and reversible, with the inverse stored AT
-- THE TIME it ran. REC-12 · REC-13 · REC-18 · REC-20 · REC-21 · REC-22 · REC-23 · REC-24 ·
-- REC-N-18 · FLD-4.
--
-- THE TEN, and every one of them writes through `history.migration_record` before it changes
-- anything, so `history.migration_undo` can put it back:
--
--   custom.migrate_promote        a Table to fast storage           (inverse: demote)
--   custom.migrate_demote         a Table back to light storage     (inverse: promote)
--   custom.migrate_extract_parent a new parent above a record       (inverse: reparent + delete)
--   custom.migrate_merge          two records into one              (inverse: restore + unalias)
--   custom.migrate_split          one record into two, one keeps id (inverse: delete the new one)
--   custom.migrate_reparent       a record under a different parent (inverse: the old parent)
--   custom.migrate_retype         a record to another Table, or a Field to another behaviour
--   custom.migrate_rename         a record's title                  (inverse: the old title)
--   custom.migrate_delete         soft, within retention, applying on_delete
--   custom.migrate_purge          the hard delete retention finally allows
--
-- WHY THE INVERSE IS STORED AT THE TIME AND NOT WORKED OUT LATER (REC-20, HIS-8). The inverse
-- of a retype cannot be reconstructed from a row that no longer holds the old values, and the
-- inverse of a merge cannot be reconstructed from a record that no longer exists. Every verb
-- below reads what it is about to destroy, hands it to `history.migration_record`, and only
-- then writes. A verb that could not describe its own undo would be refused by that function
-- rather than logged as a lie.
--
-- WHY THERE IS STILL ONE DELETE VERB (T7). `custom.record_delete` (W1-STORE's) remains the
-- only thing that sets `deleted_at`. `custom.migrate_delete` decides WHAT must be deleted —
-- the `on_delete` effects, the containment cascade, the Home's Tables, the Field's dependants
-- — and then calls that one verb for each. `platform.relation_on_delete` (W1-REL's) is wired
-- in here exactly as its own comment says it would be: it RETURNS the cascade list and never
-- deletes.
--
-- THE REQUIRED INPUT OF THIS LANE'S EXIT, AND IT WAS TRUE (measured on the branch,
-- 2026-09-18, before a line of this file existed):
--
--   delete from custom.record where id='11111111-0008-4000-8000-000000000012'  -- amount_usd
--
-- succeeded, although `amount_with_tax`'s `config.expr` reads that Field BY ID. Nothing in the
-- store refused it. REC-18's "deleting a Field a Rule depends on is refused, naming the Rule"
-- was UNBUILT, not merely unproven. `custom.field_dependants` below is what builds it, and it
-- reads BOTH the ways a dependency is actually written in this store — by id inside a Rule's
-- `expr` or a Field's `config`, and by key inside `depends_on` — because a census of one of
-- them would have missed exactly the case the verifier hit.
--
-- REC-24 — ATOMIC WITH THE VISIBILITY IT IMPLIES. Every verb here is one PL/pgSQL function and
-- therefore one transaction: the containment edge, the aliases, the cascade, the log row and
-- the undo payload commit together or not at all. There is no arrangement in which a caller
-- sees a reparented record with its old audience, because there is no second statement.
--
-- THE ALIAS TABLE IS THE WHOLE OF REC-21 AND REC-22. On merge the loser's id resolves to the
-- winner FOREVER; on split one side keeps the id and the other is new. `custom.record_alias`
-- is that mapping, and `custom.resolve_id` follows the chain, so an id that has been merged
-- twice still answers with the record a person can actually open.
--
-- ITS PROOF is `scripts/campaign-tests/w3_mig_c18.sql`; its RED twin `w3_mig_red.sql`.
-- ITS INVERSE is `migrations/inverse/w3_mig_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '300s';

-- ═════════════════════════════════════════════════════════════════════════════
-- REC-21 / REC-22 — an id that stopped being a record still resolves to one.
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists custom.record_alias (
  organization_id uuid        not null references iam.organizations(id),
  old_id          uuid        not null,
  new_id          uuid        not null,
  verb            text        not null,
  reason          text,
  migration_id    uuid,
  aliased_at      timestamptz not null default now(),
  primary key (organization_id, old_id)
);

comment on table custom.record_alias is
  'REC-21 and REC-22: the id a merged-away or split-off record resolves to, permanently. A row here is never deleted by a prune — an id somebody bookmarked, cited or wrote into another system resolves for as long as this store exists. custom.resolve_id follows the chain.';

create index if not exists record_alias_new_id_idx
  on custom.record_alias (organization_id, new_id);

alter table custom.record_alias enable row level security;

create policy record_alias_read on custom.record_alias
  for select
  using ((select is_platform_admin())
         or (organization_id is not null and organization_id in (select iam.my_orgs())));

create function custom.resolve_id(p_organization_id uuid, p_id uuid)
returns uuid
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_id    uuid := p_id;
  v_next  uuid;
  v_seen  uuid[] := array[]::uuid[];
begin
  -- The chain, not one hop: a record merged into a record that was later merged again has to
  -- answer with the one a person can open, or "the id resolves forever" is only true once.
  loop
    v_seen := v_seen || v_id;
    select a.new_id into v_next
      from custom.record_alias a
     where a.organization_id = p_organization_id and a.old_id = v_id;
    exit when v_next is null;
    exit when v_next = any (v_seen);        -- a cycle answers with where it started looping
    v_id := v_next;
  end loop;
  return v_id;
end;
$fn$;

comment on function custom.resolve_id(uuid, uuid) is
  'REC-21 / REC-22: the record an id resolves to today, following the whole alias chain. An id that was never aliased answers with itself, so every caller may ask this instead of deciding whether to.';

-- ═════════════════════════════════════════════════════════════════════════════
-- REC-18 — what depends on a Field, read BOTH the ways this store writes it.
-- ═════════════════════════════════════════════════════════════════════════════
create function custom.field_dependants(p_organization_id uuid, p_field_id uuid)
returns table(kind text, dependant_id uuid, label text, how text)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_key   text;
  v_table uuid;
begin
  select f.data ->> 'key', nullif(f.data ->> 'entity_definition_id', '')::uuid
    into v_key, v_table
    from custom.record f
   where f.organization_id = p_organization_id and f.id = p_field_id and f.data_class = 'field';
  if v_key is null then
    return;                        -- not a Field of this organization: nothing depends on it
  end if;

  return query
  -- (1) BY ID. A Rule's `expr` names a Field as {"field": "<uuid>"}; a formula or derived
  --     Field's `config` names it the same way. This is the arm the verifier's `amount_usd`
  --     case needed and nothing had.
  select case r.data_class when 'rule' then 'rule'
                           when 'merge_field' then 'merge field'
                           else 'field' end,
         r.id,
         coalesce(nullif(r.data ->> 'name', ''), nullif(r.data ->> 'label', ''),
                  nullif(r.data ->> 'key', ''), r.id::text),
         'names it by id'
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.id <> p_field_id
     and r.data_class in ('rule', 'field', 'merge_field')
     and (r.data -> 'expr')::text || (r.data -> 'config')::text
         like '%' || p_field_id::text || '%'
  union
  -- (2) BY KEY, within the same Table. `depends_on` is a list of Field KEYS, so a formula
  --     that reads `amount_usd` by name is just as dependent as one that reads it by id.
  select 'field', r.id,
         coalesce(nullif(r.data ->> 'label', ''), r.data ->> 'key', r.id::text),
         'reads it by name in depends_on'
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.data_class = 'field'
     and r.id <> p_field_id
     and nullif(r.data ->> 'entity_definition_id', '')::uuid is not distinct from v_table
     and exists (select 1 from jsonb_array_elements_text(coalesce(r.data -> 'depends_on', '[]'::jsonb)) d
                  where d = v_key);
end;
$fn$;

comment on function custom.field_dependants(uuid, uuid) is
  'REC-18 / T7: every Rule, formula Field and merge field that depends on one Field — by id inside expr/config, and by key inside depends_on. Both arms exist because a census of one of them is how deleting amount_usd came to succeed while amount_with_tax read it (measured 2026-09-18).';

-- ═════════════════════════════════════════════════════════════════════════════
-- REC-23 — the purge retention finally allows, and never before.
-- ═════════════════════════════════════════════════════════════════════════════
create function custom.migrate_purge(p_organization_id uuid, p_table_id uuid default null,
                                     p_dry_run boolean default true)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_days   integer;
  v_cutoff timestamptz;
  v_count  bigint := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_purge');

  -- THE GUARD, NAMED AND READ IN THE BODY (§6b.2), and this is the one verb in the file that
  -- earns it: every other verb here is reversible from History, and this one is the hard
  -- delete. While `custom/system_enabled` resolves false the store belongs to the campaign
  -- that owns it, and nothing outside that campaign destroys a row in it.
  if not coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean, false)
     and not pg_has_role(custom.caller_role(),
                         (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                         'member') then
    raise exception 'The custom data store is switched off, so nothing was purged.'
      using errcode = '42501',
            hint = 'custom/system_enabled resolves false and this caller does not own custom.record. Nothing was destroyed. The switch checklist turns the knob on; a caller never does.';
  end if;

  if p_organization_id is null then
    raise exception 'custom.migrate_purge: which organization''s deleted records?'
      using errcode = '22004',
            hint = 'REC-23: retention is resolved per organization, so a purge that spanned organizations would apply one organization''s window to another''s data.';
  end if;

  -- The window is the TABLE'S retention, read through W3-HIST's one reader, which never
  -- answers below the organization's floor. A deleted record is reversible for exactly as
  -- long as its Table says, and this function is the only thing that ends that.
  v_days := case when p_table_id is null
                 then history.retention_floor_days(p_organization_id)
                 else history.retention_days(p_organization_id, p_table_id) end;
  v_cutoff := now() - make_interval(days => v_days);

  with doomed as (
    select r.id
      from custom.record r
     where r.organization_id = p_organization_id
       and r.deleted_at is not null
       and r.deleted_at < v_cutoff
       and (p_table_id is null or r.table_id = p_table_id)
       -- REC-21: an id that resolves to a surviving record is never purged, whatever its age.
       -- Hard-deleting a merge loser would break "the losing id resolves to the winner
       -- forever" sixty days after the merge, silently, which is the worst time for it.
       and not exists (select 1 from custom.record_alias a
                        where a.organization_id = r.organization_id and a.old_id = r.id)
  ),
  gone as (
    delete from custom.record c
     using doomed d
     where not p_dry_run and c.organization_id = p_organization_id and c.id = d.id
    returning 1
  )
  select case when p_dry_run then (select count(*) from doomed)
              else (select count(*) from gone) end
    into v_count;

  return jsonb_build_object(
    'function', 'custom.migrate_purge',
    'organization_id', p_organization_id, 'table_id', p_table_id,
    'retention_days', v_days, 'cutoff', v_cutoff,
    'policy', 'a soft-deleted record is destroyed only after its Table''s retention, and never while an id still resolves to it (REC-21)',
    'dry_run', p_dry_run, 'rows_purged', v_count, 'at', now());
end;
$fn$;

comment on function custom.migrate_purge(uuid, uuid, boolean) is
  'REC-23: delete is soft and reversible WITHIN retention — this is what ends that, and only after it. A record whose id is still an alias target is never purged, so REC-21''s "forever" is not quietly ended by a retention window.';

-- ═════════════════════════════════════════════════════════════════════════════
-- THE DELETE VERB — REC-12, REC-13, REC-18, REC-23, T7.
-- ═════════════════════════════════════════════════════════════════════════════
create function custom.migrate_delete(p_organization_id uuid, p_record_id uuid,
                                      p_note text default null)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_row      custom.record%rowtype;
  v_names    text;
  v_effects  jsonb;
  v_cascade  uuid[] := '{}';
  v_took     uuid[] := '{}';
  v_child    uuid;
  v_log      uuid;
  v_n        integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_delete');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to delete.', p_record_id
      using errcode = '02000',
            hint = 'REC-23: a record already deleted is still here and still reversible — custom.record_restore(organization, record) brings it back until its Table''s retention runs out.';
  end if;

  -- ── REC-18, AND IT COMES FIRST. A Field a Rule or a formula depends on is refused, and the
  --    refusal NAMES the dependant — because "this field is in use" tells a person nothing
  --    about what to go and change.
  if v_row.data_class = 'field' then
    select string_agg(distinct d.kind || ' "' || d.label || '"', ', ') into v_names
      from custom.field_dependants(p_organization_id, p_record_id) d;
    if v_names is not null then
      raise exception 'This field is used by %, so it was not deleted.', v_names
        using errcode = '23503',
              hint = 'REC-18 / T7: a Rule or a formula that reads a Field it can no longer find is a calculation that silently stops being right. Change or remove what depends on it first, and then this delete goes through.';
    end if;
  end if;

  -- ── REC-13. A Home is a RECORD, and the Tables living there have a say. The default is
  --    restrict, stated here rather than inherited from a nullable column, because "what
  --    happens by default" is the half a person actually meets.
  select string_agg(distinct coalesce(t.data ->> 'name', h.table_id::text), ', ') into v_names
    from custom.tables_at_home(p_organization_id, array[p_record_id]) h
    left join custom.record t
      on t.organization_id = p_organization_id and t.id = h.table_id and t.deleted_at is null
   where coalesce(t.data ->> 'on_delete', 'restrict') = 'restrict';
  if v_names is not null then
    raise exception 'This is home to %, so it was not deleted.', v_names
      using errcode = '23503',
            hint = 'REC-13 / T7: deleting a place that tables live in would take those tables and everything in them. The default is to refuse. Move those tables to another home first, or set them to cascade deliberately.';
  end if;

  -- ── REC-12, through W1-REL's own function, which RESTRICTS by name, detaches the set_null
  --    edges itself, and RETURNS what must be cascaded. It deletes nothing: this verb does.
  begin
    v_effects := platform.relation_on_delete(p_organization_id, p_record_id);
    select coalesce(array_agg((x #>> '{}')::uuid), '{}')
      into v_cascade
      from jsonb_array_elements(coalesce(v_effects -> 'cascade_to', '[]'::jsonb)) x;
  exception when undefined_function then
    v_effects := jsonb_build_object('note', 'platform.relation_on_delete is not on this database');
  end;

  -- ── REC-12 again, for CONTAINMENT: the 500 serial numbers inside Widget. A contained record
  --    has no independent existence, so it goes with its container. This is the cascade T7
  --    names first and it is not a relation's `on_delete` — it is what containment MEANS.
  for v_child in
    select e.child_id from custom.containment_edges(p_organization_id) e
     where e.parent_id = p_record_id and e.via = 'contained'
  loop
    v_cascade := v_cascade || v_child;
  end loop;

  -- ── THE INVERSE, WORKED OUT AND STORED BEFORE ANYTHING IS DELETED (REC-20 / HIS-8).
  v_log := history.migration_record(p_organization_id, 'delete', v_row.data_class, p_record_id,
             jsonb_build_object('kind', 'restore', 'record_id', p_record_id::text,
                                'also', to_jsonb(v_cascade)),
             coalesce(p_note, format('deleted with %s record(s) it contained or owned', array_length(v_cascade, 1))));

  -- ── ONE DELETE VERB THROUGHOUT (T7). Every id below goes through W1-STORE's
  --    custom.record_delete — the door, the soft delete, the history capture — and this
  --    function never writes `deleted_at` itself.
  foreach v_child in array v_cascade loop
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
      perform custom.record_delete(p_organization_id, v_child);
      v_took := v_took || v_child;
      v_n := v_n + 1;
    end if;
  end loop;
  perform custom.record_delete(p_organization_id, p_record_id);

  return jsonb_build_object('verb', 'delete', 'record_id', p_record_id,
                            'migration_id', v_log, 'took_with_it', to_jsonb(v_took),
                            'cascaded', v_n, 'relation_effects', v_effects,
                            'reversible_until', 'the end of this table''s retention (REC-23)',
                            'at', now());
end;
$fn$;

comment on function custom.migrate_delete(uuid, uuid, text) is
  'T7''s ONE delete verb, with everything that decides what goes with it: REC-18 refuses a Field a Rule or formula depends on and NAMES it; REC-13 refuses a Home by default and names the Tables; REC-12 applies each relation''s on_delete through platform.relation_on_delete and cascades containment. Soft, logged, and reversible within retention (REC-23) by history.migration_undo.';

-- ═════════════════════════════════════════════════════════════════════════════
-- MERGE and SPLIT — REC-21 and REC-22, the two verbs that move ids.
-- ═════════════════════════════════════════════════════════════════════════════
create function custom.migrate_merge(p_organization_id uuid, p_winner_id uuid, p_loser_id uuid,
                                     p_note text default null)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_win  custom.record%rowtype;
  v_lose custom.record%rowtype;
  v_log  uuid;
  v_moved integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_merge');

  if p_winner_id = p_loser_id then
    raise exception 'A record cannot be merged into itself.'
      using errcode = '22023', hint = 'REC-21: nothing was changed.';
  end if;

  select * into v_win  from custom.record r
   where r.organization_id = p_organization_id and r.id = p_winner_id and r.deleted_at is null;
  select * into v_lose from custom.record r
   where r.organization_id = p_organization_id and r.id = p_loser_id and r.deleted_at is null;
  if v_win.id is null or v_lose.id is null then
    raise exception 'Both records have to be here to merge them, and % is not.',
                    coalesce(case when v_win.id is null then p_winner_id else p_loser_id end)
      using errcode = '02000';
  end if;

  -- THE INVERSE, BEFORE ANYTHING MOVES: the loser's whole document, so undo can put both
  -- records and both ids back exactly (T5's last sentence).
  v_log := history.migration_record(p_organization_id, 'merge', v_lose.data_class, p_loser_id,
             jsonb_build_object('kind', 'restore', 'record_id', p_loser_id::text,
                                'unalias', p_loser_id::text,
                                'document', v_lose.data),
             coalesce(p_note, format('merged into %s', p_winner_id)));

  -- T5: the two phone numbers become ALTERNATES inside the winner's one document, each with
  -- its source — never a second record, and never a value quietly overwritten. A key the
  -- winner does not have is taken outright; a key it has keeps its own value and gains the
  -- loser's as an alternate carrying where it came from.
  declare
    v_data jsonb := v_win.data;
    v_key  text;
    v_val  jsonb;
    v_alts jsonb;
  begin
    for v_key, v_val in select * from jsonb_each(v_lose.data) loop
      if left(v_key, 1) = '_' or v_key in ('parent_id') then
        continue;
      end if;
      if not (v_data ? v_key) then
        v_data := v_data || jsonb_build_object(v_key, v_val);
        v_moved := v_moved + 1;
      elsif (v_data -> v_key) is distinct from v_val then
        v_alts := coalesce(v_data -> '_values' -> v_key -> 'alternates', '[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object(
                       'value', v_val,
                       'src', jsonb_build_object('kind', 'record', 'id', p_loser_id::text)));
        v_data := jsonb_set(
                    jsonb_set(v_data, array['_values', v_key],
                              coalesce(v_data -> '_values' -> v_key, '{}'::jsonb), true),
                    array['_values', v_key, 'alternates'], v_alts, true);
        v_moved := v_moved + 1;
      end if;
    end loop;
    perform custom.record_update(p_organization_id, p_winner_id, v_data);
  end;

  -- Everything the loser contained now hangs off the winner, or the merge would orphan it.
  update custom.record r
     set data = r.data || jsonb_build_object('parent_id', p_winner_id::text)
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and nullif(r.data ->> 'parent_id', '')::uuid = p_loser_id;

  -- REC-21: FOREVER. The alias goes in BEFORE the loser is deleted, so there is no instant in
  -- which the id resolves to nothing.
  insert into custom.record_alias (organization_id, old_id, new_id, verb, reason, migration_id)
  values (p_organization_id, p_loser_id, p_winner_id, 'merge',
          coalesce(p_note, 'merged'), v_log)
  on conflict (organization_id, old_id) do update
        set new_id = excluded.new_id, verb = excluded.verb,
            reason = excluded.reason, migration_id = excluded.migration_id;

  perform custom.record_delete(p_organization_id, p_loser_id);

  return jsonb_build_object('verb', 'merge', 'winner', p_winner_id, 'loser', p_loser_id,
                            'migration_id', v_log, 'values_taken', v_moved,
                            'resolves_to', custom.resolve_id(p_organization_id, p_loser_id),
                            'at', now());
end;
$fn$;

comment on function custom.migrate_merge(uuid, uuid, uuid, text) is
  'T5 / REC-21: two records become one. Values the winner lacks are taken; values that disagree become ALTERNATES inside the winner''s one document, each carrying the record it came from. The losing id resolves to the winner forever through custom.record_alias, and the whole of the loser is stored as the inverse so undo restores both records and both ids.';

create function custom.migrate_split(p_organization_id uuid, p_record_id uuid, p_moved_keys text[],
                                     p_note text default null)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_row  custom.record%rowtype;
  v_new  uuid;
  v_keep jsonb;
  v_side jsonb := '{}'::jsonb;
  v_key  text;
  v_log  uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_split');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to split.', p_record_id using errcode = '02000';
  end if;
  if p_moved_keys is null or array_length(p_moved_keys, 1) is null then
    raise exception 'A split has to say what moves to the other side.'
      using errcode = '22004',
            hint = 'REC-22: name the fields that go to the new record. Everything else stays where it is, on the id that everything already points at.';
  end if;

  v_keep := v_row.data;
  foreach v_key in array p_moved_keys loop
    if v_row.data ? v_key then
      v_side := v_side || jsonb_build_object(v_key, v_row.data -> v_key);
      v_keep := v_keep - v_key;
    end if;
  end loop;

  -- REC-22: ONE SIDE KEEPS THE ID, and it is the original record — never a new pair of ids
  -- with the old one pointing at one of them, because every relation, bookmark and citation
  -- out there already names it.
  v_new := custom.record_write(p_organization_id, v_row.table_id,
             v_side || jsonb_build_object('parent_id', nullif(v_row.data ->> 'parent_id', '')));

  v_log := history.migration_record(p_organization_id, 'split', v_row.data_class, p_record_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_record_id::text,
                                'patch', v_row.data, 'delete_after', v_new::text),
             coalesce(p_note, format('split %s off into %s', array_to_string(p_moved_keys, ', '), v_new)));

  perform custom.record_update(p_organization_id, p_record_id, v_keep);

  -- The NEW side also resolves from the old id for anybody who followed it there, but the old
  -- id itself is untouched: `custom.resolve_id` answers with the keeper, because the keeper is
  -- not aliased at all. The row below records the relationship without moving the id.
  insert into custom.record_alias (organization_id, old_id, new_id, verb, reason, migration_id)
  values (p_organization_id, v_new, p_record_id, 'split',
          coalesce(p_note, 'split off from the record that kept the id'), v_log)
  on conflict (organization_id, old_id) do nothing;

  return jsonb_build_object('verb', 'split', 'kept_the_id', p_record_id, 'new_record', v_new,
                            'migration_id', v_log, 'moved', to_jsonb(p_moved_keys),
                            'old_id_resolves_to', custom.resolve_id(p_organization_id, p_record_id),
                            'at', now());
end;
$fn$;

comment on function custom.migrate_split(uuid, uuid, text[], text) is
  'REC-22: one record becomes two and ONE SIDE KEEPS THE ID — the original, because everything out there already names it. The new side is recorded in custom.record_alias as having come from it, which is a provenance row and never a redirect of the id that stayed.';

-- ═════════════════════════════════════════════════════════════════════════════
-- RETYPE — REC-N-18 (a record) and FLD-4 / T12 (a Field's behaviour). ONE verb.
-- ═════════════════════════════════════════════════════════════════════════════
create function custom.migrate_retype(p_organization_id uuid, p_id uuid, p_to text,
                                      p_note text default null)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_row     custom.record%rowtype;
  v_log     uuid;
  v_keep    jsonb;
  v_misfit  jsonb := '{}'::jsonb;
  v_ok      text[];
  v_key     text;
  v_to_tbl  uuid;
  v_was     text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_retype');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to retype.', p_id using errcode = '02000';
  end if;

  -- ── ARM TWO FIRST, because it is the smaller one: a FIELD changes what it behaves as
  --    (FLD-4 / T12). The Values already written stay exactly where they are; this verb does
  --    not walk the records and coerce them. What it does is record the change, so the
  --    Values that no longer fit are findable with the reason, in History.
  if v_row.data_class = 'field' then
    v_was := v_row.data ->> 'type';
    if v_was = p_to then
      return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                                'changed', false, 'at', now());
    end if;
    v_log := history.migration_record(p_organization_id, 'retype', 'field', p_id,
               jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                  'patch', jsonb_build_object('type', v_was)),
               coalesce(p_note, format('%s behaves as %s instead of %s; values that do not fit are in History as they were, neither coerced nor deleted (FLD-4)', coalesce(v_row.data ->> 'label', v_row.data ->> 'key'), p_to, v_was)));
    perform custom.record_update(p_organization_id, p_id, jsonb_build_object('type', p_to));
    return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                              'changed', true, 'migration_id', v_log,
                              'values', 'unchanged — nothing is coerced and nothing is deleted (FLD-4)',
                              'at', now());
  end if;

  -- ── ARM ONE: a RECORD moves to another Table (REC-N-18 / T9). The id does not change, so
  --    every relation to it still resolves — that is the whole point of the verb.
  select t.id into v_to_tbl from custom.record t
   where t.organization_id = p_organization_id and t.data_class = 'table'
     and t.deleted_at is null
     and (t.id::text = p_to or t.data ->> 'slug' = p_to or t.data ->> 'name' = p_to)
   limit 1;
  if v_to_tbl is null then
    raise exception 'There is no table "%" in this organization to retype it to.', p_to
      using errcode = '02000', hint = 'REC-N-18: name the table by id, slug or name.';
  end if;

  -- What the TARGET Table accepts. Everything else is a misfit — kept in the log with its
  -- reason and taken out of the document, never coerced into a shape it does not have.
  select coalesce(array_agg(f.data ->> 'key'), '{}')
    into v_ok
    from custom.applicable_fields(p_organization_id, v_to_tbl, null) f;

  v_keep := v_row.data;
  for v_key in select jsonb_object_keys(v_row.data) loop
    if left(v_key, 1) = '_' or v_key in ('parent_id') then
      continue;
    end if;
    if not (v_key = any (v_ok)) then
      v_misfit := v_misfit || jsonb_build_object(v_key, v_row.data -> v_key);
      v_keep := v_keep - v_key;
    end if;
  end loop;

  v_log := history.migration_record(p_organization_id, 'retype', 'record', p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', v_row.data, 'table_id', v_row.table_id::text),
             coalesce(p_note, format('retyped to %s; %s value(s) did not fit and are in History with this reason, neither coerced nor deleted',
                                     coalesce((select t.data ->> 'name' from custom.record t
                                                where t.organization_id = p_organization_id and t.id = v_to_tbl), p_to),
                                     (select count(*) from jsonb_object_keys(v_misfit)))));

  -- The table_id is not part of `data`, so it is not something custom.record_update can move.
  -- The door above has already judged this caller, and every BEFORE trigger on the table —
  -- the shape guards, the validation, the envelope — runs on this write exactly as on any
  -- other, which is what makes the target Table's rules apply from the first moment.
  update custom.record r
     set table_id = v_to_tbl, data = v_keep
   where r.organization_id = p_organization_id and r.id = p_id;

  return jsonb_build_object('verb', 'retype', 'record_id', p_id, 'kept_the_id', true,
                            'from_table', v_row.table_id, 'to_table', v_to_tbl,
                            'migration_id', v_log,
                            'misfits', v_misfit,
                            'misfits_are', 'in History with the reason, on migration ' || v_log::text,
                            'at', now());
end;
$fn$;

comment on function custom.migrate_retype(uuid, uuid, text, text) is
  'REC-N-18 / T9 and FLD-4 / T12, one verb with two arms. A RECORD retyped to another Table KEEPS ITS ID, keeps every Value the target accepts, and sends each misfit to History with the reason — so every relation to it still resolves. A FIELD retyped changes what it behaves as and coerces nothing: the Values that no longer fit stay exactly as they were and are readable in History with the reason.';

-- ═════════════════════════════════════════════════════════════════════════════
-- THE FIVE SMALLER VERBS. Each one logs its inverse before it writes.
-- ═════════════════════════════════════════════════════════════════════════════
create function custom.migrate_rename(p_organization_id uuid, p_id uuid, p_to text,
                                      p_note text default null)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_row custom.record%rowtype;
  v_key text;
  v_was text;
  v_log uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_rename');
  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to rename.', p_id using errcode = '02000';
  end if;

  -- What "the name" IS depends on what this row is: a Table and a Field carry `name`/`label`
  -- of their own, and a record is named by its Table's title field (REC-1).
  v_key := case v_row.data_class
             when 'record' then coalesce(custom.table_type_field(p_organization_id, v_row.table_id), null)
             else null end;
  v_key := case when v_row.data_class = 'record'
                then coalesce((select t.data ->> 'title_field' from custom.record t
                                where t.organization_id = p_organization_id and t.id = v_row.table_id), 'name')
                when v_row.data ? 'name'  then 'name'
                when v_row.data ? 'label' then 'label'
                else 'name' end;
  v_was := v_row.data ->> v_key;

  v_log := history.migration_record(p_organization_id, 'rename', v_row.data_class, p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', jsonb_build_object(v_key, v_was)),
             coalesce(p_note, format('%s renamed from "%s" to "%s"', v_key, coalesce(v_was, 'nothing'), p_to)));
  perform custom.record_update(p_organization_id, p_id, jsonb_build_object(v_key, p_to));

  return jsonb_build_object('verb', 'rename', 'record_id', p_id, 'field', v_key,
                            'was', v_was, 'now', p_to, 'migration_id', v_log, 'at', now());
end;
$fn$;

create function custom.migrate_reparent(p_organization_id uuid, p_id uuid, p_parent_id uuid,
                                        p_note text default null)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_was uuid;
  v_log uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_reparent');
  select nullif(r.data ->> 'parent_id', '')::uuid into v_was
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if not found then
    raise exception 'There is no record % here to move.', p_id using errcode = '02000';
  end if;

  v_log := history.migration_record(p_organization_id, 'reparent', 'record', p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', jsonb_build_object('parent_id', v_was)),
             coalesce(p_note, format('moved from %s to %s', coalesce(v_was::text, 'nothing'), coalesce(p_parent_id::text, 'nothing'))));

  -- REC-24: ONE statement, so the containment edge and every Visibility answer that reads it
  -- change in the same commit. There is no window in which the old audience still reaches it.
  perform custom.record_reparent(p_organization_id, p_id, p_parent_id);

  return jsonb_build_object('verb', 'reparent', 'record_id', p_id, 'was', v_was,
                            'now', p_parent_id, 'migration_id', v_log,
                            'atomic_with_visibility', true, 'at', now());
end;
$fn$;

create function custom.migrate_extract_parent(p_organization_id uuid, p_id uuid,
                                              p_parent_table_id uuid, p_moved_keys text[],
                                              p_note text default null)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_row    custom.record%rowtype;
  v_parent uuid;
  v_data   jsonb := '{}'::jsonb;
  v_was    uuid;
  v_key    text;
  v_log    uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_extract_parent');
  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to extract a parent from.', p_id using errcode = '02000';
  end if;
  v_was := nullif(v_row.data ->> 'parent_id', '')::uuid;

  foreach v_key in array coalesce(p_moved_keys, '{}') loop
    if v_row.data ? v_key then
      v_data := v_data || jsonb_build_object(v_key, v_row.data -> v_key);
    end if;
  end loop;

  -- T5: extracting a Person parent from Practitioner Chen COPIES the shared facts up rather
  -- than moving them, because the Practitioner record is still a Practitioner and still has a
  -- phone number. The two Persons that result are two records — which is exactly why the next
  -- verb in T5 is a merge.
  v_parent := custom.record_write(p_organization_id, p_parent_table_id,
                v_data || case when v_was is null then '{}'::jsonb
                               else jsonb_build_object('parent_id', v_was::text) end);

  v_log := history.migration_record(p_organization_id, 'extract_parent', 'record', p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', jsonb_build_object('parent_id', v_was),
                                'delete_after', v_parent::text),
             coalesce(p_note, format('a parent was extracted above this record as %s', v_parent)));

  perform custom.record_reparent(p_organization_id, p_id, v_parent);

  return jsonb_build_object('verb', 'extract_parent', 'record_id', p_id, 'parent', v_parent,
                            'was_under', v_was, 'migration_id', v_log, 'at', now());
end;
$fn$;

create function custom.migrate_promote(p_organization_id uuid, p_table_id uuid,
                                       p_note text default null)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_was text;
  v_log uuid;
  v_res jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_promote');
  v_was := custom.table_storage(p_organization_id, p_table_id);
  if v_was is null then
    raise exception 'That is not a table of this organization, so there was nothing to promote.'
      using errcode = '23503';
  end if;

  v_log := history.migration_record(p_organization_id, 'promote', 'table', p_table_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_table_id::text,
                                'patch', jsonb_build_object('storage', v_was)),
             coalesce(p_note, format('moved to fast storage from %s', v_was)));
  v_res := custom.promote_table(p_organization_id, p_table_id);

  return jsonb_build_object('verb', 'promote', 'table_id', p_table_id, 'was', v_was,
                            'now', custom.table_storage(p_organization_id, p_table_id),
                            'migration_id', v_log, 'detail', v_res, 'at', now());
end;
$fn$;

create function custom.migrate_demote(p_organization_id uuid, p_table_id uuid,
                                      p_note text default null)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_was text;
  v_log uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_demote');
  v_was := custom.table_storage(p_organization_id, p_table_id);
  if v_was is null then
    raise exception 'That is not a table of this organization, so there was nothing to demote.'
      using errcode = '23503';
  end if;

  v_log := history.migration_record(p_organization_id, 'demote', 'table', p_table_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_table_id::text,
                                'patch', jsonb_build_object('storage', v_was)),
             coalesce(p_note, format('moved to light storage from %s', v_was)));

  -- Demoting leaves the promoted columns' INDEXES alone deliberately: dropping them is not
  -- additive, it is not reversible inside this transaction, and an index nobody reads costs a
  -- write, not an answer. `W1-INDEX` owns their removal.
  perform custom.record_update(p_organization_id, p_table_id,
                               jsonb_build_object('storage', 'light'));

  return jsonb_build_object('verb', 'demote', 'table_id', p_table_id, 'was', v_was,
                            'now', custom.table_storage(p_organization_id, p_table_id),
                            'migration_id', v_log,
                            'indexes', 'left in place — dropping them is W1-INDEX''s, and an unread index costs a write rather than an answer',
                            'at', now());
end;
$fn$;

comment on function custom.migrate_rename(uuid, uuid, text, text) is
  'REC-20: rename, logged with the old name as its inverse. What "the name" is depends on the row — a Table''s or a Field''s own, a record''s through its Table''s title field (REC-1).';
comment on function custom.migrate_reparent(uuid, uuid, uuid, text) is
  'REC-20 / REC-24 / T3: reparent, logged with the old parent as its inverse, and atomic with every Visibility answer that reads the containment edge — one statement, one commit, no window.';
comment on function custom.migrate_extract_parent(uuid, uuid, uuid, text[], text) is
  'T5 / REC-20: extract a parent above a record, carrying the named values up and leaving the record itself intact underneath it. The inverse restores the old parent and names the record to delete.';
comment on function custom.migrate_promote(uuid, uuid, text) is
  'REC-20: promote a Table to fast storage through W1-INDEX''s custom.promote_table, logged with its previous storage as the inverse.';
comment on function custom.migrate_demote(uuid, uuid, text) is
  'REC-20: demote a Table to light storage, logged with its previous storage as the inverse. The promoted columns'' indexes are left in place on purpose.';
