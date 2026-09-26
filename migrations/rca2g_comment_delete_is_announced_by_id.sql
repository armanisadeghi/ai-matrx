-- rca2g_comment_delete_is_announced_by_id
--
-- RC-A2g (register row RC-A2). Since RC-A2b a soft-deleted comment is hidden from everyone but its
-- author — the table policy that also authorizes the realtime feed — so the UPDATE that deletes a
-- comment is never delivered to the other people looking at the record, and the card stayed on
-- their screens until they reloaded (an undelete had the same gap in reverse).
--
-- THE FIX, on the platform's own broadcast primitive (platform.realtime_topic_prefix +
-- platform.realtime_topic_admits, the realtime.messages policy platform_topics_admit_their_own,
-- the knob platform/realtime_broadcast_enabled):
--   1. topic `comments:<entity_type>:<entity_id>` — PRIVATE, one per record; a socket joins it only
--      when the signed-in person can VIEW that record (iam.has_access), exactly the people who may
--      see its comments. A detail token is never a comment topic.
--   2. one AFTER UPDATE OF deleted_at trigger on platform.comments announces
--      `comment.deleted` / `comment.restored` with ids and the op ONLY — never text — so every
--      path (cmt_delete, entity_soft_delete, entity_undelete, a server write) is covered once.
--      A person's write never fails because its announcement did: a failure is recorded in
--      ops.system_error and the write goes on.
-- The client subscribes to the topic with { private: true } and, on either event, re-reads the
-- thread through its door (cmt_list). The table's postgres_changes feed stays authorized by the
-- unchanged read policy.
-- Forcing suite: aidream db/tests/test_rca2g_comment_delete_is_announced_by_id.py (RCA2G_BEFORE=1 red).
-- Lock: CREATE TRIGGER takes SHARE ROW EXCLUSIVE on platform.comments (under 100 rows) for the
-- statement only — reads are never blocked; no policy DDL, so no auth/storage/realtime freeze.

set local lock_timeout = '2s';

create or replace function platform.comments_topic_admits(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_type text;
  v_id   uuid;
  m      text[];
begin
  -- THE GRAMMAR: comments:<token>:<uuid>. Anything else is not this schema's topic.
  m := regexp_match(p_topic, '^comments:([a-z][a-z0-9_]*):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$');
  if m is null then return false; end if;
  v_type := m[1]; v_id := m[2]::uuid;
  if (select auth.uid()) is null then return false; end if;       -- a person, signed in
  if platform.token_is_detail(v_type) then return false; end if;  -- a comment is never a record here
  -- The people who may see a record's comments are the people who may view the record.
  return iam.has_access(v_type, v_id, 'viewer'::public.permission_level);
end;
$function$;

-- DD-223: the access decision is declared IN DATA before any grant. Same shape as the three
-- topic-admit functions already registered (custom, platform, scheduler).
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                           reason, declared_by, signed_in_callers, anonymous_callers)
values ('platform', 'comments_topic_admits', 'p_topic text', array['text'::regtype]::oid[],
        'Not a door a screen calls: it is reached only through platform.realtime_topic_admits, the USING clause of the one RLS policy on realtime.messages, which Postgres evaluates AS the subscribing role. It takes no organization and no identity argument (the seat comes from the session) and answers only true/false about a topic string the caller already knows — true exactly when iam.has_access(<entity_type>, <entity_id>, viewer) is true for the signed-in person, which that person can already ask iam.has_access directly — so a client calling it learns nothing it could not learn by trying to subscribe.',
        'rca2g_comment_delete_is_announced_by_id.sql', true, false);
grant execute on function platform.comments_topic_admits(text) to authenticated;

comment on function platform.comments_topic_admits(text) is
  'RC-A2g: admits a socket to the private topic comments:<entity_type>:<entity_id> only when the signed-in person can view that record. Registered in platform.realtime_topic_prefix.';

insert into platform.realtime_topic_prefix (prefix, admits_fn, description)
values ('comments', 'platform.comments_topic_admits(text)'::regprocedure,
        'One private topic per record (comments:<entity_type>:<entity_id>) announcing that a comment on it was deleted or restored. The payload is ids and the op only; the subscriber re-reads the thread through cmt_list. Admission is viewer on the record — exactly who may see its comments (RC-A2g).')
on conflict (prefix) do nothing;

create or replace function platform._comments_announce_delete()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_op    text := case when new.deleted_at is not null then 'deleted' else 'restored' end;
  v_topic text := 'comments:' || new.entity_type || ':' || new.entity_id::text;
begin
  -- RC-A2g: ids and the op, never text — the topic already names the record, and whoever joined it
  -- may view that record; the thread itself is re-read through its door.
  perform realtime.send(
    jsonb_build_object(
      'id',          gen_random_uuid(),
      'comment_id',  new.id,
      'entity_type', new.entity_type,
      'entity_id',   new.entity_id,
      'op',          v_op,
      'at',          to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    'comment.' || v_op,
    v_topic,
    true);
  return null;
exception when others then
  -- A person's delete or restore never fails because its announcement did; the miss is recorded.
  begin
    insert into ops.system_error (kind, error_type, error_text, source_feature, route, organization_id, payload)
    values ('realtime_notice_failed', sqlstate, sqlerrm, 'platform.comments', v_topic, new.organization_id,
            jsonb_build_object('topic', v_topic, 'comment_id', new.id, 'op', v_op));
  exception when others then
    raise warning 'platform._comments_announce_delete could not record its own failure on %: %', v_topic, sqlerrm;
  end;
  return null;
end;
$function$;

create trigger _announce_delete
  after update of deleted_at on platform.comments
  for each row
  when (old.deleted_at is distinct from new.deleted_at)
  execute function platform._comments_announce_delete();
