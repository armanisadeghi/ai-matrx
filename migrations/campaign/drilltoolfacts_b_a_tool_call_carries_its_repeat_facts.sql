-- chair-step: lane DRILL-TOOLFACTS, file 2 of 3 — chat.tool_call gains seven NULLABLE columns (no default, so no rewrite) holding the facts chat.vw_tool_refetch recomputed from the whole history on every read: the argument and output hashes, the call's place in its conversation, the first identical call, how many identical calls came before, and the trim verdict. Triggers keep them true at commit (chat.tool_call, chat.request, tool.definition); chat.tool_call_refetch_backfill(n) fills the old rows in small committed batches. No policy, grant to a client, or existing column is touched; the views still read the old way until file 3.
-- lane: DRILL-TOOLFACTS
-- lock: platform
--
-- THE RULES ARE chat.vw_tool_refetch's, restated once here and nowhere else (file 3 makes the view read
-- these columns). A call is in the repeat BASE when it is not archived, carries arguments, has tool type
-- local / agent / external, its tool's side_effect_class (tool.definition, live rows) is not
-- browser_session / external_write / sends_to_human / moves_money, and its arguments' action is not a
-- write or browser action. Over the base rows of ONE conversation, ordered (created_at, id):
--   refetch_seq        its position among them (the view's conv_seq)
--   refetch_args_hash  md5(arguments::text)
--   refetch_first_id   the earliest base call with the same tool_name + args hash (itself when first)
--   refetch_prior      how many such calls came before it (the view's nth - 1; 0 = first)
--   refetch_trimmed    on a repeat (prior > 0): the view's first_result_trimmed_before_repeat
-- refetch_out_hash is md5(output) on every counted call (set on write, not only on base rows), and
-- refetch_settled_at says the order facts above were computed (null = pending).
-- What stays LIVE in the view (read off the two rows, never stored): same_data (the two out hashes),
-- first_output_chars and the error_type filter, gap_secs, gap_iterations, gap_calls (the two seqs).
--
-- HOW THEY STAY TRUE. Inserts and output updates are written per turn by aidream's Coordinator; outputs
-- land by a later UPDATE. So:
--   BEFORE INSERT / UPDATE OF (output + every column the order depends on), counted calls only:
--     out hash recomputed when the output moves; settled_at nulled when an order column moves.
--   AT COMMIT (deferrable constraint triggers): chat._tool_call_refetch_settle(conversation) under a
--     per-conversation advisory lock recomputes that conversation's counted calls (fewer than 700 in the
--     largest conversation measured) and writes only the rows whose facts changed. Fired by a counted
--     insert, an order-column update, a delete; by a chat.request row carrying a trim summary (the trim
--     verdict reads requests, which aidream writes at the END of a request, after its tool calls); and
--     by a tool.definition insert / delete / change of name, side_effect_class or deleted_at (every
--     conversation that called that tool name).
--   A settle that fails never fails the writer's commit: it is caught, logged as a WARNING, and the row
--   stays pending (settled_at null) — chat.tool_call_refetch_backfill picks it up on its next run.
-- Rows outside the counted tool types (~95%, coding_agent) never fire anything beyond the WHEN test.
--
-- BACKFILL (plain SQL, owner-run, safe while live): repeat
--     select * from chat.tool_call_refetch_backfill(500);
-- until remaining_conversations = 0. Each call is its own short transaction: it settles up to N pending
-- conversations, row locks only on the counted rows it rewrites, no table lock.
--
-- INVERSE: migrations/inverse/drilltoolfacts_b_a_tool_call_carries_its_repeat_facts_down.sql
-- (run the inverse of file 3 first — the views read these columns after it).

set lock_timeout = '3s';

alter table chat.tool_call
  add column refetch_args_hash  text,
  add column refetch_out_hash   text,
  add column refetch_seq        integer,
  add column refetch_first_id   uuid,
  add column refetch_prior      integer,
  add column refetch_trimmed    boolean,
  add column refetch_settled_at timestamptz;

comment on column chat.tool_call.refetch_args_hash is 'DRILL-TOOLFACTS: md5(arguments::text) on a call in the re-fetch base; null otherwise. Kept by chat._tool_call_refetch_settle.';
comment on column chat.tool_call.refetch_out_hash is 'DRILL-TOOLFACTS: md5(output) on a local / agent / external call (null when no output). Set on write by chat._tool_call_refetch_mark.';
comment on column chat.tool_call.refetch_seq is 'DRILL-TOOLFACTS: position among the conversation''s re-fetch base calls, ordered (created_at, id).';
comment on column chat.tool_call.refetch_first_id is 'DRILL-TOOLFACTS: the earliest base call in the conversation with the same tool and argument hash (itself when this call is first).';
comment on column chat.tool_call.refetch_prior is 'DRILL-TOOLFACTS: identical base calls before this one in the conversation; > 0 is a repeat candidate (chat.vw_tool_refetch applies the error_type and first-output filters live).';
comment on column chat.tool_call.refetch_trimmed is 'DRILL-TOOLFACTS: on a repeat, whether the first call''s result was trimmed out of context before it (null = no trim audit for this iteration).';
comment on column chat.tool_call.refetch_settled_at is 'DRILL-TOOLFACTS: when the order facts were last computed; null = pending (new, changed, or a settle that failed).';

-- The one computation. Recomputes every counted call of one conversation and writes the rows that moved.
create function chat._tool_call_refetch_settle(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'pg_temp'
set lock_timeout to '5s'
as $function$
declare
  v_changed integer;
begin
  if p_conversation_id is null then
    return 0;
  end if;
  -- Serialise settles of one conversation across concurrent commits: a settle waiting here then reads
  -- the rows the other commit just made visible.
  perform pg_advisory_xact_lock(hashtextextended('chat.tool_call.refetch:' || p_conversation_id::text, 0));

  with base as (
    select tc.id, tc.tool_name, tc.created_at, tc.call_id, tc.user_request_id, tc.iteration,
           md5(tc.arguments::text) as args_hash,
           row_number() over (order by tc.created_at, tc.id) as seq
      from chat.tool_call tc
      left join tool.definition td on td.name = tc.tool_name and td.deleted_at is null
     where tc.conversation_id = p_conversation_id
       and tc.tool_type = any (array['local'::text, 'agent'::text, 'external'::text])
       and tc.deleted_at is null
       and tc.arguments is not null
       and coalesce(td.side_effect_class, ''::text) <> all (array['browser_session'::text, 'external_write'::text, 'sends_to_human'::text, 'moves_money'::text])
       and coalesce(tc.arguments ->> 'action'::text, ''::text) <> all (array['screenshot'::text, 'navigate'::text, 'scroll'::text, 'click'::text, 'close'::text, 'get_element'::text, 'type'::text, 'update_row'::text, 'delete_row'::text, 'insert_row'::text, 'add_row'::text, 'create'::text, 'update'::text, 'delete'::text, 'upsert'::text, 'run'::text, 'merge'::text, 'patch'::text, 'write'::text, 'dismiss_handoff'::text])
  ), grouped as (
    select b.*,
           row_number() over w - 1           as prior,
           first_value(b.id) over w          as first_id,
           first_value(b.created_at) over w  as first_at,
           first_value(b.call_id) over w     as first_call_id
      from base b
    window w as (partition by b.tool_name, b.args_hash order by b.created_at, b.id
                 rows between unbounded preceding and unbounded following)
  ), facts as (
    select g.id, g.args_hash, g.seq::integer as seq, g.first_id, g.prior::integer as prior,
           case
             when g.prior = 0 then null::boolean
             when not (exists (select 1 from chat.request r
                                where r.conversation_id = p_conversation_id
                                  and r.user_request_id = g.user_request_id
                                  and r.iteration = g.iteration
                                  and r.trim_summary is not null)) then null::boolean
             else (exists (select 1
                             from chat.request r,
                                  lateral jsonb_array_elements(coalesce(r.trim_summary -> 'rewritten_blocks'::text, '[]'::jsonb)) b(value)
                            where r.conversation_id = p_conversation_id
                              and r.created_at >= g.first_at
                              and r.created_at <= g.created_at
                              and (b.value ->> 'call_id'::text) = g.first_call_id))
           end as trimmed
      from grouped g
  ), target as (
    select tc.id,
           f.args_hash, f.seq, f.first_id, f.prior, f.trimmed,
           case when tc.refetch_settled_at is null then md5(tc.output) else tc.refetch_out_hash end as out_hash
      from chat.tool_call tc
      left join facts f on f.id = tc.id
     where tc.conversation_id = p_conversation_id
       and tc.tool_type = any (array['local'::text, 'agent'::text, 'external'::text])
  )
  update chat.tool_call t
     set refetch_args_hash  = x.args_hash,
         refetch_out_hash   = x.out_hash,
         refetch_seq        = x.seq,
         refetch_first_id   = x.first_id,
         refetch_prior      = x.prior,
         refetch_trimmed    = x.trimmed,
         refetch_settled_at = now()
    from target x
   where t.id = x.id
     and (t.refetch_settled_at is null
          or (t.refetch_args_hash, t.refetch_out_hash, t.refetch_seq, t.refetch_first_id, t.refetch_prior, t.refetch_trimmed)
             is distinct from (x.args_hash, x.out_hash, x.seq, x.first_id, x.prior, x.trimmed));
  get diagnostics v_changed = row_count;
  return v_changed;
end
$function$;

revoke all on function chat._tool_call_refetch_settle(uuid) from public, anon, authenticated;
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('chat', '_tool_call_refetch_settle', 'p_conversation_id uuid', array['uuid'::regtype]::oid[],
        'p_conversation_id is the conversation whose tool calls are recomputed; it is not an access check — the function only rewrites derived refetch_* columns of that conversation''s own rows from their own data. NULL returns 0.',
        'migrations/campaign/drilltoolfacts_b_a_tool_call_carries_its_repeat_facts.sql (lane DRILL-TOOLFACTS)',
        'server_only: called only by the DRILL-TOOLFACTS commit-time triggers on chat.tool_call, chat.request and tool.definition and by chat.tool_call_refetch_backfill; no client ever calls it.',
        false, false)
on conflict do nothing;
comment on function chat._tool_call_refetch_settle(uuid) is
  'DRILL-TOOLFACTS: recomputes the re-fetch facts (refetch_* columns) of one conversation''s local / agent / external tool calls under a per-conversation advisory lock and writes only the rows that moved. Called at commit by the refetch triggers and by chat.tool_call_refetch_backfill. Returns rows written.';

-- BEFORE: hashes and the pending mark, on the row being written (no extra row version).
create function chat._tool_call_refetch_mark()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'pg_temp'
as $function$
begin
  if tg_op = 'INSERT' then
    new.refetch_args_hash  := null;
    new.refetch_seq        := null;
    new.refetch_first_id   := null;
    new.refetch_prior      := null;
    new.refetch_trimmed    := null;
    new.refetch_settled_at := null;
    new.refetch_out_hash   := md5(new.output);
    return new;
  end if;

  if new.output is distinct from old.output or new.tool_type is distinct from old.tool_type then
    new.refetch_out_hash := case when new.tool_type = any (array['local'::text, 'agent'::text, 'external'::text])
                                 then md5(new.output) end;
  end if;
  if (new.deleted_at, new.tool_type, new.arguments, new.tool_name, new.conversation_id, new.created_at,
      new.call_id, new.iteration, new.user_request_id)
     is distinct from
     (old.deleted_at, old.tool_type, old.arguments, old.tool_name, old.conversation_id, old.created_at,
      old.call_id, old.iteration, old.user_request_id) then
    new.refetch_settled_at := null;
    if not (new.tool_type = any (array['local'::text, 'agent'::text, 'external'::text])) then
      -- Left the counted set: its facts are void now (the settle reads counted calls only).
      new.refetch_args_hash := null;
      new.refetch_seq       := null;
      new.refetch_first_id  := null;
      new.refetch_prior     := null;
      new.refetch_trimmed   := null;
    end if;
  end if;
  return new;
end
$function$;

revoke all on function chat._tool_call_refetch_mark() from public, anon, authenticated;

-- AT COMMIT on chat.tool_call: settle the conversation(s) the row belongs to (or belonged to).
create function chat._tool_call_refetch_settle_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'pg_temp'
as $function$
declare
  v_pending boolean;
begin
  begin
    if tg_op = 'DELETE' then
      perform chat._tool_call_refetch_settle(old.conversation_id);
      return null;
    end if;
    if tg_op = 'UPDATE' and old.conversation_id is distinct from new.conversation_id then
      perform chat._tool_call_refetch_settle(old.conversation_id);
    end if;
    -- An earlier firing in this commit may already have settled the conversation: then the row is not
    -- pending any more and there is nothing to do.
    select tc.refetch_settled_at is null into v_pending from chat.tool_call tc where tc.id = new.id;
    if coalesce(v_pending, false) then
      perform chat._tool_call_refetch_settle(new.conversation_id);
    end if;
  exception when others then
    raise warning '[DRILL-TOOLFACTS] re-fetch facts for tool call % (conversation %) left pending: % (%)',
      coalesce(new.id, old.id), coalesce(new.conversation_id, old.conversation_id), sqlerrm, sqlstate;
  end;
  return null;
end
$function$;

revoke all on function chat._tool_call_refetch_settle_trigger() from public, anon, authenticated;

-- AT COMMIT on chat.request: a trim summary landing (or moving) changes the trim verdict.
create function chat._tool_call_refetch_request_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'pg_temp'
as $function$
begin
  begin
    if tg_op in ('UPDATE', 'DELETE') then
      perform chat._tool_call_refetch_settle(old.conversation_id);
    end if;
    if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.conversation_id is distinct from old.conversation_id) then
      perform chat._tool_call_refetch_settle(new.conversation_id);
    end if;
  exception when others then
    raise warning '[DRILL-TOOLFACTS] trim verdicts for conversation % not refreshed: % (%)',
      coalesce(new.conversation_id, old.conversation_id), sqlerrm, sqlstate;
  end;
  return null;
end
$function$;

revoke all on function chat._tool_call_refetch_request_trigger() from public, anon, authenticated;

-- AT COMMIT on tool.definition: a tool's side-effect class decides whether its calls are in the base.
create function chat._tool_call_refetch_definition_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'pg_temp'
as $function$
declare
  v_conv uuid;
begin
  for v_conv in
    select distinct tc.conversation_id
      from chat.tool_call tc
     where tc.tool_name in (case when tg_op <> 'INSERT' then old.name end, case when tg_op <> 'DELETE' then new.name end)
       and tc.tool_type = any (array['local'::text, 'agent'::text, 'external'::text])
       and tc.deleted_at is null
  loop
    begin
      perform chat._tool_call_refetch_settle(v_conv);
    exception when others then
      raise warning '[DRILL-TOOLFACTS] re-fetch facts for conversation % not refreshed after a tool definition change: % (%)',
        v_conv, sqlerrm, sqlstate;
    end;
  end loop;
  return null;
end
$function$;

revoke all on function chat._tool_call_refetch_definition_trigger() from public, anon, authenticated;

-- The backfill: one call = one short transaction over up to p_conversations pending conversations.
create function chat.tool_call_refetch_backfill(p_conversations integer default 500)
returns table (settled_conversations integer, rows_written integer, remaining_conversations integer)
language plpgsql
security definer
set search_path to 'pg_catalog', 'pg_temp'
as $function$
declare
  v_conv uuid;
  v_n integer := 0;
  v_rows integer := 0;
begin
  for v_conv in
    select distinct tc.conversation_id
      from chat.tool_call tc
     where tc.tool_type = any (array['local'::text, 'agent'::text, 'external'::text])
       and tc.refetch_settled_at is null
       and tc.conversation_id is not null
     limit greatest(p_conversations, 1)
  loop
    v_rows := v_rows + chat._tool_call_refetch_settle(v_conv);
    v_n := v_n + 1;
  end loop;
  return query
    select v_n, v_rows,
           (select count(distinct tc.conversation_id)::integer
              from chat.tool_call tc
             where tc.tool_type = any (array['local'::text, 'agent'::text, 'external'::text])
               and tc.refetch_settled_at is null
               and tc.conversation_id is not null);
end
$function$;

revoke all on function chat.tool_call_refetch_backfill(integer) from public, anon, authenticated;
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('chat', 'tool_call_refetch_backfill', 'p_conversations integer', array['integer'::regtype]::oid[],
        'p_conversations is a batch size (no entity id); it settles the next pending conversations in the derived refetch_* columns of chat.tool_call. NULL or < 1 settles one.',
        'migrations/campaign/drilltoolfacts_b_a_tool_call_carries_its_repeat_facts.sql (lane DRILL-TOOLFACTS)',
        'server_only: the backfill the database owner runs by hand in batches after this file lands; no client ever calls it.',
        false, false)
on conflict do nothing;
comment on function chat.tool_call_refetch_backfill(integer) is
  'DRILL-TOOLFACTS: settles up to N conversations whose local / agent / external tool calls carry pending re-fetch facts. Owner-run; repeat until remaining_conversations = 0. Also the remedy for a settle a trigger logged as left pending.';

create trigger zz_refetch_mark_insert
  before insert on chat.tool_call
  for each row
  when (new.tool_type = any (array['local'::text, 'agent'::text, 'external'::text]))
  execute function chat._tool_call_refetch_mark();

create trigger zz_refetch_mark_update
  before update of output, deleted_at, tool_type, arguments, tool_name, conversation_id, created_at, call_id, iteration, user_request_id
  on chat.tool_call
  for each row
  when (old.tool_type = any (array['local'::text, 'agent'::text, 'external'::text])
        or new.tool_type = any (array['local'::text, 'agent'::text, 'external'::text]))
  execute function chat._tool_call_refetch_mark();

create constraint trigger zz_refetch_settle_insert
  after insert on chat.tool_call
  deferrable initially deferred
  for each row
  when (new.tool_type = any (array['local'::text, 'agent'::text, 'external'::text]))
  execute function chat._tool_call_refetch_settle_trigger();

create constraint trigger zz_refetch_settle_update
  after update of deleted_at, tool_type, arguments, tool_name, conversation_id, created_at, call_id, iteration, user_request_id
  on chat.tool_call
  deferrable initially deferred
  for each row
  when (old.tool_type = any (array['local'::text, 'agent'::text, 'external'::text])
        or new.tool_type = any (array['local'::text, 'agent'::text, 'external'::text]))
  execute function chat._tool_call_refetch_settle_trigger();

create constraint trigger zz_refetch_settle_delete
  after delete on chat.tool_call
  deferrable initially deferred
  for each row
  when (old.tool_type = any (array['local'::text, 'agent'::text, 'external'::text]))
  execute function chat._tool_call_refetch_settle_trigger();

create constraint trigger zz_refetch_trim_insert
  after insert on chat.request
  deferrable initially deferred
  for each row
  when (new.trim_summary is not null)
  execute function chat._tool_call_refetch_request_trigger();

create constraint trigger zz_refetch_trim_update
  after update of trim_summary, conversation_id, user_request_id, iteration, created_at
  on chat.request
  deferrable initially deferred
  for each row
  when (old.trim_summary is not null or new.trim_summary is not null)
  execute function chat._tool_call_refetch_request_trigger();

create constraint trigger zz_refetch_trim_delete
  after delete on chat.request
  deferrable initially deferred
  for each row
  when (old.trim_summary is not null)
  execute function chat._tool_call_refetch_request_trigger();

create constraint trigger zz_refetch_definition_insert
  after insert on tool.definition
  deferrable initially deferred
  for each row
  execute function chat._tool_call_refetch_definition_trigger();

create constraint trigger zz_refetch_definition_update
  after update of name, side_effect_class, deleted_at
  on tool.definition
  deferrable initially deferred
  for each row
  when ((old.name, old.side_effect_class, old.deleted_at) is distinct from (new.name, new.side_effect_class, new.deleted_at))
  execute function chat._tool_call_refetch_definition_trigger();

create constraint trigger zz_refetch_definition_delete
  after delete on tool.definition
  deferrable initially deferred
  for each row
  execute function chat._tool_call_refetch_definition_trigger();
