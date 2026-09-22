-- target: branch,production
-- additive: yes
--   It ADDS three functions under this lane's reserved prefix (`custom.comment_thread`,
--   `custom.comment_write`, `custom.comment_mention_deliver`) and their
--   `platform.client_callable_door` rows. It creates no table, column, trigger, policy or
--   enum, replaces no existing body, drops nothing, revokes nothing and rewrites no row.
--   `custom.io_comment_write`, `custom.io_comments` and `custom.io_comment_resolve` are
--   untouched: the new write door delegates the write to the first of them and the new read
--   door reads through the second, so there is exactly one writer and one reader of
--   `custom.io_comment` on this platform, as there was before.
--   The inverse is `migrations/inverse/histscreens_a_comment_can_name_somebody_down.sql`.
-- guard: custom/system_enabled
--
-- LANE HISTORY-SCREENS — PRODUCTS row 4, the second half: SCR-18 CommentThread.
-- Champion: Notion — page-level and block-level comments with their own resolution state,
-- separate from edit access, and an @mention that notifies the person named.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- A COMMENT WAS ALREADY A FIRST-CLASS THING. THE SCREEN WAS KEEPING ITS OWN.
-- ════════════════════════════════════════════════════════════════════════════════
--
-- `custom.io_comment` is a real table with a real organization wall; `custom.io_comments`,
-- `custom.io_comment_write` and `custom.io_comment_resolve` are real doors, and the write
-- door asks for `commenter` — the second rung — which is exactly what SCR-18 demands.
--
-- `@ai-matrx/records-ui`'s `CommentThread` used none of them. It declared a package-owned
-- system Table called `records_ui_comment` into whichever organization opened the screen and
-- wrote comments into it with `custom.record_write` — the same second store lane FORMS
-- removed for forms and lane DASHBOARDS removed for dashboards, on 2026-09-20, and it costs
-- the same things here plus one that is worse:
--
--   · **The rung was wrong in BOTH directions.** Writing a comment went through the RECORD
--     write door, so a `commenter` — somebody whose whole level exists to let them comment
--     and not edit — could not comment at all; and anybody holding `editor` on the
--     package's own comment Table could write a comment about a record they may not open,
--     because the check was against the comment row, not the record.
--   · **Nothing else could see them.** An agent asked "what did people say about this job"
--     had no door to read, because the shape lived in a browser.
--   · **No mentions, and nowhere to put them.**
--
-- This file adds the two things the store's own doors were missing — the people's NAMES, and
-- a mention that reaches somebody — and the package repoints at them.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- A MENTION IS A REFERENCE, NOT A REGEX
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Notion, Linear and Slack all resolve a mention at the moment it is typed, from a picker,
-- and store an id. Parsing `@` out of the body afterwards means a person called Sam who
-- writes "email @sam" about a different Sam notifies the wrong one, and a rename breaks
-- every historical mention. So `custom.comment_write` takes the ids, validates them, stores
-- them on the comment's own `anchor` under `mentions`, and delivers.
--
-- **AND IT REFUSES TO NOTIFY SOMEBODY WHO CANNOT OPEN THE RECORD, BY NAME.** A notification
-- saying "Priya mentioned you on Roof repair" that lands on a person who then meets "you do
-- not have access to this record" is a dead end with a remedy nobody can act on, and it also
-- tells them the record exists. The refusal names the person and says the remedy is to share
-- the record with them first — which is one click away on the same screen.

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.comment_mention_deliver — one message per mention, through the ONE sender.
--
-- `communication.notification` IS the notification system on this platform: channel,
-- recipient, dedupe key, retry counter, lease, worker. `custom.agg_deliver` is the
-- subscription lane into it and its dedupe key is `(rule, record, day)` — right for "tell me
-- when this view changes", wrong for a comment, where two mentions of the same person on the
-- same record on the same day are two different things somebody said. So this writes its own
-- row with its own key, `custom.mention:<comment>:<person>`, and nothing else differs.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.comment_mention_deliver(p_organization_id uuid, p_record_id uuid,
                                               p_table_id uuid, p_comment_id uuid,
                                               p_recipient uuid, p_author_name text,
                                               p_record_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_id uuid;
begin
  insert into communication.notification
    (organization_id, event_key, channel, recipient_user_id, recipient_kind,
     dedupe_key, subject, body, payload, target_kind, target_id, deep_link, visibility)
  values
    (p_organization_id, 'custom.comment.mention', 'in_app', p_recipient, 'user',
     format('custom.mention:%s:%s', p_comment_id, p_recipient),
     format('%s mentioned you on %s', coalesce(p_author_name, 'Somebody'),
            coalesce(nullif(btrim(coalesce(p_record_title, '')), ''), 'a record')),
     -- The comment itself, trimmed to a line a person reads in a list. The whole thing is
     -- one click away and this store never keeps a second copy of it.
     left(btrim(coalesce(p_body, '')), 280),
     jsonb_build_object('comment_id', p_comment_id, 'record_id', p_record_id,
                        'table_id', p_table_id, 'source', 'comment_mention'),
     'custom.record', p_record_id,
     case when p_table_id is null then null
          else format('/data-v2/%s?record=%s&comment=%s', p_table_id, p_record_id, p_comment_id)
     end,
     'personal'::platform.visibility)
  -- IDEMPOTENT AS A CONSTRAINT. The key is UNIQUE, so replaying a write does not send twice.
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  return v_id;
end;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'comment_mention_deliver',
        'p_organization_id uuid, p_record_id uuid, p_table_id uuid, p_comment_id uuid, p_recipient uuid, p_author_name text, p_record_title text, p_body text',
        array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype,
              'uuid'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
        'It is never reached with a caller''s arguments. Its one caller is custom.comment_write, which has already run custom.assert_store_door for the organization, been admitted at the commenter rung on the record by custom.io_comment_write, confirmed the recipient is a MEMBER of that same organization, and confirmed the recipient holds at least viewer on that same record — so a message is only ever written about a record its recipient may already open, inside the organization both of them belong to. It writes one row of communication.notification and reads nothing.',
        'histscreens_a_comment_can_name_somebody.sql',
        'server_only: sending is what a door DOES, never something a client asks for on its own — a client-callable sender would let any signed-in person put any sentence in anybody''s inbox. A person reaches it by writing a comment that names somebody, which is custom.comment_write.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.comment_write — the store's own comment door, plus the people it names.
--
-- The WRITE is `custom.io_comment_write` and nothing else: the rung, the organization wall,
-- the refusal that does not admit the record exists, the parent check and the insert all
-- stay in the one body that has always owned them. This door adds the mention list, the
-- validation of it, and the delivery.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.comment_write(p_organization_id uuid, p_record_id uuid, p_body text,
                                     p_anchor jsonb default '{}'::jsonb,
                                     p_parent_comment_id uuid default null,
                                     p_mentions uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_user     uuid := custom.query_principal();
  v_ids      uuid[] := array(select distinct m from unnest(coalesce(p_mentions, array[]::uuid[])) m
                              where m is not null and m <> v_user);
  v_people   jsonb;
  v_comment  uuid;
  v_table    uuid;
  v_titlek   text;
  v_title    text;
  v_who      uuid;
  v_sent     integer := 0;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.comment_write');

  -- EVERY MENTION IS JUDGED BEFORE THE COMMENT IS WRITTEN, so a refusal never leaves a
  -- half-sent thread behind: the whole statement is one transaction and a refusal here
  -- means nothing was said at all.
  if coalesce(array_length(v_ids, 1), 0) > 0 then
    v_people := custom.history_people(p_organization_id, v_ids);
    foreach v_who in array v_ids loop
      if not (v_people ? v_who::text) then
        raise exception 'You can only mention people who are in this organization, and one of the people you named is not.'
          using errcode = '23503',
                hint = 'Pick the person from the list the box offers — it is this organization''s own members. Somebody outside it is reached by inviting them, not by naming them in a comment.';
      end if;
      -- THE DEAD END THIS REFUSES. Telling somebody they were mentioned on a record they
      -- cannot open is a notification whose only possible outcome is a refusal — and it
      -- also tells them the record exists.
      if not custom.has_visibility(v_who, 'record', p_record_id, 'viewer'::public.permission_level) then
        raise exception '% cannot see this record yet, so mentioning them here would send them somewhere they cannot go.',
                        coalesce(v_people -> v_who::text ->> 'name', 'That person')
          using errcode = '42501',
                hint = 'Share the record with them first — viewer is enough to read a thread — and then mention them. Sharing is on this same screen.';
      end if;
    end loop;
  end if;

  -- THE ONE WRITER. Every check that has ever guarded a comment still runs, in its own body.
  v_comment := custom.io_comment_write(
                 p_organization_id, p_record_id, p_body,
                 coalesce(p_anchor, '{}'::jsonb)
                   || case when coalesce(array_length(v_ids, 1), 0) = 0 then '{}'::jsonb
                           else jsonb_build_object('mentions', to_jsonb(v_ids)) end,
                 p_parent_comment_id);

  if coalesce(array_length(v_ids, 1), 0) > 0 then
    select c.table_id into v_table
      from custom.io_comment c
     where c.organization_id = p_organization_id and c.id = v_comment;
    select nullif(t.data ->> 'title_field', '') into v_titlek
      from custom.record t
     where t.organization_id = p_organization_id and t.id = v_table
       and t.table_id = custom.table_kernel_id();
    if v_titlek is not null then
      v_title := custom.read_record(p_organization_id, p_record_id, true) ->> v_titlek;
    end if;

    foreach v_who in array v_ids loop
      if custom.comment_mention_deliver(
           p_organization_id, p_record_id, v_table, v_comment, v_who,
           coalesce(custom.history_people(p_organization_id, array[v_user]) -> v_user::text ->> 'name',
                    'Somebody'),
           v_title, p_body) is not null then
        v_sent := v_sent + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object('comment_id', v_comment,
                            'mentioned', to_jsonb(v_ids),
                            -- Said out loud, because "I mentioned three people" and "three
                            -- people were told" are different facts and a screen that
                            -- conflates them is lying quietly.
                            'notified', v_sent);
end;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values ('custom', 'comment_write',
        'p_organization_id uuid, p_record_id uuid, p_body text, p_anchor jsonb, p_parent_comment_id uuid, p_mentions uuid[]',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'jsonb'::regtype,
              'uuid'::regtype, 'uuid[]'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry and again by custom.assert_store_door inside custom.io_comment_write; NULL is refused there. p_record_id is checked by custom.io_comment_write at the COMMENTER rung, whose refusal is deliberately the same whether or not the record exists. p_body is stored as text and never executed. p_anchor is stored as data. p_parent_comment_id is matched together with the organization AND the record, so a reply cannot move a conversation. Every id in p_mentions must be a MEMBER of this organization and must already hold viewer on this record, both refused BY NAME before anything is written, so the argument can neither reach a stranger nor tell one that a record exists.',
        'histscreens_a_comment_can_name_somebody.sql',
        true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.comment_thread — the same thread `custom.io_comments` answers, said in names.
--
-- It reads THROUGH that door rather than beside it, so the viewer rung and the organization
-- wall are decided in exactly one place. What it adds is the two things a screen cannot
-- invent: who each person is, and what this caller may DO here — because a composer drawn
-- for somebody the store will refuse is the defect lane UI-HONEST spent a night removing.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.comment_thread(p_organization_id uuid, p_record_id uuid,
                                      p_include_resolved boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_user    uuid := custom.query_principal();
  v_people  jsonb;
  v_rows    jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.comment_thread');

  select custom.history_people(
           p_organization_id,
           array(select distinct u from (
                   select c.created_by as u from custom.io_comments(p_organization_id, p_record_id, true) c
                   union
                   select c.resolved_by from custom.io_comments(p_organization_id, p_record_id, true) c
                   union
                   select (m.value #>> '{}')::uuid
                     from custom.io_comments(p_organization_id, p_record_id, true) c,
                          lateral jsonb_array_elements(
                            case when jsonb_typeof(c.anchor -> 'mentions') = 'array'
                                 then c.anchor -> 'mentions' else '[]'::jsonb end) m) s(u)
                  where u is not null))
    into v_people;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', c.id,
             'body', c.body,
             'anchor', c.anchor,
             -- SCR-18's other half: a comment can be anchored to ONE FIELD, so "this price
             -- looks wrong" sits on the price and not at the bottom of the record.
             'field_key', c.anchor ->> 'field_key',
             'parent_comment_id', c.parent_comment_id,
             'created_by', c.created_by,
             'created_by_name', coalesce(v_people -> c.created_by::text ->> 'name', 'Somebody'),
             'created_at', c.created_at,
             'resolved_at', c.resolved_at,
             'resolved_by', c.resolved_by,
             'resolved_by_name', v_people -> c.resolved_by::text ->> 'name',
             'mentions', coalesce((select jsonb_agg(jsonb_build_object(
                                            'user_id', m.value,
                                            'name', coalesce(v_people -> (m.value #>> '{}') ->> 'name',
                                                             'Somebody')))
                                     from jsonb_array_elements(
                                            case when jsonb_typeof(c.anchor -> 'mentions') = 'array'
                                                 then c.anchor -> 'mentions' else '[]'::jsonb end) m),
                                  '[]'::jsonb),
             -- Mine, so the screen can offer Edit on my own and on nobody else's.
             'mine', c.created_by = v_user)
           order by c.created_at, c.id), '[]'::jsonb)
    into v_rows
    from custom.io_comments(p_organization_id, p_record_id, p_include_resolved) c;

  return jsonb_build_object(
    'record_id', p_record_id,
    'comments', v_rows,
    -- WHAT THIS PERSON MAY DO, from the store, in the same call that answers the thread. A
    -- screen that guessed would draw a composer the write door then refuses.
    'may_comment', custom.has_visibility(v_user, 'record', p_record_id,
                                         'commenter'::public.permission_level),
    'may_resolve', custom.has_visibility(v_user, 'record', p_record_id,
                                         'commenter'::public.permission_level));
end;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values ('custom', 'comment_thread',
        'p_organization_id uuid, p_record_id uuid, p_include_resolved boolean',
        array['uuid'::regtype, 'uuid'::regtype, 'bool'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry and again by custom.assert_store_door inside custom.io_comments; NULL is refused there. p_record_id takes its decision in custom.io_comments, which returns NOTHING unless this caller holds viewer on that record — so another tenant''s record and a record nobody shared both answer an empty thread, and the two are indistinguishable. Every name it adds comes from custom.history_people, which answers only members of this one organization. The two booleans it returns are this CALLER''S own level on this one record and say nothing about anybody else.',
        'histscreens_a_comment_can_name_somebody.sql',
        true, false)
on conflict do nothing;
