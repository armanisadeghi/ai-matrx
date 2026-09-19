-- chair-step: it calls `platform.reopen_declared_doors('custom')` so the two doors it declares actually reach a
--   signed-in caller — a GRANT, which the additive allow-list refuses by name. Everything else is one
--   `create or replace` with its `-- based-on:` line, two NEW functions and two rows in
--   platform.client_callable_door.
-- guard: custom/system_enabled
--
-- based-on: custom.read_record(uuid, uuid, boolean) 8fd819b997c8ce42abcc38eb6c7a64cd484a615c0eb7fa45bf429adb28927267
--
-- STORE-REL 5 — T5. THE MERGE, AS A CLIENT SEES IT.
--
-- T5's last three clauses all failed for the same reason: the merge DID the right thing and no
-- door would say so.
--
--   1. THE ALTERNATES WERE STRIPPED. `custom.migrate_merge` keeps the loser's phone number as
--      an alternate with its source — the store answers
--      `phone | "555-0101" | [{"rank": 1, "value": "555-0202", "source": …}]` through
--      `custom.record_values_versioned`. But `custom.read_record` builds its document from
--      `custom.record_values`, which strips `_values` and `_sources` wholesale, so a screen
--      shows ONE number and the other is invisible. The merge preserved it and the read door
--      threw it away.
--   2. THE MERGED-AWAY ID RESOLVED NOWHERE. `custom.resolve_id` already walks the alias chain
--      correctly and already honours a REVOKED alias, which is what makes undo work — but it
--      is server-only, and `custom.read_record` never asked it, so the loser's id answered
--      *"There is no record b132bdab… in this organization"*. REC-21 is "the losing id
--      resolves to the winner forever", and a resolver nothing calls resolves nothing.
--   3. UNDO WAS SERVER-ONLY. `history.migration_undo` works — as the database owner it
--      restores both records and revokes the alias — and `permission denied for function
--      migration_undo` is what a person got. Schema `history` is declared closed and stays
--      closed: every client reach into it is a declared door in `custom`, so this adds one.
--
-- WHAT THIS FILE DOES.
--   · `custom.read_record` follows the alias chain, reads the record it lands on, and SAYS SO
--     in `_redirected_from` — a marker, not a silent substitution. After an undo the alias is
--     revoked, `custom.resolve_id` answers with the id it was given, and the loser resolves to
--     itself again with no marker.
--   · `custom.read_record` carries `_alternates` for every key the reader may see, hydrated
--     with each alternate's source, from the same place `custom.record_values_versioned` reads.
--     A masked field carries no alternates, because an alternate is the value.
--   · `custom.record_resolve` — the resolver, as a door, so a link that was merged away can be
--     followed by anything, not only by a read.
--   · `custom.migrate_undo` — undo, decided at editor on the record the Migration was about.
--
-- INVERSE: migrations/inverse/storerel_the_merge_answers_a_client_down.sql

set lock_timeout = '3s';
set statement_timeout = '2min';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE READ DOOR: it follows the merge, and it carries what the merge kept
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_table    uuid;
  v_doc      jsonb;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_now      uuid;
  v_alts     jsonb;
  v_out      jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE. `custom.resolve_id` walks the whole
  -- chain and ignores a REVOKED alias, so an undone merge puts the id back to itself. The
  -- read then happens on the record the id MEANS, and the answer SAYS which id was asked
  -- for — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);

  select r.table_id, custom.record_values(r.organization_id, r.id)
    into v_table, v_doc
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_now and r.deleted_at is null;
  if not found then
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000', hint = 'It was deleted, or it never existed here.';
  end if;

  if not custom.has_visibility(v_me, 'record', v_now, 'viewer') then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an export, not an agent. Ask somebody who holds it to share it with you.';
  end if;

  v_level := custom.effective_level(v_me, p_organization_id, v_now);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, v_table, v_level, 'read') f;

  -- EVERY key this Table has a Field record for, visible or not. The difference between
  -- this list and v_visible is what masking is about; a key in NEITHER is undeclared.
  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')) , '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb)
    into v_notices, v_key_ids
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and not (f.data ->> 'key' = any (v_visible));

  v_out := custom.mask_document(v_doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared);

  -- T5 / REC-N-11. THE ALTERNATES THE MERGE KEPT. Two Chens become one Person and BOTH phone
  -- numbers survive, each with its source — and until now the read door showed one of them.
  -- Only for keys this reader may see: an alternate IS the value, so a masked field's
  -- alternates are masked with it.
  select jsonb_object_agg(k, alts) into v_alts
    from (
      select e.key as k,
             (select jsonb_agg(jsonb_build_object(
                       'value',  a -> 'value',
                       'rank',   a -> 'rank',
                       'source', r.data -> '_sources' -> (a ->> 'src'))
                     order by (a ->> 'rank')::int)
                from jsonb_array_elements(coalesce(e.value -> 'alternates', '[]'::jsonb)) a) as alts
        from custom.record r
        cross join lateral jsonb_each(coalesce(r.data -> '_values', '{}'::jsonb)) e
       where r.organization_id = p_organization_id and r.id = v_now
         and e.key = any (v_visible)
         and jsonb_array_length(coalesce(e.value -> 'alternates', '[]'::jsonb)) > 0
    ) x
   where x.alts is not null;

  if v_alts is not null and v_alts <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_alternates', v_alts);
  end if;

  if v_now is distinct from p_record_id then
    v_out := v_out || jsonb_build_object(
      '_redirected_from', p_record_id,
      '_redirect_says', 'That record was merged into this one, so its id now answers with this record. REC-21: the merged id resolves to the survivor for good — undoing the merge puts both records and both ids back.');
  end if;

  return v_out;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE RESOLVER, AS A DOOR
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.record_resolve(p_organization_id uuid, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_now  uuid;
  v_live boolean;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_resolve');
  if p_id is null then
    raise exception 'custom.record_resolve: which id?' using errcode = '22004';
  end if;

  -- RESOLVE FIRST, DECIDE SECOND. The id a merge sent away is not itself a secret; what it
  -- resolves TO is a record, and that record is decided on the one ladder like everything
  -- else. A caller who may not open the survivor gets the same refusal they would get by
  -- asking for the survivor directly.
  v_now := custom.resolve_id(p_organization_id, p_id);
  perform custom.assert_client_may_open(p_organization_id, v_now, 'custom.record_resolve',
                                        'viewer'::public.permission_level, 'record');

  select exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_now
                    and r.deleted_at is null)
    into v_live;

  return jsonb_build_object(
    'asked',       p_id,
    'resolves_to', v_now,
    'redirected',  v_now is distinct from p_id,
    'live',        v_live,
    'says', case
              when v_now is distinct from p_id
                then 'That record was merged into another one, and its id answers with the survivor.'
              when v_live then 'That id is its own record.'
              else 'That id is its own record, and the record is in the trash.'
            end);
end;
$function$;

comment on function custom.record_resolve(uuid, uuid) is
  'REC-21 / REC-22 / T5. What an id MEANS today: itself, or the record it was merged into. Undoing a merge revokes the alias, and the id resolves to itself again.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- UNDO, AS A DOOR
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.migrate_undo(p_organization_id uuid, p_log_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_target uuid;
  v_verb   text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_undo');
  if p_log_id is null then
    raise exception 'custom.migrate_undo: which Migration?' using errcode = '22004';
  end if;

  select coalesce(nullif(l.inverse ->> 'record_id', '')::uuid, l.target_id), l.verb
    into v_target, v_verb
    from history.migration_log l
   where l.organization_id = p_organization_id and l.id = p_log_id;
  if v_target is null and v_verb is null then
    raise exception 'There is no Migration % on the record for this organization.', p_log_id
      using errcode = '02000';
  end if;

  -- THE ONE LADDER, on the record the Migration was about. Undoing a merge WRITES — it
  -- restores the loser and revokes its alias — so it asks the same question every other
  -- write in this store asks, at the same level.
  perform custom.assert_client_may_change(p_organization_id, v_target, 'custom.migrate_undo',
                                          'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_undo');

  -- The undo itself is unchanged: `history.migration_undo` writes through the store's own
  -- verbs, and schema `history` stays closed to clients — this door is the reach into it.
  return history.migration_undo(p_organization_id, p_log_id);
end;
$function$;

comment on function custom.migrate_undo(uuid, uuid) is
  'REC-20 / HIS-8 / T5. Undo a Migration from a client seat, decided at editor on the record it was about. The one reach into schema history, which stays closed.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values
  ('custom', 'record_resolve', 'p_organization_id uuid, p_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'REC-21 says a merged-away id resolves to the survivor forever, and until now nothing a client could call did that, so every old link and every stored reference answered "there is no record". p_organization_id is never NULL and the id this resolves TO is decided at viewer through custom.has_visibility before anything about it is returned, so the answer never tells a caller about a record they could not have opened directly.',
   'migrations/campaign/storerel_the_merge_answers_a_client.sql',
   true, false),
  ('custom', 'migrate_undo', 'p_organization_id uuid, p_log_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'REC-20 says every Migration verb is reversible, and undo was reachable only by the database owner - so a person who merged the wrong two records could not put them back. p_organization_id is never NULL and the record the Migration was about is decided at editor through custom.has_visibility before the undo runs. Schema history stays closed: this is the declared reach into it.',
   'migrations/campaign/storerel_the_merge_answers_a_client.sql',
   true, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

select * from platform.reopen_declared_doors('custom');
