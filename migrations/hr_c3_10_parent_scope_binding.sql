-- HR domain C3 — migration 10 (register item HRB-007 follow-up, lane core-c3-access).
--
-- 🚨 `parent_id` WAS A WILDCARD OVER IDs. C7's cleanup probes found that the shared matcher in
-- `platform.assert_outsider_scope` read a parent-scoped grant as:
--
--     (g ->> 'id')::uuid is not distinct from p_id  OR  (g ->> 'parent_id') is not null
--
-- The second disjunct ignores `p_id` entirely. So a `download` grant scoped to ONE envelope's
-- documents passed the scope check for **any other envelope's document** — and for every other
-- parent-scoped grant in the system: another incident's parties, another incident's restricted
-- notes, another checklist run's items, another application's interviews.
--
-- Nothing leaked today, because `_act_download` scopes to the envelope again on its own. That is
-- exactly the shape worth fixing rather than shrugging at: **two layers existed, only the outer one
-- was load-bearing, and §5.3 law 1 promises the inner one is** — *"Every grant names a concrete
-- resource plus EITHER an id OR a parent_id"*, which is a promise about what the SCOPE CHECK
-- enforces. A future consumer trusting the shared helper — which §5.4 tells it to, "no RPC
-- hand-rolls this check" — would have been open, and it would have looked correct.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. THE PARENT IS RESOLVED FROM THE REGISTRY, NOT FROM A HARD-CODED COLUMN MAP.
--    `platform.entity_relationships` already declares every composition/containment edge and the
--    FK column that carries it, so the matcher reads the child's ACTUAL parent through the same
--    registry the access kernel walks. Four of the five live parent-scoped resources resolve this
--    way (`esign_envelope_document` → `envelope_id`, `hr_incident_party` → `incident_id`,
--    `hr_checklist_item` → `checklist_run_id`, `hr_interview` → `application_id`). Hard-coding a
--    map would have gone stale the first time a lane added a purpose.
--
-- 2. `hr_restricted_note` IS THE ONE THAT HAS NO EDGE, BY DESIGN, AND IS HANDLED BY NAME-SHAPE.
--    It is the merged owner-only lane and points at its subject through `subject_token` /
--    `subject_id` rather than a registered edge (SPEC-DATA-MODEL §10.3 — an edge would convey
--    access, which is precisely what that table must not do). The matcher therefore accepts a
--    `subject_id` match as the parent relation for any table carrying that pair.
--
-- 3. 🚨 A PARENT-SCOPED GRANT AUTHORISES `create` UNDER THE PARENT, AND BINDS EVERYTHING ELSE.
--    A `create` has no child id yet — the parent IS the container, and that is the legitimate use
--    of `parent_id` (the apply form creates an application under a posting; the anonymous reporter
--    creates an incident under an org). For every other action the child must exist and its real
--    parent must match. So `create` and a NULL child id keep container semantics; `read`,
--    `download`, `write_note`, `append` and the rest are bound.
--
-- 4. FAIL-CLOSED ON AN UNRESOLVABLE PARENT, and this has one real consequence worth naming rather
--    than burying: **`hr.anonymous_report` scopes `hr_incident` by `parent_id = organization_id`**,
--    because the token is minted BEFORE the incident exists. `hr_incident` has no registered parent
--    edge and no `subject_id`, so its non-`create` actions (`append`, `read_replies`) now refuse.
--    That is the correct answer — the alternative is a token that can append to and read replies on
--    ANY incident in the org, which is the same wildcard one level up — and it costs nothing today
--    because L9 has not built those RPCs. **The right shape is for the reporter's token to be
--    re-scoped to the incident id once it is created; ROUTED to the L9 / HRB-021 owner.** Accepting
--    `organization_id` as a parent would have quietly re-opened the hole this migration closes.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ the parent relation
create or replace function platform._outsider_parent_matches(
  p_resource text, p_id uuid, p_parent uuid)
returns boolean
language plpgsql stable security definer set search_path = platform, public
as $fn$
declare v_schema text; v_table text; rec record; v_val uuid;
begin
  if p_id is null or p_parent is null then return false; end if;

  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = p_resource;
  if v_schema is null then return false; end if;   -- unknown token: fail closed

  -- (1) RECORDED DECISION 1: every registered composition/containment edge for this child
  for rec in
    select er.fk_column from platform.entity_relationships er
     where er.child_type = p_resource and er.kind in ('composition','containment')
  loop
    begin
      execute format('select %I from %I.%I where id = $1', rec.fk_column, v_schema, v_table)
         into v_val using p_id;
    exception when others then v_val := null;
    end;
    if v_val is not null and v_val = p_parent then return true; end if;
  end loop;

  -- (2) RECORDED DECISION 2: the subject_token/subject_id shape (hr.restricted_note), which
  -- deliberately has no registered edge because an edge would convey access
  if exists (select 1 from information_schema.columns
              where table_schema = v_schema and table_name = v_table and column_name = 'subject_id')
  then
    begin
      execute format('select subject_id from %I.%I where id = $1', v_schema, v_table)
         into v_val using p_id;
    exception when others then v_val := null;
    end;
    if v_val is not null and v_val = p_parent then return true; end if;
  end if;

  -- (3) RECORDED DECISION 4: no resolvable parent relation ⇒ REFUSE. The owning tenant is
  -- deliberately NOT accepted as a parent — that is the same wildcard one level up.
  return false;
end
$fn$;

comment on function platform._outsider_parent_matches is
  'SPEC-ESIGN §5.3 law 1: a parent-scoped grant binds the child to THAT parent. Resolves the child''s real parent through platform.entity_relationships, or through the subject_token/subject_id pair for the tables that deliberately carry no edge. Fail-closed: organization_id is never a parent, because that is the same wildcard one level up.';

revoke all on function platform._outsider_parent_matches(text, uuid, uuid) from public;
revoke all on function platform._outsider_parent_matches(text, uuid, uuid) from anon;
grant execute on function platform._outsider_parent_matches(text, uuid, uuid) to authenticated, service_role;

-- ============================================================ the matcher, bound
create or replace function platform.assert_outsider_scope(
  p_session text, p_resource text, p_id uuid, p_action text, p_ip inet default null)
returns jsonb
language plpgsql security definer set search_path = platform, public
as $fn$
declare
  s platform.actor_session%rowtype;
  t platform.actor_token%rowtype;
  g jsonb; ok boolean := false; v_reason text; v_saw_parent boolean := false;
  c_uniform constant text := 'This link is no longer valid — ask the sender for a new one.';
begin
  select * into s from platform.actor_session
   where session_hash = encode(extensions.digest(coalesce(p_session,''),'sha256'),'hex');

  if not found then
    return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid',
                              'message', c_uniform);
  end if;

  select * into t from platform.actor_token where id = s.actor_token_id;

  v_reason := case
    when s.revoked_at is not null                        then 'session_revoked'
    when s.expires_at <= now()                           then 'session_expired'
    when t.verification_factor <> 'none'
         and s.verified_at is null                       then 'session_not_verified'
    when s.ip is not null and p_ip is null               then 'session_ip_unprovable'
    when s.ip is not null and p_ip is distinct from s.ip  then 'session_ip_moved'
    when t.id is null                                    then 'token_missing'
    when not t.is_active or t.revoked_at is not null     then 'token_revoked'
    when t.expires_at <= now()                           then 'token_expired'
    else null
  end;

  if v_reason is null then
    for g in select * from jsonb_array_elements(t.scope -> 'grants') loop
      if (g ->> 'resource') = p_resource
         and p_action in (select jsonb_array_elements_text(coalesce(g -> 'actions','[]'::jsonb)))
      then
        if (g ->> 'id') is not null then
          -- an ID-scoped grant names exactly one row
          if (g ->> 'id')::uuid = p_id then ok := true; exit; end if;

        elsif (g ->> 'parent_id') is not null then
          v_saw_parent := true;
          -- 🚨 §5.3 law 1: parent scope is a CONTAINER, never a wildcard over ids.
          -- RECORDED DECISION 3: `create` (and a null child id) has nothing to bind yet — the
          -- parent IS the container. Every other action binds the child to that parent.
          if p_action = 'create' or p_id is null then
            ok := true; exit;
          elsif platform._outsider_parent_matches(p_resource, p_id, (g ->> 'parent_id')::uuid) then
            ok := true; exit;
          end if;
        end if;
      end if;
    end loop;

    if not ok then
      v_reason := case when v_saw_parent then 'parent_scope_mismatch' else 'scope_not_covered' end;
    end if;
  end if;

  if v_reason is not null then
    insert into platform.actor_token_event
      (organization_id, actor_token_id, session_id, event_type, ip, detail)
    values (t.organization_id, t.id, s.id,
            case when v_reason in ('scope_not_covered','parent_scope_mismatch')
                 then 'scope_rejected' else 'replay_rejected' end,
            p_ip,
            jsonb_build_object('true_reason', v_reason, 'resource', p_resource,
                               'action', p_action, 'target_id', p_id));
    -- THE REFUSAL-ENVELOPE LAW: returned, never raised, or the ledger row above is rolled back
    -- with the exception and §5.7's rate limiting loses its own evidence.
    return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid',
                              'message', c_uniform);
  end if;

  update platform.actor_session set ip = coalesce(s.ip, p_ip) where id = s.id and s.ip is null;

  return jsonb_build_object('granted', true, 'actor_token_id', t.id, 'session_id', s.id,
                            'organization_id', t.organization_id, 'consumer_key', t.consumer_key,
                            'subject_type', t.subject_type, 'subject_id', t.subject_id,
                            'verification_factor', t.verification_factor,
                            'verified_at', s.verified_at, 'ip_pinned', s.ip is not null);
end
$fn$;

-- ============================================================ assertions
do $$
declare v_bad int;
begin
  -- the wildcard shape must be gone from the matcher
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'platform' and p.proname = 'assert_outsider_scope')
     like '%or (g ->> ''parent_id'') is not null%' then
    raise exception 'hr_c3_10: the parent_id wildcard survives in the matcher';
  end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'platform' and p.proname = 'assert_outsider_scope')
     not like '%_outsider_parent_matches%' then
    raise exception 'hr_c3_10: the matcher does not bind a parent-scoped grant to its parent';
  end if;

  -- organization_id must never be accepted as a parent (RECORDED DECISION 4)
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'platform' and p.proname = '_outsider_parent_matches')
     ~ 'select\s+organization_id|=\s*p_parent\s*.*organization' then
    raise exception 'hr_c3_10: the owning tenant is being read as a parent — the same wildcard one level up';
  end if;

  -- the four registry-resolvable parent-scoped resources still have their edges
  select count(*) into v_bad from unnest(ARRAY['esign_envelope_document','hr_incident_party',
                                               'hr_checklist_item','hr_interview']) as c
   where not exists (select 1 from platform.entity_relationships er
                      where er.child_type = c and er.kind in ('composition','containment'));
  if v_bad > 0 then
    raise exception 'hr_c3_10: % parent-scoped resource(s) lost the edge the matcher resolves through', v_bad;
  end if;

  -- and the one that resolves by subject_id still carries it
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'hr' and table_name = 'restricted_note'
                    and column_name = 'subject_id') then
    raise exception 'hr_c3_10: hr.restricted_note lost subject_id; its parent relation is unresolvable';
  end if;

  -- still one uniform refusal, still returned rather than raised
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'platform' and p.proname = 'assert_outsider_scope') like '%raise exception%' then
    raise exception 'hr_c3_10: the helper raises a refusal again; its ledger write would be rolled back';
  end if;

  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  if v_bad > 0 then
    raise exception 'hr_c3_10: % hr tokens no longer certify', v_bad;
  end if;
end $$;
