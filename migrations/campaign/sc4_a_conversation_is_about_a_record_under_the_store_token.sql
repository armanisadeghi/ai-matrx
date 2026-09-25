-- chair-step: this makes `record` the only store token anything new may write (lane SC-4, the owner's coordinator ruling of 2026-09-25: "`custom_record` is the dead tier-2 table and nothing new may write it"). It REPLACES three function bodies — custom.conversation_scope_bind now writes a conversation's record binding as `conversation -> record` (role record_scope) and retires any binding left under `custom_record`; custom.conversation_scope_unbind and custom.conversation_scope read both tokens so nothing written before is lost — ADDS one guard trigger on platform.associations that refuses making or reviving a live edge under `custom_record`, and RE-CREATES the three tag-follow triggers with `record_scope` in their WHEN, so a binding to a copied scope re-arms the follow exactly as a tag does (the copy counts a binding as the same edge). 0 live or tombstoned `custom_record` edges exist on production, so no row moves. Inverse: migrations/inverse/sc4_a_conversation_is_about_a_record_under_the_store_token_down.sql.
-- lane: SC-4 (PICKER-AND-TAGS: one store token)
-- window-class: CREATE TRIGGER / CREATE OR REPLACE TRIGGER take SHARE ROW EXCLUSIVE on
--   platform.associations for this transaction (tag writes wait a moment); function bodies
--   otherwise. Applied directly per the owner's ruling of 2026-09-24 ~17:30 PT, under lock_timeout.
-- based-on: custom.conversation_scope_bind(uuid, uuid, uuid) 47ac4754fd12c50bf4f46d97911444f603a240561fbded3a19c0d5150ccf0794
-- based-on: custom.conversation_scope_unbind(uuid, uuid) 2e4daaf734dbaa65d5584aa9cea569a9e23810b83d3f27f3b47ba86dd9c87559
-- based-on: custom.conversation_scope(uuid, uuid) 5a165a829ce0f4482491cbecae0c2ea2e12a371dbc2d29cd31677492452cd365
--
-- THE USE CASE. Priya opens a coding chat "about" Harborline Dispatch (the record-scope binding,
-- AGT-N-9). Until tonight that binding was written `conversation -> custom_record` — a second
-- token for a store Record beside `record`, the token the store's relations, cascades and the
-- context tag copies use. Two tokens for one kind of end is how a reader counts one thing twice
-- or misses it. From tonight the binding is `conversation -> record`, and the database refuses
-- any new live `custom_record` edge by name, whoever writes it.

set local lock_timeout = '30s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION custom.conversation_scope_bind(p_organization_id uuid, p_conversation_id uuid, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := auth.uid();
  v_table uuid;
  v_name  text;
  v_title text;
  v_meta  jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.conversation_scope_bind');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.conversation_scope_bind');

  -- THE RECORD, ON THE ONE LADDER. A person who may not open the record may not point a
  -- conversation at it, because the binding is what puts the record into a prompt.
  if not custom.has_visibility(v_me, 'record', p_record_id, 'viewer') then
    raise exception 'You do not have access to that record, so a conversation cannot be about it.'
      using errcode = '42501',
            hint = 'AGT-N-9: the binding is what puts a record into a prompt, so it takes the same '
                   'viewer level the read door takes. Ask somebody who holds it to share it with you.';
  end if;

  -- THE CONVERSATION, ON ITS OWN LADDER — and deliberately not the store's. A conversation
  -- is not a Record of this store; `custom.has_visibility` cannot decide a row it has never
  -- heard of, and `iam.has_access` is the platform ladder that owns `chat.conversation`.
  if not coalesce(iam.has_access('conversation', p_conversation_id, 'editor'::public.permission_level), false) then
    raise exception 'That conversation is not yours to point at a record.'
      using errcode = '42501',
            hint = 'A conversation is bound by somebody who may write in it.';
  end if;

  select r.table_id,
         coalesce(nullif(t.data ->> 'label_singular', ''), nullif(t.data ->> 'name', ''), 'Record'),
         coalesce(nullif(btrim(coalesce(r.data ->> nullif(t.data ->> 'title_field', ''), '')), ''), 'Untitled')
    into v_table, v_name, v_title
    from custom.record r
    left join custom.record t
      on t.organization_id = r.organization_id and t.id = r.table_id
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;

  if not found then
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000';
  end if;

  v_meta := jsonb_build_object('scope_type', v_name, 'scope_type_id', v_table,
                               'bound_by_door', 'custom.conversation_scope_bind');

  -- ONE SCOPE PER CONVERSATION. Pointing a conversation at a DIFFERENT record retires the
  -- old edge rather than leaving two, because "what is this chat about" may only have one
  -- answer.
  update platform.associations a
     set deleted_at = now(), deleted_via_type = 'conversation', deleted_via_id = p_conversation_id
   where a.source_type = 'conversation'
     and a.source_id = p_conversation_id
     and a.target_type in ('record', 'custom_record')   -- SC-4: `record` is the store's token; a
     and a.role = 'record_scope'                         -- binding left under the retired one is retired too
     and a.deleted_at is null
     and (a.target_id is distinct from p_record_id or a.target_type = 'custom_record');

  -- REVIVE-OR-WRITE, in two statements. A tombstoned edge coming back IS a write and is
  -- judged as one by `platform.enforce_client_association_endpoint_access` — which this
  -- SECURITY DEFINER body stands outside, having already made both decisions above itself.
  update platform.associations a
     set deleted_at = null, deleted_via_type = null, deleted_via_id = null,
         label = v_title, metadata = v_meta, created_by = coalesce(a.created_by, v_me)
   where a.source_type = 'conversation'
     and a.source_id = p_conversation_id
     and a.target_type = 'record'
     and a.target_id = p_record_id
     and a.role = 'record_scope';

  if not found then
    insert into platform.associations
      (source_type, source_id, target_type, target_id, role, organization_id, label, metadata, created_by)
    values
      ('conversation', p_conversation_id, 'record', p_record_id, 'record_scope',
       p_organization_id, v_title, v_meta, v_me);
  end if;

  return jsonb_build_object('bound', true, 'readable', true,
                            'record_id', p_record_id, 'table_id', v_table,
                            'scope_type', v_name, 'title', v_title);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.conversation_scope_unbind(p_organization_id uuid, p_conversation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_n integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.conversation_scope_unbind');

  if not coalesce(iam.has_access('conversation', p_conversation_id, 'editor'::public.permission_level), false) then
    raise exception 'That conversation is not yours to change.'
      using errcode = '42501';
  end if;

  update platform.associations a
     set deleted_at = now(), deleted_via_type = 'conversation', deleted_via_id = p_conversation_id
   where a.source_type = 'conversation'
     and a.source_id = p_conversation_id
     and a.target_type in ('record', 'custom_record')   -- SC-4: the store's token, and any binding left under the retired one
     and a.role = 'record_scope'
     and a.organization_id = p_organization_id
     and a.deleted_at is null;
  get diagnostics v_n = row_count;

  return jsonb_build_object('bound', false, 'released', v_n,
    'because', case when v_n = 0 then 'This conversation was not about a record.'
                    else 'This conversation is no longer about a particular record.' end);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.conversation_scope(p_organization_id uuid, p_conversation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := auth.uid();
  v_row   record;
  v_title text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.conversation_scope');

  select a.target_id, a.metadata, a.created_at, a.created_by
    into v_row
    from platform.associations a
   where a.source_type = 'conversation'
     and a.source_id   = p_conversation_id
     and a.target_type in ('record', 'custom_record')   -- SC-4: `record` is written; the retired token is still read
     and a.role        = 'record_scope'
     and a.organization_id = p_organization_id
     and a.deleted_at is null
   order by a.created_at desc
   limit 1;

  if v_row.target_id is null then
    return jsonb_build_object('bound', false,
      'because', 'This conversation is not about a particular record.');
  end if;

  -- THE BINDING IS NOT THE PERMISSION. A conversation can stay bound to a record that was
  -- later unshared; the answer says so plainly instead of pretending the scope is gone.
  if not custom.has_visibility(v_me, 'record', v_row.target_id, 'viewer') then
    return jsonb_build_object('bound', true, 'readable', false,
      'record_id', v_row.target_id,
      'because', 'This conversation is about a record you may no longer open, so nothing of it '
                 'reaches the agent. Ask somebody who holds it to share it with you.');
  end if;

  select coalesce(nullif(btrim(coalesce(r.data ->> nullif(t.data ->> 'title_field', ''), '')), ''),
                  'Untitled')
    into v_title
    from custom.record r
    left join custom.record t
      on t.organization_id = r.organization_id and t.id = r.table_id
   where r.organization_id = p_organization_id and r.id = v_row.target_id;

  return jsonb_build_object(
    'bound', true, 'readable', true,
    'record_id', v_row.target_id,
    'table_id', v_row.metadata -> 'scope_type_id',
    'scope_type', v_row.metadata ->> 'scope_type',
    'title', v_title,
    'bound_at', v_row.created_at,
    'bound_by', v_row.created_by);
end;
$function$;

-- ── THE GUARD: no new live edge under the retired token ────────────────────────────────────
create function platform._no_new_custom_record_edge()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
begin
  -- Tombstoning a legacy edge is always allowed; only MAKING or REVIVING a live one is refused.
  if new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is null
     and old.source_type is not distinct from new.source_type
     and old.target_type is not distinct from new.target_type then
    return new;   -- an already-live legacy row being edited in place (none exist) is not a new write
  end if;
  raise exception 'A % -> % edge names the retired token custom_record; a record-store Record is `record`.',
                  new.source_type, new.target_type
    using errcode = '23514',
          hint = 'SC-4 (2026-09-25): `custom_record` is the retired tier-2 table platform.custom_record and nothing new may write it. Write the same edge with `record` (the store''s token), e.g. custom.conversation_scope_bind for a conversation''s record. Nothing was written.';
end;
$fn$;

comment on function platform._no_new_custom_record_edge() is
  'SC-4. Refuses making or reviving a live platform.associations edge whose source or target token is '
  'the retired custom_record; tombstones pass. The store''s token is record.';

create trigger _aa_no_new_custom_record_edge
  before insert or update on platform.associations
  for each row when (new.source_type = 'custom_record' or new.target_type = 'custom_record')
  execute function platform._no_new_custom_record_edge();

-- ── THE FOLLOW HEARS A BINDING TOO ──────────────────────────────────────────────────────────
create or replace trigger zz_context_tag_follow_ins
  after insert on platform.associations
  for each row when (new.target_type = 'scope' or new.role in ('context_tag', 'record_scope'))
  execute function platform._context_tag_follow_to_the_copy();

create or replace trigger zz_context_tag_follow_upd
  after update on platform.associations
  for each row when (old.target_type = 'scope' or new.target_type = 'scope'
                     or old.role in ('context_tag', 'record_scope') or new.role in ('context_tag', 'record_scope'))
  execute function platform._context_tag_follow_to_the_copy();

create or replace trigger zz_context_tag_follow_del
  after delete on platform.associations
  for each row when (old.target_type = 'scope' or old.role in ('context_tag', 'record_scope'))
  execute function platform._context_tag_follow_to_the_copy();
