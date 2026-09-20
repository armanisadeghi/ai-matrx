-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom._sign_request_resolve(text) 3b74b7a73555da0c1228d873158d3e80e9102fbac05622451c6b936ca2687e14
--
-- LANE ESIGN — A SERVER-LANE SIGNING DOOR ACTS AS THE PERSON WHO ASKED. THE CLASS, NOT THE
-- THIRD INSTANCE.
--
-- Three refusals came out of one browser session, each from a different function and each
-- with the store's own sentence:
--
--   1. opening the link      -> custom.table_type_field   (the re-render for the hash check)
--   2. pressing Sign         -> custom.table_type_field   (the File holding the drawn mark)
--   3. pressing Sign again   -> custom.applicable_fields  (custom.io_record_changed, the
--                                                          trigger on the request's own row)
--
-- All three are the same fact: the signing doors are server-lane, so their caller is
-- `service_role` holding NO claims, and every write they make lands in `custom.record`,
-- which asks a membership question on the way in and on the way out. The first two were
-- fixed where they were found, which was fixing instances; the third proved there was a
-- class, because `custom.io_record_changed` fires on EVERY update any of the three doors
-- makes and there was no reason to believe it was the last one.
--
-- THE CLASS: a server-lane door acting on a signature request is acting on the ASKER's own
-- record, so it must act as the asker. `custom._sign_request_resolve` is the one place a
-- token becomes a request, so it is the one place the session takes that identity. Every
-- write in all three doors is covered by that single line, and the borrow already inside
-- `custom.sign_request_sign` becomes a no-op rather than a second mechanism.
--
-- The full reasoning — why it is not restored, and what it deliberately does not grant — is
-- in the function body, where the next reader will be standing.

CREATE OR REPLACE FUNCTION custom._sign_request_resolve(p_token text)
 RETURNS TABLE(organization_id uuid, request_id uuid, data jsonb, ok boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_asker uuid;
  v_b   bytea := custom.sign_token_decode(p_token);
  v_org uuid;
  v_id  uuid;
  v_d   jsonb;
  v_n   integer;
begin
  if v_b is null then
    return;                      -- a link that is not one of ours resolves to nothing at all
  end if;
  v_org := encode(substring(v_b from 1 for 16), 'hex')::uuid;
  v_id  := encode(substring(v_b from 17 for 16), 'hex')::uuid;

  -- THE POINT READ. `custom.record`'s primary key is (organization_id, id) and the store is
  -- hash partitioned on organization_id, so this prunes to ONE partition. That is the whole
  -- reason the token carries its own address.
  select r.data into v_d
    from custom.record r
   where r.organization_id = v_org and r.id = v_id
     and r.data_class = 'sign_request' and r.deleted_at is null;
  if v_d is null then
    return;
  end if;

  if (v_d ->> 'token_hash') is distinct from encode(sha256(convert_to(p_token, 'UTF8')), 'hex') then
    -- The wrong-secret counter is a write into custom.record too, so it needs the same
    -- identity for the same reason, one statement earlier.
    select r.created_by into v_asker
      from custom.record r
     where r.organization_id = v_org and r.id = v_id;
    if custom.query_principal() is null and v_asker is not null then
      perform set_config('request.jwt.claims',
                         jsonb_build_object('sub', v_asker, 'role', 'authenticated')::text, true);
    end if;
    -- DECISION 6: the wrong secret aimed at a real request is counted, and at ten the request
    -- is stopped. The caller still gets nothing back, so this leaks no fact about the request.
    v_n := coalesce((v_d ->> 'bad_attempts')::integer, 0) + 1;
    update custom.record r
       set data = r.data || jsonb_build_object('bad_attempts', v_n)
                         || case when v_n >= 10 and not (r.data ? 'signed_at')
                                   and not (r.data ? 'declined_at') and not (r.data ? 'invalidated_at')
                                 then jsonb_build_object(
                                   'invalidated_at', now(),
                                   'invalidation_reason', 'This link was tried with the wrong address ten times, so it was stopped. Ask whoever sent it for a new one.')
                                 else '{}'::jsonb end
     where r.organization_id = v_org and r.id = v_id;
    return;
  end if;

  -- ══ THE SESSION BECOMES THE PERSON WHO ASKED, HERE, ONCE ══════════════════════
  -- THE DEFECT THIS CLOSES, measured three times in one browser session on 2026-09-20 and
  -- each time with the store's own sentence — *"You are not a member of that organization,
  -- so custom.table_type_field / custom.applicable_fields has nothing to do there."*
  --
  -- The three signing doors are SERVER-LANE: their caller is `service_role` holding no
  -- claims at all, which is the whole point, because the signer's address and browser have
  -- to be read off the request rather than asserted by a browser. But EVERY write they make
  -- lands in `custom.record`, and the record store asks a MEMBERSHIP question on the way in
  -- and on the way out — `custom.table_type_field` inside the merge, `custom.io_record_changed`
  -- inside the update trigger, `custom.applicable_fields` inside that. So a caller with no
  -- principal is not a member of any organization on the platform, correctly, and the first
  -- three writes each failed at a different one of those places.
  --
  -- Patching them one at a time was fixing instances. The CLASS is: *a server-lane door
  -- acting on a signature request acts on the ASKER's own record, and must therefore act as
  -- the asker.* This is the one place where the request's identity is established, so it is
  -- the one place the session takes that identity — AGT-N-5, and the same borrow
  -- `custom.anon_clear` makes for a stranger's form answer.
  --
  -- WHY IT IS NOT RESTORED HERE. `set_config(..., is_local => true)` is scoped to the
  -- TRANSACTION, and these three doors are each the whole of one: PostgREST runs one call
  -- per transaction, and Postgres unwinds the setting at its end whether the door returned
  -- or raised — a stronger guarantee than an exception handler. This function is granted to
  -- NOBODY and is called only from those three doors, so there is no other caller whose
  -- session could be changed under it.
  --
  -- WHAT IT DOES NOT GRANT. The asker is borrowed to WRITE THE ASKER'S OWN RECORD, and the
  -- doors write nothing else: the signature Value, its seal, the File holding the drawn mark
  -- and the request's own answer. It never borrows to READ anything back to the signer — what
  -- the signer is shown is the frozen body of `custom.doc_render` and nothing more.
  select r.created_by into v_asker
    from custom.record r
   where r.organization_id = v_org and r.id = v_id;
  if custom.query_principal() is null and v_asker is not null then
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_asker, 'role', 'authenticated')::text, true);
  end if;

  organization_id := v_org; request_id := v_id; data := v_d; ok := true;
  return next;
end;
$function$


