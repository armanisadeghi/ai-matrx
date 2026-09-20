-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.conversation_scope_bind(uuid, uuid, uuid) 827810c8ad72f9fcb8501e6c1369db3c6220fe15822273c578b2783f8a936b99
--
-- RE-BINDING THE SAME RECORD RAISED, AND THE SENTENCE MEANT NOTHING TO ANYBODY.
--
-- Lane TALK-TO-RECORD, 2026-09-20, measured by its own suite on the main database:
-- opening the same record's chat twice answered
--   `ON CONFLICT DO UPDATE command cannot affect row a second time` (21000).
-- `platform.associations` carries `trg_associations_revive_tombstone`, which brings a
-- tombstoned edge back INSIDE the insert; combined with this door's own
-- `ON CONFLICT … DO UPDATE` the same row was reached twice in one command. The ON CONFLICT
-- was never the point — "bind this conversation to this record" is idempotent by nature —
-- so it becomes what it always meant: revive-or-write, said in two plain statements that
-- no trigger can double.

create or replace function custom.conversation_scope_bind(p_organization_id uuid, p_conversation_id uuid,
                                                          p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
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
     and a.target_type = 'custom_record'
     and a.role = 'record_scope'
     and a.deleted_at is null
     and a.target_id is distinct from p_record_id;

  -- REVIVE-OR-WRITE, in two statements. A tombstoned edge coming back IS a write and is
  -- judged as one by `platform.enforce_client_association_endpoint_access` — which this
  -- SECURITY DEFINER body stands outside, having already made both decisions above itself.
  update platform.associations a
     set deleted_at = null, deleted_via_type = null, deleted_via_id = null,
         label = v_title, metadata = v_meta, created_by = coalesce(a.created_by, v_me)
   where a.source_type = 'conversation'
     and a.source_id = p_conversation_id
     and a.target_type = 'custom_record'
     and a.target_id = p_record_id
     and a.role = 'record_scope';

  if not found then
    insert into platform.associations
      (source_type, source_id, target_type, target_id, role, organization_id, label, metadata, created_by)
    values
      ('conversation', p_conversation_id, 'custom_record', p_record_id, 'record_scope',
       p_organization_id, v_title, v_meta, v_me);
  end if;

  return jsonb_build_object('bound', true, 'readable', true,
                            'record_id', p_record_id, 'table_id', v_table,
                            'scope_type', v_name, 'title', v_title);
end;
$fn$;

comment on function custom.conversation_scope_bind(uuid, uuid, uuid) is
  'TALK-TO-RECORD / AGT-N-9: point a conversation at one record. Idempotent — revive-or-write, '
  'never ON CONFLICT, because platform.associations revives a tombstone inside the insert.';
