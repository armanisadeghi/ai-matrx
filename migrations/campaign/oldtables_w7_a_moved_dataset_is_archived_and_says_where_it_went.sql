-- additive: yes — TWO new functions in schema `workbench` and ONE new row in
--   `platform.feature_knob`. Nothing is dropped, replaced, revoked or renamed; no existing
--   function body is touched; no policy, no trigger, no column, no index. The knob's default
--   is FALSE, so nothing anybody sees changes until an organization is actually moved.
-- lock: platform
-- lane: OLD-TABLES-4
--
-- ══════════════════════════════════════════════════════════════════════════════════════════
-- OLD-TABLES-CUTOVER rev 2, W7 — THE MOVE IS ADDITIVE, AND THE SOURCE IS ARCHIVED, NEVER GONE.
-- ══════════════════════════════════════════════════════════════════════════════════════════
--
-- W0…W6 taught the OLDER user-data tables the relation column and taught every reader to show
-- a name where an id is stored. W7 is the move itself: an organization's datasets are COPIED
-- into the unified record store under their own ids (CUT-4), the source dataset is ARCHIVED
-- with a pointer to the Table it became, and the organization's screens are pointed at the
-- store. Nothing is emptied and nothing is deleted — the chair's ruling of 2026-09-22, and the
-- owner's standing law of 2026-09-20 ("archive never delete").
--
-- THE THREE THINGS THIS FILE ADDS, AND WHY EACH IS A DOOR RATHER THAN AN UPDATE.
--
-- 1. `workbench.udt_dataset_archive(table_id, moved_to_table_id, reason)`
--    The mover must not write `deleted_at` itself. A bare UPDATE would happily archive a
--    dataset whose rows never arrived — which is the one way this campaign could lose a
--    named person's real data — so the door REFUSES unless the Table it claims to have
--    become is actually in the store, in the same organization, with the SAME id. It is one
--    statement and it is idempotent: a dataset already archived to the same Table is a
--    no-op, and archived to a DIFFERENT one is a refusal rather than a silent overwrite.
--
-- 2. `workbench.udt_dataset_unarchive(table_id)`
--    THE UNDO, and it exists because a move nobody can reverse is not a move anybody should
--    run. It clears `deleted_at`, keeps the pointer in `metadata.moved_to` as history, and
--    stamps `metadata.unarchived_at`. It touches nothing in the store: the copy stays where
--    it is, because the copy carries the SAME ids and is therefore not a duplicate — it is
--    the same rows, readable from either side while the knob decides which side a screen asks.
--
-- 3. The knob `data_tables / older_tables_moved`
--    Whether an organization's screens read its data out of the older tables or out of the
--    store is a behavioural choice that belongs to the organization, so it is a knob with a
--    default (Law 6). Default FALSE: every organization reads the older tables exactly as it
--    does today until somebody moves it. The mover flips it per organization through
--    `platform.knob_override_set` — never this row, which is the PLATFORM default and is not
--    any one organization's to change (the same finding W6 was corrected on).
--
--    THE KEY IS `older_tables_moved`, NOT `moved` OR `enabled`. `platform.knob_live_readers`
--    refuses to delete a key whose feature-and-key pair appears in a live function body, and a
--    common word collides with eighteen unrelated bodies (OLD-TABLES-2's finding 2, fixed by
--    lane KNOB-GUARD). A distinctive key is the difference between a knob that can be retired
--    and one that can never be.
--
-- WHY NEITHER FUNCTION IS CLIENT-CALLABLE. Both are steps of a MOVE, run by the mover on the
-- server's own connection. There is no screen on which a person archives their own dataset by
-- naming the Table it became, and a client that could call these could archive a table by
-- naming a record store Table it had nothing to do with. They are registered `server_only` in
-- `platform.client_callable_door` and no `grant execute` is issued, so `authenticated` and
-- `anon` cannot reach them at all.
--
-- LOCK FOOTPRINT (DDL-LOCK census, `scripts/lib/ddl-lock-footprint.json`): `create or replace
-- function` = ACCESS SHARE on no table; `insert` = ordinary DML. Nothing here is window-class.
-- ══════════════════════════════════════════════════════════════════════════════════════════

create or replace function workbench.udt_dataset_archive(
  p_table_id uuid,
  p_moved_to_table_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_org        uuid;
  v_name       text;
  v_deleted    timestamptz;
  v_moved_to   text;
  v_in_store   boolean;
  v_rows       bigint;
  v_in_store_n bigint;
begin
  select d.organization_id, d.table_name, d.deleted_at, d.metadata #>> '{moved_to,table_id}'
    into v_org, v_name, v_deleted, v_moved_to
    from workbench.udt_datasets d
   where d.id = p_table_id;

  if v_org is null then
    raise exception 'there is no data table with the id %, so there is nothing to archive', p_table_id
      using errcode = '02000',
            hint = 'Archiving is a step of the move and the move names the dataset it just copied. A dataset that is not there was never copied.';
  end if;

  -- ALREADY DONE IS DONE. A rerun of the move re-archives nothing and raises nothing.
  if v_deleted is not null and v_moved_to = p_moved_to_table_id::text then
    return jsonb_build_object('table_id', p_table_id, 'archived', false,
                              'already_archived_at', v_deleted,
                              'moved_to', p_moved_to_table_id);
  end if;
  if v_deleted is not null and v_moved_to is distinct from p_moved_to_table_id::text then
    raise exception 'the data table % is already archived and says it became %, not %',
                    coalesce(v_name, p_table_id::text), coalesce(v_moved_to, 'nothing'), p_moved_to_table_id
      using errcode = '23514',
            hint = 'Two different answers to "where did this table go" is the one thing this door will not write. Unarchive it with workbench.udt_dataset_unarchive first if the earlier pointer was wrong.';
  end if;

  -- THE REFUSAL THAT MATTERS: never archive a source whose copy is not there.
  select true into v_in_store
    from custom.record r
   where r.organization_id = v_org
     and r.id = p_moved_to_table_id
     and r.data_class = 'table'
     and r.deleted_at is null;

  if v_in_store is not true then
    raise exception 'the data table % has not arrived in the record store yet, so it is not being archived',
                    coalesce(v_name, p_table_id::text)
      using errcode = '23514',
            hint = 'A move COPIES first and archives second. This door refuses the second half until the first half is visibly true: there is no Table record % in this organization. Run the copy again.';
  end if;

  -- AND THE SECOND HALF OF IT: every live row of the source is in the store under its own id
  -- (CUT-4). Counted rather than trusted, because "the Table arrived" is not "the rows did".
  select count(*) into v_rows
    from workbench.udt_dataset_rows w
   where w.table_id = p_table_id and w.deleted_at is null;
  select count(*) into v_in_store_n
    from custom.record r
   where r.organization_id = v_org
     and r.table_id = p_moved_to_table_id
     and r.data_class = 'record'
     and r.deleted_at is null;

  if v_in_store_n < v_rows then
    raise exception 'the data table % has % live rows and only % of them are in the record store, so it is not being archived',
                    coalesce(v_name, p_table_id::text), v_rows, v_in_store_n
      using errcode = '23514',
            hint = 'Nothing was archived and nothing was lost — the source is exactly as it was. Run the copy again; it is idempotent, so it will write only what is missing.';
  end if;

  update workbench.udt_datasets
     set deleted_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'moved_to', jsonb_build_object(
             'store', 'custom.record',
             'table_id', p_moved_to_table_id,
             'at', now(),
             'rows', v_rows,
             'reason', coalesce(nullif(btrim(p_reason), ''),
                                'moved into the unified record store; the rows kept their own identifiers')))
   where id = p_table_id;

  return jsonb_build_object('table_id', p_table_id, 'archived', true,
                            'moved_to', p_moved_to_table_id, 'rows', v_rows);
end;
$$;

comment on function workbench.udt_dataset_archive(uuid, uuid, text) is
  'Archives ONE older data table after its rows have been copied into the unified record store, and writes into metadata.moved_to the Table they became. Refuses unless that Table is in the store in the same organization and holds at least as many live records as the source has live rows - a source is never archived ahead of its copy. Idempotent for the same destination; a DIFFERENT destination is a refusal, never an overwrite. The undo is workbench.udt_dataset_unarchive. Server-only: the mover calls it, no client can (OLD-TABLES-CUTOVER rev 2 W7, lane OLD-TABLES-4).';

create or replace function workbench.udt_dataset_unarchive(p_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_deleted timestamptz;
  v_name    text;
begin
  select d.deleted_at, d.table_name into v_deleted, v_name
    from workbench.udt_datasets d where d.id = p_table_id;
  if v_name is null then
    raise exception 'there is no data table with the id %, so there is nothing to bring back', p_table_id
      using errcode = '02000';
  end if;
  if v_deleted is null then
    return jsonb_build_object('table_id', p_table_id, 'unarchived', false,
                              'why', 'it was not archived');
  end if;
  update workbench.udt_datasets
     set deleted_at = null,
         metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('unarchived_at', now())
   where id = p_table_id;
  return jsonb_build_object('table_id', p_table_id, 'unarchived', true);
end;
$$;

comment on function workbench.udt_dataset_unarchive(uuid) is
  'Brings an archived older data table back. The pointer in metadata.moved_to is KEPT as history and metadata.unarchived_at is stamped beside it; the copy in the record store is left exactly where it is, because it carries the SAME ids and is the same rows rather than a duplicate. Half of the undo for a move - the other half is removing the organization''s data_tables/older_tables_moved override (OLD-TABLES-CUTOVER rev 2 W7, lane OLD-TABLES-4).';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   signed_in_callers, anonymous_callers, non_client_lane, identity_argtypes, argument_rules)
values
  ('workbench', 'udt_dataset_archive', 'p_table_id uuid, p_moved_to_table_id uuid, p_reason text',
   'migrations/campaign/oldtables_w7_a_moved_dataset_is_archived_and_says_where_it_went.sql (lane OLD-TABLES-4)',
   'A step of the MOVE, run by the mover on the server''s own connection. It takes two ids that must already belong to the same organization - the source dataset and the record-store Table it became - and refuses unless the copy is visibly there with at least as many live records as the source has live rows. No grant is issued to authenticated or anon.',
   false, false,
   'server_only: there is no screen on which a person archives their own data table by naming the store Table it became. A client able to call this could archive a table by naming a Table it had nothing to do with, so it is reachable only by the role that runs the mover.',
   '{2950,2950,25}', null),
  ('workbench', 'udt_dataset_unarchive', 'p_table_id uuid',
   'migrations/campaign/oldtables_w7_a_moved_dataset_is_archived_and_says_where_it_went.sql (lane OLD-TABLES-4)',
   'The undo half of the same move step, run the same way and by the same hand. It clears deleted_at and stamps unarchived_at; it writes nothing in the record store.',
   false, false,
   'server_only: the counterpart of udt_dataset_archive above and reachable by the same one role.',
   '{2950}', null)
on conflict do nothing;

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, public_read, ui)
values
  ('data_tables', 'older_tables_moved',
   'false'::jsonb, 'false'::jsonb, 'boolean',
   'This organization''s data tables live in the record store',
   'Says where this organization''s data tables actually are. Off, and every screen reads them '
   || 'out of the older store exactly as it does today. On, and they are read out of the '
   || 'unified record store, where the same tables have views, archive, forms and history - '
   || 'and where a column pointing at another table shows that record''s name rather than its '
   || 'identifier. It is turned on only by the move, which copies every row into the store '
   || 'under its own identifier first, archives the older table second, and leaves the old '
   || 'link working: it sends you to the same table in its new home and says so. Turning it '
   || 'off again sends the screens back to the older tables, which are archived rather than '
   || 'emptied and are brought back by one call.',
   'agent',
   'OLD-TABLES-CUTOVER rev 2 (2026-09-22), W7, chair ruling of the same day: the move is '
   || 'ADDITIVE - copy under the same ids, archive the source with a pointer, flip this knob, '
   || 'keep the old link redirecting. Reversible by unarchiving the datasets and removing the '
   || 'override. The default here is the PLATFORM default and is not any organization''s to '
   || 'change; a per-organization value is a platform.knob_override row written through '
   || 'platform.knob_override_set. Written by matrx_records.movers.move; read by matrx-frontend '
   || 'features/data-tables/older-tables-moved.ts.',
   (current_date + 30),
   array['organization']::text[],
   'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;
