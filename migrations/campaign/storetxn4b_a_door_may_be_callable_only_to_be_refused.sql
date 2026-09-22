-- chair-step: it REPLACES the body of `platform.door_body_must_decide`, a LIVE DDL guard that
--   fires on every `platform.client_callable_door` write, and a replacement of a live body is
--   outside the additive allow-list by design. Nothing is dropped and nothing is revoked; the
--   existing refusal is unchanged for every row that does not carry the new word, and the new
--   word can only ever make the guard REFUSE MORE (a `refusal_only` row whose body is not a
--   bare raise is refused, where before nothing looked). The `-- based-on:` line pins the exact
--   body this was written against. The other statements add one defaulted column, two new
--   functions, one door row and one grant.
-- lock: platform,custom
-- lane: STORE-TXN-4
-- based-on: platform.door_body_must_decide() e6327e9d52595cea8e6add0a98b4c8b5f7afa692876b991aea4ad66d1153d195
--
-- STORE-TXN-4 — A DOOR MAY BE CALLABLE ONLY TO BE REFUSED, AND THE GUARD PROVES IT.
--
-- THE DEFECT, AS VERIFIER-13 ITEM 2 FOUND IT AND STORE-TXN-3 LEFT IT OPEN. `custom.migrate_purge_hard`
-- is a compliance erasure — chair-only by ruling, with no EXECUTE for `authenticated` — so a
-- person who reaches for it from a client hears PostgreSQL:
--
--     permission denied for function migrate_purge_hard
--
-- not the door's own written sentence, which exists and is good: *"Destroying records for good
-- is not something a signed-in caller does here… archive, never delete."* Law 4 of this
-- platform is that nothing fails silently and every refusal carries a remedy; a raw
-- `permission denied` carries neither.
--
-- WHY THE OBVIOUS FIX WAS WRONG, TWICE. STORE-TXN-3 granted EXECUTE on the real door so the
-- body's own refusal would be heard, and took it back in the same session: `check:store-doors-decide`
-- failed on it and is RIGHT. That body decides with `pg_has_role` rather than the one ladder,
-- and a body that decides with a second access system is not a client door — the guard exists
-- because `seo.keyword_value_map` had a truthful-looking door row in front of exactly that.
-- The only ways to satisfy the guard were to write a ladder call nothing reads, or to make a
-- compliance erasure depend on the operator being a member of the organization. Both are worse
-- than the raw refusal.
--
-- ── THE REGISTER WORD ──────────────────────────────────────────────────────────────────────
--
-- There is a third kind of door, and it has never been written down: one a client may CALL,
-- that does NOTHING, and whose entire purpose is to say why in our own words.
--
--     refusal_only — the body's first and only statement RAISES. No read, no write, no
--     decision — because nothing happens, so there is nothing to decide about. The caller
--     hears a sentence with a remedy instead of a PostgreSQL error code.
--
-- IT IS NOT A WAIVER, AND THAT IS THE WHOLE DESIGN. A word in a register that merely excused a
-- door from the ladder census would be a permission slip: any door could wear it. So the word
-- is checked against the FUNCTION BODY, by `platform.door_body_is_refusal_only`, which is the
-- ONE definition of the shape and is read by BOTH enforcers — the live DDL guard
-- `platform.door_body_must_decide` (at declaration time, where it refuses) and
-- `pnpm check:store-doors-decide` census 14 (over the estate, every release). A `refusal_only`
-- door that reads a table, writes a row, calls another function, branches, loops or returns a
-- value is REFUSED, naming what it found. The declaration cannot make a body true; the body
-- has to be true for the declaration to stand.
--
-- 🚨 AND SECURITY DEFINER IS DELIBERATE, NOT INCIDENTAL. A SECURITY INVOKER stub would have
-- slipped past every census in `check:store-doors-decide` and past `platform.door_body_must_decide`
-- itself — all of them exempt INVOKER bodies, correctly, because an INVOKER body is bounded by
-- table privileges. A stub built that way would have been a QUIET exemption: nothing to declare,
-- nothing to check, and nothing to stop the next one from growing a `select` a year later. The
-- refusal stub is DEFINER so that it lives inside the guard's jurisdiction and its shape is
-- something the platform re-proves on every release.
--
-- ── THE FIRST ONE ──────────────────────────────────────────────────────────────────────────
--
-- `custom.migrate_purge_hard_request(organization, table, reason)` is the client surface for
-- "destroy these records for good", and all it does is explain that this is not a thing a
-- signed-in seat does, what to do instead (archive — `custom.migrate_purge`), and who runs the
-- real erasure. `custom.migrate_purge_hard` itself is UNTOUCHED: still chair-only, still with
-- no grant, still refusing any caller that is not a member of `custom.record`'s owner role. The
-- two are deliberately different NAMES rather than an overload — a 3-argument overload of a
-- 5-argument function whose last two arguments have defaults is ambiguous for a 3-argument
-- call, and "which function did I just reach" is not a question a compliance erasure should
-- ever raise.

alter table platform.client_callable_door
  add column if not exists refusal_only boolean not null default false;

comment on column platform.client_callable_door.refusal_only is
  'STORE-TXN-4. TRUE for a door a client may call that does NOTHING: the body''s first and only '
  'statement raises the written sentence. It exists so a person hears our words instead of '
  'PostgreSQL''s "permission denied for function", and it is NOT a waiver — '
  'platform.door_body_is_refusal_only checks the BODY, the live guard '
  'platform.door_body_must_decide refuses a row whose body is not that shape, and '
  'check:store-doors-decide census 14 re-proves every one of them on every release.';

-- ── THE ONE DEFINITION OF THE SHAPE ────────────────────────────────────────────────────────
-- Read by the live DDL guard AND by check:store-doors-decide, so the declaration-time refusal
-- and the release-time census can never mean different things by the same word.
create or replace function platform.door_body_is_refusal_only(p_oid oid, out ok boolean, out why text)
returns record
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_src  text;
  v_body text;
  v_bad  text;
begin
  select p.prosrc into v_src from pg_proc p where p.oid = p_oid;
  if v_src is null then
    ok := false; why := 'there is no such function'; return;
  end if;

  -- COMMENTS ARE NOT CODE AND ARE NOT A PROMISE. A sentence saying "this only raises" is
  -- exactly what a body that does more would carry, so both `--` and `/* */` go first.
  v_body := regexp_replace(v_src, '/\*.*?\*/', ' ', 'gs');
  v_body := regexp_replace(v_body, '--[^' || chr(10) || ']*', ' ', 'g');
  -- A string literal may legitimately contain any word at all — the refusal sentence itself
  -- says "records", "delete", "select" is plausible — so every literal is blanked before the
  -- forbidden words are looked for. What is left is the CODE.
  v_body := regexp_replace(v_body, '''([^'']|'''')*''', ' '''' ', 'g');
  v_body := btrim(regexp_replace(v_body, '\s+', ' ', 'g'));

  -- ONE STATEMENT, AND IT RAISES. `raise exception` must be the first word after `begin`, and
  -- the only statement terminator before `end` is that statement's own.
  if v_body !~* '^declare\s.*begin\s+raise\s+exception|^begin\s+raise\s+exception' then
    ok := false;
    why := 'the first statement after BEGIN is not a RAISE EXCEPTION, so this body does '
        || 'something before it refuses';
    return;
  end if;

  -- NOTHING ELSE HAPPENS. Every one of these words means a read, a write, a branch, a loop, a
  -- call or a value coming back — and a refusal_only door does none of them, which is the only
  -- reason it needs no access decision.
  select string_agg(w, ', ' order by w) into v_bad
    from unnest(array['select','insert','update','delete','perform','execute','call',
                      'return','into','loop','if ','case','assert','copy','merge']) as w
   where v_body ~* ('(^|[^a-z_])' || replace(w, ' ', '\s') || '($|[^a-z_])');
  if v_bad is not null then
    ok := false;
    why := 'the body names ' || v_bad || ' — a door callable only to be refused reads nothing, '
        || 'writes nothing, branches nowhere and returns nothing';
    return;
  end if;

  ok := true;
  why := 'one statement, and it raises';
end;
$fn$;

comment on function platform.door_body_is_refusal_only(oid) is
  'STORE-TXN-4. THE ONE definition of the refusal_only door shape: comments stripped, string '
  'literals blanked, the first statement after BEGIN must be RAISE EXCEPTION and the code must '
  'name nothing that reads, writes, branches, loops, calls or returns. Read by the live guard '
  'platform.door_body_must_decide and by check:store-doors-decide census 14, so a declaration '
  'and a census can never disagree about what the word means.';

-- ── THE LIVE GUARD LEARNS THE WORD, AND LEARNS TO REFUSE IT FALSELY CLAIMED ────────────────
-- Everything above the new arm is byte-identical to the body pinned by `-- based-on:`.
create or replace function platform.door_body_must_decide()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  fn record;
  v_ref text;
  v_ids text[];
  v_shape record;
begin
  -- Only a row that OPENS a client lane makes the promise this guard enforces.
  if not (new.signed_in_callers or new.anonymous_callers) then
    return new;
  end if;

  select p.oid, p.prosecdef, p.prorettype,
         pg_get_function_identity_arguments(p.oid) as ia
    into fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = new.schema_name
     and p.proname = new.function_name
     and platform.door_argtypes(p.proargtypes) = new.identity_argtypes
   limit 1;
  if not found or not fn.prosecdef then
    -- DD-223 already owns "the door names no function"; a SECURITY INVOKER function is
    -- bounded by RLS and is not this guard's business.
    return new;
  end if;
  if fn.prorettype in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype) then
    return new;
  end if;

  -- ── STORE-TXN-4: THE THIRD KIND OF DOOR, AND IT IS CHECKED, NEVER TAKEN ON TRUST ─────────
  -- A door a client may call that does NOTHING needs no access decision, because there is
  -- nothing to decide about: the body's first and only statement raises. That is a claim about
  -- BYTES, so it is tested against the bytes. A row that claims the word over a body that does
  -- anything at all is refused HERE, at declaration, where the person who wrote it is standing.
  if coalesce(new.refusal_only, false) then
    select * into v_shape from platform.door_body_is_refusal_only(fn.oid);
    if v_shape.ok then
      return new;
    end if;
    raise exception
      'ddl_guard[refusal_only_door_does_something]: %.%(%) is declared refusal_only — a door a '
      'client may call ONLY to be refused, in our own words instead of PostgreSQL''s '
      '"permission denied for function" — but %. A refusal_only door needs no access decision '
      'precisely BECAUSE nothing happens; the moment something happens, the word is a permission '
      'slip and this row would have excused a real door from the one ladder.',
      new.schema_name, new.function_name, fn.ia, v_shape.why
      using errcode = '42501',
            hint = 'Either make the body one statement — RAISE EXCEPTION with the sentence and '
                || 'its remedy, no reads, no writes, no branches — or drop refusal_only and '
                || 'decide access in the body through the one ladder like every other door. '
                || 'The shape is defined once, in platform.door_body_is_refusal_only(oid), and '
                || 'pnpm check:store-doors-decide re-proves every refusal_only door on the live '
                || 'database at every release.';
  end if;

  select coalesce(array_agg(coalesce(pr.proargnames[t.ord], 'arg' || t.ord)), array[]::text[])
    into v_ids
    from pg_proc pr, unnest(pr.proargtypes) with ordinality as t(typ, ord)
   where pr.oid = fn.oid
     and t.typ in ('pg_catalog.uuid'::regtype, 'pg_catalog.uuid[]'::regtype);
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return new;   -- takes no id: there is no row for a caller to name
  end if;

  if platform.definer_body_decides_access(fn.oid) then
    return new;
  end if;

  v_ref := format('%s.%s(%s)', new.schema_name, new.function_name, fn.ia);
  if exists (select 1 from platform.provision_spec_grandfather g
              where g.lane = 'definer_no_access_decision' and g.object_ref = v_ref) then
    return new;   -- excused, counted, and shrink-only
  end if;

  raise exception
    'ddl_guard[definer_no_access_decision]: % is SECURITY DEFINER, this row opens it to a '
    'client, and it takes the id(s) % — but neither its body nor anything it calls reaches an '
    'access decision. A door row is not a door check: seo.keyword_value_map had a truthful door '
    'row and returned 114,686 rows of another tenant''s data to a non-member (2026-09-17). '
    'Decide access in the body BEFORE the first read — iam.has_access(token, id, level), the '
    'shared assert helper for that entity, or an auth.uid() ownership test that is lawful for '
    'this row — and decide it before existence, so a foreign id and an invented one answer '
    'identically.',
    v_ref, array_to_string(v_ids, ', ')
    using errcode = '42501',
          hint = 'platform.definer_body_lint_findings() lists every function in this state; '
                 'platform.definer_access_decision_regex() is what "an access decision" means here. '
                 'If this really is the rare body whose decision none of those shapes can express, '
                 'the shrink-only list platform.provision_spec_grandfather (lane '
                 'definer_no_access_decision) is seeded from introspection, never by hand.';
end;
$fn$;

-- ── THE FIRST refusal_only DOOR ────────────────────────────────────────────────────────────
-- One statement. It reads nothing, writes nothing, decides nothing, and returns nothing —
-- which is exactly why it is allowed to decide nothing.
create or replace function custom.migrate_purge_hard_request(
  p_organization_id    uuid,
  p_table_id           uuid,
  p_compliance_reason  text)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  raise exception 'Destroying records for good is not something a signed-in caller does here, and nothing was destroyed.'
    using errcode = '42501',
          hint = 'The owner''s law of 2026-09-20 is archive, never delete: custom.migrate_purge(organization, table, false) archives the records and every one of them stays restorable, which is what almost every "delete these" really means. A COMPLIANCE ERASURE — permanent, unrecoverable, for a legal obligation — is custom.migrate_purge_hard, and it is run by a person at a terminal who owns the record store, needs a written reason of at least forty characters, and destroys nothing that has not already been archived for thirty days. Ask an owner of this organization to start that, and say in one sentence who asked for the erasure and under what obligation.';
end;
$fn$;

comment on function custom.migrate_purge_hard_request(uuid, uuid, text) is
  'STORE-TXN-4. The FIRST refusal_only door: a client may call it, it does nothing at all, and '
  'its one statement says why a hard purge is not a thing a signed-in seat does and what to do '
  'instead. It exists so the answer is a sentence with a remedy rather than PostgreSQL''s '
  '"permission denied for function migrate_purge_hard" (VERIFIER-13 item 2). The real door, '
  'custom.migrate_purge_hard, is untouched and still chair-only.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers, refusal_only)
values
  ('custom', 'migrate_purge_hard_request',
   'p_organization_id uuid, p_table_id uuid, p_compliance_reason text',
   array['uuid','uuid','text']::regtype[]::oid[],
   'refusal_only. NO argument is checked against anything, and that is correct here rather than '
   'excused: the body''s first and only statement raises, so a foreign organization id, an '
   'invented one, a NULL and the caller''s own all produce the identical sentence and nothing is '
   'read or written in any of those cases. The arguments exist only so a client can call this '
   'with the same shape it would have used for the real door and get an answer it can show '
   'somebody. platform.door_body_is_refusal_only proves that claim against the bytes, at '
   'declaration and again at every release.',
   'migrations/campaign/storetxn4b_a_door_may_be_callable_only_to_be_refused.sql (lane STORE-TXN-4)',
   true, false, true);

grant execute on function custom.migrate_purge_hard_request(uuid, uuid, text) to authenticated;

-- The chair-only door's own register row learns where the person is now sent. Its behaviour,
-- its grants and its body are untouched: this replaces a paragraph that ends "the remedy is a
-- register word … or a separate request door" with the one that was built.
update platform.client_callable_door
   set non_client_lane = non_client_lane
     || ' STORE-TXN-4 2026-09-22: CLOSED. The register word is `refusal_only` and the client'
     || ' surface is custom.migrate_purge_hard_request(organization, table, reason), a door that'
     || ' is callable, does nothing, and raises this door''s own sentence with its remedy. This'
     || ' function stays chair-only and ungranted.'
 where schema_name = 'custom'
   and function_name = 'migrate_purge_hard'
   and non_client_lane is not null
   and non_client_lane not like '%STORE-TXN-4 2026-09-22: CLOSED%';
