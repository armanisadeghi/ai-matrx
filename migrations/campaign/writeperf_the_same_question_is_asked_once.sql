-- additive: yes
-- based-on: platform.knob_resolve(text, text, uuid, uuid, jsonb) 03fa901e9d637c73532ebf1cc2f39f7dbf8fb760835024b2d210055a41e26d25
--
-- chair-step: it REPLACES one live body, `platform.knob_resolve`, with a two-line prologue in
--   front of that same body (which moves, character for character, into a new function
--   `platform.knob_resolve_uncached`). It also creates five small new functions and adds SIX
--   statement-level AFTER triggers that do nothing but empty a transaction-local memo. Nothing
--   is dropped, granted or revoked, and no row of anybody's data is touched. No knob can hold it
--   off, because it IS the function every knob read goes through — a `-- guard:` line would be a
--   comment pretending to be a switch. The inverse is
--   `migrations/inverse/writeperf_the_same_question_is_asked_once_down.sql` and it puts the
--   original body back under its original name and drops everything this file adds.
--
-- WRITE-PERF — THE SAME QUESTION IS ASKED ONCE PER TRANSACTION, NOT ONCE PER ROW.
--
-- MEASURED, MAIN DATABASE, 1,000 records through `custom.record_write` one at a time, read off
-- `pg_stat_user_functions` with `track_functions = all` set INSIDE the transaction:
--
--     platform.knob_resolve    35,502 calls = 35.5 PER ROW, 3.07 ms per row of self time
--     custom.store_is_open     30,088 calls = 30.1 PER ROW  (it is one knob read and nothing else)
--
-- Thirty-five knob resolutions per record written, and every single one of them asks the same
-- register the same question about the same organization and gets the same answer. Nothing in a
-- knob's answer can change between row 1 and row 1,000 of one write.
--
-- THE MEMO, AND THE FENCE THAT MAKES IT SAFE.
--
-- `platform.memo_*` is a memo that lives in ONE transaction-local GUC, `mx_memo.v`. Postgres
-- reverts a `set_config(..., is_local => true)` at the end of the transaction whether it commits
-- or rolls back, so an entry can NEVER outlive the transaction that wrote it and a rolled-back
-- write can never leave a stale answer behind. That is the whole rollback story, and it is the
-- reason this is a GUC and not a table.
--
-- ONE GUC, not one per key, deliberately. A GUC name, once used, stays in the session's hash for
-- the life of the connection; a pooled connection that minted a fresh GUC name per memo key
-- would leak names forever. One blob costs a small parse per read and nothing else, and the blob
-- is capped at `platform.memo_ceiling()` entries — past the cap the memo empties itself rather
-- than growing without bound.
--
-- WHAT INVALIDATES IT. Six statement-level AFTER triggers, one per (table, event), each of which
-- does nothing but empty the memo:
--
--     platform.feature_knob, platform.knob_override, platform.knob_rung_lock
--
-- — the three tables `knob_resolve` reads. A migration that seeds a knob and then reads it in the
-- same transaction gets the new value, not the memo's. They are statement-level, so a hundred-row
-- knob write costs ONE bump, not a hundred.
--
-- WHAT CHANGES IN THE ANSWER. Nothing, with one honest exception: `knob_resolve` raises a WARNING
-- when an override is out of bounds or no longer allowed, and a memo hit does not re-raise it.
-- So a clamped override now warns ONCE per transaction instead of thirty-five times per row. The
-- warning still happens, it still names the knob and the rung, and the value it returns is
-- identical. That is stated here rather than discovered.
--
-- THE SEAT IS PART OF THE KEY. `knob_resolve` resolves a `user` rung, so an answer belongs to a
-- person as well as an organization. The memo carries the seat it was filled for — the role GUC,
-- the JWT claims and `current_user` — and empties itself the moment any of them moves, which is
-- what a connection handed to a different request does.

-- ═══ 1. THE FENCE, FIRST ═════════════════════════════════════════════════════════════════
-- The three triggers are created BEFORE anything else in this file, deliberately: they are
-- the only statements here that need an ACCESS EXCLUSIVE lock, the knob tables are read
-- thirty-five times per record written by every lane on this database, and db:apply gives a
-- migration a two-second lock_timeout on purpose. Asking for the table lock in the first
-- breath of the transaction is the difference between winning it and never getting it.

create or replace function platform.memo_bump()
returns trigger language plpgsql set search_path to ''
as $$
begin
  perform platform.memo_clear();
  return null;
end;
$$;
comment on function platform.memo_bump() is
  'MEMO-1. Statement-level AFTER trigger: something a memoised answer is derived from has changed, so the memo is emptied. One bump per STATEMENT, never one per row.';

drop trigger if exists zz_memo_bump_i on platform.feature_knob;
drop trigger if exists zz_memo_bump_u on platform.feature_knob;
drop trigger if exists zz_memo_bump_d on platform.feature_knob;
create trigger zz_memo_bump_i after insert on platform.feature_knob
  for each statement execute function platform.memo_bump();
create trigger zz_memo_bump_u after update on platform.feature_knob
  for each statement execute function platform.memo_bump();
create trigger zz_memo_bump_d after delete on platform.feature_knob
  for each statement execute function platform.memo_bump();

drop trigger if exists zz_memo_bump_i on platform.knob_override;
drop trigger if exists zz_memo_bump_u on platform.knob_override;
drop trigger if exists zz_memo_bump_d on platform.knob_override;
create trigger zz_memo_bump_i after insert on platform.knob_override
  for each statement execute function platform.memo_bump();
create trigger zz_memo_bump_u after update on platform.knob_override
  for each statement execute function platform.memo_bump();
create trigger zz_memo_bump_d after delete on platform.knob_override
  for each statement execute function platform.memo_bump();

drop trigger if exists zz_memo_bump_i on platform.knob_rung_lock;
drop trigger if exists zz_memo_bump_u on platform.knob_rung_lock;
drop trigger if exists zz_memo_bump_d on platform.knob_rung_lock;
create trigger zz_memo_bump_i after insert on platform.knob_rung_lock
  for each statement execute function platform.memo_bump();
create trigger zz_memo_bump_u after update on platform.knob_rung_lock
  for each statement execute function platform.memo_bump();
create trigger zz_memo_bump_d after delete on platform.knob_rung_lock
  for each statement execute function platform.memo_bump();


-- ═══ 2. THE MEMO ═══════════════════════════════════════════════════════════════════════════
create or replace function platform.memo_ceiling()
returns integer language sql immutable set search_path to ''
as $$ select 400; $$;
comment on function platform.memo_ceiling() is
  'MEMO-1. How many answers one transaction''s memo may hold before it empties itself. A cap, not a tuning knob: past it the memo is doing no good and the blob is only getting more expensive to parse.';

create or replace function platform.memo_seat()
returns text language sql stable set search_path to ''
as $$
  select md5(coalesce(current_setting('role', true), '') || '|' ||
             coalesce(current_setting('request.jwt.claims', true), '') || '|' ||
             current_user);
$$;
comment on function platform.memo_seat() is
  'MEMO-1. Who the memo was filled for. An answer that depends on the person must not survive the seat changing under a pooled connection.';

create or replace function platform.memo_all()
returns jsonb language plpgsql stable set search_path to ''
as $$
declare
  v_raw text := nullif(current_setting('mx_memo.v', true), '');
  v     jsonb;
begin
  if v_raw is null then
    return '{}'::jsonb;
  end if;
  begin
    v := v_raw::jsonb;
  exception when others then
    -- A blob that will not parse is not an error worth raising: it is a miss.
    return '{}'::jsonb;
  end;
  if (v ->> '_seat') is distinct from platform.memo_seat() then
    return '{}'::jsonb;
  end if;
  return coalesce(v -> 'e', '{}'::jsonb);
end;
$$;

create or replace function platform.memo_get(p_key text)
returns text language sql stable set search_path to ''
as $$ select platform.memo_all() ->> p_key; $$;
comment on function platform.memo_get(text) is
  'MEMO-1. An answer this transaction has already worked out for this seat, or NULL. NULL is always safe: it means ask again.';

create or replace function platform.memo_put(p_key text, p_value text)
returns void language plpgsql volatile set search_path to ''
as $$
declare
  v_e jsonb := platform.memo_all();
begin
  if p_value is null then
    return;
  end if;
  if (select count(*) from jsonb_object_keys(v_e)) >= platform.memo_ceiling() then
    v_e := '{}'::jsonb;
  end if;
  perform set_config('mx_memo.v',
                     jsonb_build_object('_seat', platform.memo_seat(),
                                        'e', v_e || jsonb_build_object(p_key, p_value))::text,
                     true);
end;
$$;
comment on function platform.memo_put(text, text) is
  'MEMO-1. Remember an answer for the rest of THIS transaction only — set_config(..., is_local) is reverted on commit and on rollback alike, so a rolled-back write can never leave a stale answer behind.';

create or replace function platform.memo_clear()
returns void language sql volatile set search_path to ''
as $$ select set_config('mx_memo.v', '', true); $$;
comment on function platform.memo_clear() is
  'MEMO-1. Empty the memo. Called by the bump triggers on every table any memoised answer is derived from.';


-- ═══ 3. THE BODY, MOVED WHOLE ══════════════════════════════════════════════════════════════
-- Character for character the body `platform.knob_resolve` has today, under a new name. It is
-- what the memo misses fall through to, and it is what the red twin measures.
CREATE OR REPLACE FUNCTION platform.knob_resolve_uncached(p_feature text, p_key text, p_organization_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_scopes jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'platform', 'public'
AS $function$
declare
  k record;
  v jsonb;
  v_num numeric;
  r record;
  v_effective jsonb;
  v_bound numeric;
  v_offered numeric;
begin
  -- ═══ DD-198: p_scopes is an ARRAY of rungs, or it is nothing ═══════════════
  -- This check is FIRST, before the register lookup, because the only other place
  -- p_scopes is ever touched is `jsonb_array_elements(p_scopes)` inside the
  -- candidate-override EXISTS below -- and that is reached only once an override
  -- row exists at a row-keyed rung. A caller passing an OBJECT therefore ran
  -- green for as long as nobody had created such an override, and raised
  -- `cannot extract elements from an object` on the first person who did
  -- (`platform._stamp_actor_tier`, every AI/code insert in that organization).
  -- A wrong argument must be wrong on the FIRST call, not on the first call that
  -- happens to reach the line that dereferences it.
  if p_scopes is not null and jsonb_typeof(p_scopes) <> 'array' then
    raise exception
      'platform.knob_resolve: p_scopes must be a JSON ARRAY of rungs this read is standing on, each {"kind": <rung>, "id": <uuid>} -- it arrived as a %, resolving %.%. An object such as jsonb_build_object(''table'', <id>) or ''{}''::jsonb names no rung at all, so every row-keyed override would be silently unreachable.',
      jsonb_typeof(p_scopes), p_feature, p_key
      using errcode = '22023',
            hint = 'Pass jsonb_build_array(jsonb_build_object(''kind'', ''table'', ''id'', <uuid>)), or NULL when this read stands on no row-keyed rung.';
  end if;
  select value_type, coalesce(value, default_value) as base,
         min_value, max_value, allowed_values, overridable_by,
         coalesce(override_direction, 'any') as direction
    into k
    from platform.feature_knob
   where feature = p_feature and key = p_key;
  if not found then
    raise exception 'platform.knob_resolve: knob %.% is not seeded', p_feature, p_key
      using errcode = 'P0001',
            hint = 'A missing knob raises rather than falling back to a hard-coded value. Seed it in the knob register.';
  end if;

  if p_organization_id is not null and k.overridable_by <> '{}'::text[] then
    if k.direction in ('lower_only', 'raise_only') then
      -- Walk the rungs OUTWARD from the platform value, lowest precedence
      -- first, keeping the bound the nearest higher rung established. Same walk
      -- as the Python resolver's `_apply_direction`.
      v_effective := k.base;
      v_bound := case when jsonb_typeof(k.base) = 'number' then (k.base #>> '{}')::numeric
                      when jsonb_typeof(k.base) = 'boolean' then ((k.base #>> '{}')::boolean)::int::numeric
                      else null end;
      for r in
        select o.value, o.scope_kind, s.precedence
          from platform.knob_override o
          join platform.knob_scope_kind s on s.kind = o.scope_kind
         where o.feature = p_feature and o.key = p_key
           and o.organization_id = p_organization_id
           and o.scope_kind = any (k.overridable_by)
           and not exists (select 1 from platform.knob_rung_lock l
                            where l.feature = o.feature and l.key = o.key
                              and l.organization_id = o.organization_id
                              and o.scope_kind = any (l.locked_kinds))
           and (   (o.scope_kind = 'organization')
                or (o.scope_kind = 'user' and p_user_id is not null and o.scope_id = p_user_id)
                or (p_scopes is not null and exists (
                      select 1 from jsonb_array_elements(p_scopes) e
                       where e ->> 'kind' = o.scope_kind
                         and (e ->> 'id')::uuid = o.scope_id)))
         order by s.precedence asc
      loop
        v_offered := case when jsonb_typeof(r.value) = 'number' then (r.value #>> '{}')::numeric
                          when jsonb_typeof(r.value) = 'boolean' then ((r.value #>> '{}')::boolean)::int::numeric
                          else null end;
        if v_offered is null or v_bound is null then
          v_effective := r.value;
          v_bound := v_offered;
          continue;
        end if;
        if (k.direction = 'lower_only' and v_offered > v_bound)
           or (k.direction = 'raise_only' and v_offered < v_bound) then
          raise warning 'knob_resolve: %.% the % rung offered %, which loosens the standing value % on a % knob — discarded',
            p_feature, p_key, r.scope_kind, v_offered, v_bound, k.direction;
          continue;
        end if;
        v_effective := r.value;
        v_bound := v_offered;
      end loop;
      -- `v` stays NULL when no rung moved it, so the base return below is the
      -- same single path it has always been.
      if v_effective is distinct from k.base then
        v := v_effective;
      end if;
    else
      select o.value into v
        from platform.knob_override o
        join platform.knob_scope_kind s on s.kind = o.scope_kind
       where o.feature = p_feature and o.key = p_key
         and o.organization_id = p_organization_id
         and o.scope_kind = any (k.overridable_by)
         and not exists (select 1 from platform.knob_rung_lock l
                          where l.feature = o.feature and l.key = o.key
                            and l.organization_id = o.organization_id
                            and o.scope_kind = any (l.locked_kinds))
         and (   (o.scope_kind = 'organization')
              or (o.scope_kind = 'user' and p_user_id is not null and o.scope_id = p_user_id)
              or (p_scopes is not null and exists (
                    select 1 from jsonb_array_elements(p_scopes) e
                     where e ->> 'kind' = o.scope_kind
                       and (e ->> 'id')::uuid = o.scope_id)))
       order by s.precedence desc
       limit 1;
    end if;
  end if;

  if v is null then
    return k.base;
  end if;

  if k.value_type in ('number','integer') and jsonb_typeof(v) = 'number' then
    v_num := (v #>> '{}')::numeric;
    if k.min_value is not null and v_num < k.min_value then
      raise warning 'knob_resolve: %.% override % below current min % — clamped',
        p_feature, p_key, v_num, k.min_value;
      return to_jsonb(k.min_value);
    end if;
    if k.max_value is not null and v_num > k.max_value then
      raise warning 'knob_resolve: %.% override % above current max % — clamped',
        p_feature, p_key, v_num, k.max_value;
      return to_jsonb(k.max_value);
    end if;
  elsif k.value_type in ('enum','string') and k.allowed_values is not null
        and not (k.allowed_values @> jsonb_build_array(v)) then
    raise warning 'knob_resolve: %.% override % no longer in allowed_values — using platform value',
      p_feature, p_key, v;
    return k.base;
  end if;

  return v;
end;
$function$;

-- ═══ 4. THE DOOR ═══════════════════════════════════════════════════════════════════════════
create or replace function platform.knob_resolve(p_feature text, p_key text, p_organization_id uuid,
                                                 p_user_id uuid default null::uuid,
                                                 p_scopes jsonb default null::jsonb)
returns jsonb language plpgsql stable set search_path to 'platform', 'public'
as $function$
declare
  v_k   text;
  v_hit text;
  v_out jsonb;
begin
  -- A READ THAT STANDS ON A ROW-KEYED RUNG IS NOT MEMOISED. `p_scopes` is a whole array of rungs
  -- and the answer depends on every one of them; the common case by a factor of thousands is no
  -- scopes at all, and that is the one worth remembering.
  if p_scopes is not null then
    return platform.knob_resolve_uncached(p_feature, p_key, p_organization_id, p_user_id, p_scopes);
  end if;

  v_k := 'knob|' || coalesce(p_feature, '') || '|' || coalesce(p_key, '') || '|' ||
         coalesce(p_organization_id::text, '') || '|' || coalesce(p_user_id::text, '');
  v_hit := platform.memo_get(v_k);
  if v_hit is not null then
    return v_hit::jsonb;
  end if;

  v_out := platform.knob_resolve_uncached(p_feature, p_key, p_organization_id, p_user_id, null);
  -- A REFUSAL IS NEVER REMEMBERED. `knob_resolve_uncached` raises for an unseeded knob and for a
  -- caller who cannot read the register; that must happen every single time it is true, so only
  -- an answer reaches the memo, and only after it has been worked out honestly once.
  perform platform.memo_put(v_k, v_out::text);
  return v_out;
end;
$function$;
comment on function platform.knob_resolve(text, text, uuid, uuid, jsonb) is
  'The knob register''s one read. The answer for (feature, key, organization, user) is worked out once per transaction and remembered for the rest of it in a transaction-local memo that the three knob tables'' own statement-level triggers empty the moment anything it is derived from changes. A read standing on a row-keyed rung is never memoised. platform.knob_resolve_uncached is the same body with no memo, and it is what a parity proof compares against.';
