-- chair-step: inverse of sc4_a_conversation_is_about_a_record_under_the_store_token.sql — puts back the three conversation-scope bodies byte for byte as they stood on production before it (the binding is written under `custom_record` again), drops the guard that refuses a new live `custom_record` edge, and re-creates the three tag-follow triggers without `record_scope`. A binding already written under `record` stays (soft state, never deleted) and is no longer read by these bodies.
-- based-on: custom.conversation_scope_bind(uuid, uuid, uuid) 11b8334ec0ce56ea546cd534bc3a94831daab9536b0313afb4b3d8c15e676fff
-- based-on: custom.conversation_scope_unbind(uuid, uuid) ebef72d424d649765dafaac7a089568bc63c9d1b51a3451cef799978f1c9f7c7
-- based-on: custom.conversation_scope(uuid, uuid) 03b964b86bdd841586709572e59cd3c7b6703a16fbee2746fb7b80fc66dd4b09
-- window-class: DROP TRIGGER takes ACCESS EXCLUSIVE on platform.associations plus the 23 auth/storage/realtime
--   relations supautils declares, for this transaction (short; sign-in waits a moment). On production
--   run it in the 1-4 AM Pacific window, under lock_timeout.
set local lock_timeout = '2s';

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
$function$
;

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
     and a.target_type = 'custom_record'
     and a.role = 'record_scope'
     and a.organization_id = p_organization_id
     and a.deleted_at is null;
  get diagnostics v_n = row_count;

  return jsonb_build_object('bound', false, 'released', v_n,
    'because', case when v_n = 0 then 'This conversation was not about a record.'
                    else 'This conversation is no longer about a particular record.' end);
end;
$function$
;

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
     and a.target_type = 'custom_record'
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
$function$
;

drop trigger if exists _aa_no_new_custom_record_edge on platform.associations;
drop function if exists platform._no_new_custom_record_edge();

create or replace trigger zz_context_tag_follow_ins
  after insert on platform.associations
  for each row when (new.target_type = 'scope' or new.role = 'context_tag')
  execute function platform._context_tag_follow_to_the_copy();

create or replace trigger zz_context_tag_follow_upd
  after update on platform.associations
  for each row when (old.target_type = 'scope' or new.target_type = 'scope'
                     or old.role = 'context_tag' or new.role = 'context_tag')
  execute function platform._context_tag_follow_to_the_copy();

create or replace trigger zz_context_tag_follow_del
  after delete on platform.associations
  for each row when (old.target_type = 'scope' or old.role = 'context_tag')
  execute function platform._context_tag_follow_to_the_copy();
