-- applied to production 2026-10-02 ~11:56–11:57 PT (18:56Z) (ONE-HOME, Supabase MCP / psql); kept as the record.
-- chair-step: lane ONE-HOME wave 3, DD-064 EXPAND+MIGRATE — actor tiers {code, ai, human} become {system, agent, user}
-- (Doctrine §1.5, §1.8, R16; executes DD-014). gh-ost order: expand + migrate (this file) -> code moves -> history
-- backfill (batched, nightly) -> contract (d2: the old words refused).
--   1. Every CHECK that admits only the old words (7 constraints on the definition / association tables) admits
--      BOTH sets for the transition (NOT VALID, then VALIDATE: no ACCESS EXCLUSIVE held during the scan).
--   2. platform.canonical_actor_tier(text) maps old -> new (new and NULL pass through, anything else NULL).
--   3. The tier functions accept both spellings on every channel (app.actor_tier GUC, x-matrx-actor-tier header)
--      and RETURN the new word: actor_tier, declared_actor_tier, actor_declaration_report, _stamp_actor_tier.
--      Every body that compares their result is rewritten in the same transaction (custom.* association/edge
--      doors, set_org_change_policy, write_is_a_persons_own, _stamp_task_origin, dated_change_create, and the
--      record store's two translators custom.actor_word / custom.history_actor), and the
--      eight server bodies that SET app.actor_tier = 'code' set 'system'. Each replacement asserts that its old
--      text was found, so a body that moved since this file was written stops the file by name.
--   4. Small tables are backfilled with triggers off for this transaction only (SET LOCAL session_replication_role
--      = replica: a provenance rename must not stamp new authors, new versions or new updated_at): the six
--      definition/version tables, crm.party, content_ir.kind_instance, platform.org_change_policy,
--      content.document_version, platform.associations (~130k rows).
--   NOT here: history.row_versions (~3.85M rows, partitioned) — a batched per-partition backfill (plan §D).
-- Locks: SHARE ROW EXCLUSIVE→ACCESS EXCLUSIVE briefly for each DROP/ADD CONSTRAINT ... NOT VALID (7 tables,
--   incl. the hot platform.associations), SHARE UPDATE EXCLUSIVE for VALIDATE; row locks on ~150k rows.
--   lock_timeout 3s; retry on timeout.
-- Idempotent: constraints are re-created by name; replacements skip a body that already says the new word;
--   the backfill touches only rows still holding an old word.
set local lock_timeout = '3s';
set local statement_timeout = '600s';

-- Body-rewrite helper (session-temporary; gone at disconnect). Re-creates one function from its live
-- definition with a text replacement. A SECURITY DEFINER, non-trigger function with no access decision on
-- record gets one in the same transaction (provision_shape_guard), and ONLY when its live ACL already
-- reaches no client role — the declaration then states today's truth, it changes no access. A definer
-- function a client can call with no door on record stops the file: that is an access decision, not a rename.
-- A body a DDL guard refuses to re-create (a law written after the function was born) is left as it is and
-- listed in pg_temp.onehome_blocked + a WARNING; the contract step refuses while any such body remains.
create temp table if not exists onehome_blocked (fn oid, lane text, why text) on commit drop;
create or replace function pg_temp.onehome_rewrite(p_oid oid, p_new text, p_lane text)
returns boolean language plpgsql as $fn$
declare
  v_def text := pg_get_functiondef(p_oid);
  r record;
begin
  if p_new is not distinct from v_def then return false; end if;
  select p.oid, n.nspname, p.proname, p.prosecdef, p.prorettype, p.proacl,
         pg_get_function_identity_arguments(p.oid) as ident,
         array(select t::oid from unnest(p.proargtypes) t)::oid[] as argtypes
    into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = p_oid;
  begin
    if r.prosecdef and r.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
       and not exists (select 1 from platform.client_callable_door d
                        where d.schema_name = r.nspname and d.function_name = r.proname and d.identity_args = r.ident) then
      if r.proacl is null
         or exists (select 1 from aclexplode(r.proacl) a
                     where a.privilege_type = 'EXECUTE'
                       and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))) then
        raise exception '%: %.%(%) is SECURITY DEFINER, reachable by a client role, and has no access decision on record — declaring one is an access decision, not part of a rename', p_lane, r.nspname, r.proname, r.ident
          using errcode = 'P0001';
      end if;
      insert into platform.client_callable_door
        (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
      values (r.nspname, r.proname, r.ident, r.argtypes,
              'Declared by the ' || p_lane || ' rename while its body was re-created; the declaration records the live grants (postgres/service_role only) and changes no access.',
              'onehome rename manifest ' || p_lane,
              'server_only: its live EXECUTE grant reaches only postgres and service_role, so no browser, extension or desktop client can call it; recorded during the ' || p_lane || ' rename.',
              false, false);
      raise notice '%: declared %.%(%) server_only (its live grants already were)', p_lane, r.nspname, r.proname, r.ident;
    end if;
    execute p_new;
  exception when check_violation then
    -- A DDL guard (event trigger) refuses to re-create a body that breaks a law written after it was born
    -- (e.g. the ddl_guard on organization-assigning trigger functions). Fixing that defect is that law's
    -- owner's work, not this rename's: record it, keep the old body, carry on.
    insert into pg_temp.onehome_blocked values (p_oid, p_lane, sqlerrm);
    raise warning '%: %.%(%) NOT rewritten — a DDL guard refuses its re-creation: %', p_lane, r.nspname, r.proname, r.ident, sqlerrm;
    return false;
  end;
  return true;
end
$fn$;

-- 1. constraints admit both sets
do $$
declare r record; v_col text;
begin
  for r in select c.conrelid::regclass as rel, c.conname, pg_get_constraintdef(c.oid) as def
             from pg_constraint c
            where c.contype = 'c' and pg_get_constraintdef(c.oid) ~ '(updated|created)_by_tier'
              and pg_get_constraintdef(c.oid) ~ '''code''::text, ''ai''::text, ''human''::text'
              and pg_get_constraintdef(c.oid) !~ '''system''::text'
  loop
    v_col := substring(r.def from '\((\w+_by_tier) IS NULL\)');
    if v_col is null then raise exception 'DD-064: unexpected constraint shape on %: %', r.rel, r.def; end if;
    execute format('alter table %s drop constraint %I', r.rel, r.conname);
    execute format('alter table %s add constraint %I check (%I is null or %I = any (array[''system'', ''agent'', ''user'', ''code'', ''ai'', ''human''])) not valid',
                   r.rel, r.conname, v_col, v_col);
    execute format('alter table %s validate constraint %I', r.rel, r.conname);
    raise notice 'DD-064: % % admits both spellings for the transition', r.rel, r.conname;
  end loop;
end $$;

-- 2. the mapping
create or replace function platform.canonical_actor_tier(p_tier text)
returns text language sql immutable parallel safe
set search_path to 'pg_catalog'
as $f$
  select case lower(trim(p_tier))
           when 'system' then 'system' when 'agent' then 'agent' when 'user' then 'user'
           when 'code' then 'system' when 'ai' then 'agent' when 'human' then 'user'
         end
$f$;
comment on function platform.canonical_actor_tier(text) is
  'DD-064: the actor tier in the Doctrine''s words (system | agent | user). During the transition it also maps the retired spellings code -> system, ai -> agent, human -> user; onehome_d2 removes that mapping. NULL and anything else -> NULL.';

-- 3. bodies
create or replace function pg_temp.onehome_sub(p_def text, p_from text, p_to text, p_where text)
returns text language plpgsql as $f$
begin
  if position(p_to in p_def) > 0 and position(p_from in p_def) = 0 then return p_def; end if;  -- already rewritten
  if position(p_from in p_def) = 0 then
    raise exception 'DD-064: % no longer contains the text this file was written against: %', p_where, p_from;
  end if;
  return replace(p_def, p_from, p_to);
end
$f$;

do $$
declare
  v_fn regprocedure;
  v_def text;
  r record;
begin
  -- platform.actor_tier(): the fallback a *_by_tier column takes when nothing was declared
  v_fn := 'platform.actor_tier()'::regprocedure;
  v_def := pg_get_functiondef(v_fn);
  v_def := pg_temp.onehome_sub(v_def, $a$    IF raw IN ('code', 'ai', 'human') THEN
      RETURN raw;
    END IF;
    RAISE WARNING '[provenance] invalid app.actor_tier=%; must be code|ai|human — using the documented default', raw;$a$,
    $a$    IF platform.canonical_actor_tier(raw) IS NOT NULL THEN
      RETURN platform.canonical_actor_tier(raw);
    END IF;
    RAISE WARNING '[provenance] invalid app.actor_tier=%; must be system|agent|user — using the documented default', raw;$a$, 'platform.actor_tier');
  v_def := pg_temp.onehome_sub(v_def, $a$fallback := CASE WHEN identity IS NOT NULL THEN 'human' ELSE 'code' END;$a$,
                                      $a$fallback := CASE WHEN identity IS NOT NULL THEN 'user' ELSE 'system' END;$a$, 'platform.actor_tier');
  perform pg_temp.onehome_rewrite(v_fn, v_def, 'DD-064');

  -- platform.declared_actor_tier(): the raw declaration
  v_fn := 'platform.declared_actor_tier()'::regprocedure;
  v_def := pg_get_functiondef(v_fn);
  v_def := pg_temp.onehome_sub(v_def, $a$    IF raw IN ('code', 'ai', 'human') THEN
      RETURN raw;
    END IF;
    RAISE WARNING '[provenance] invalid app.actor_tier=% — must be code|ai|human.$a$,
    $a$    IF platform.canonical_actor_tier(raw) IS NOT NULL THEN
      RETURN platform.canonical_actor_tier(raw);
    END IF;
    RAISE WARNING '[provenance] invalid app.actor_tier=% — must be system|agent|user.$a$, 'platform.declared_actor_tier');
  v_def := pg_temp.onehome_sub(v_def, $a$        IF hdr IN ('ai', 'code') THEN
          RETURN hdr;
        END IF;$a$,
    $a$        IF hdr IN ('agent', 'system', 'ai', 'code') THEN
          RETURN platform.canonical_actor_tier(hdr);
        END IF;$a$, 'platform.declared_actor_tier');
  v_def := pg_temp.onehome_sub(v_def, $a$must be ai|code (omit the header for a person''s own action)$a$,
                                      $a$must be agent|system (omit the header for a person''s own action)$a$, 'platform.declared_actor_tier');
  v_def := pg_temp.onehome_sub(v_def, $a$    RETURN 'human';$a$, $a$    RETURN 'user';$a$, 'platform.declared_actor_tier');
  v_def := pg_temp.onehome_sub(v_def, $a$UNDECLARED, never 'human'$a$, $a$UNDECLARED, never 'user'$a$, 'platform.declared_actor_tier');
  perform pg_temp.onehome_rewrite(v_fn, v_def, 'DD-064');

  -- platform.actor_declaration_report()
  v_fn := 'platform.actor_declaration_report()'::regprocedure;
  v_def := pg_get_functiondef(v_fn);
  v_def := pg_temp.onehome_sub(v_def, $a$IF raw IS NOT NULL AND raw IN ('code','ai','human') THEN$a$,
                                      $a$IF raw IS NOT NULL AND platform.canonical_actor_tier(raw) IS NOT NULL THEN$a$, 'platform.actor_declaration_report');
  v_def := pg_temp.onehome_sub(v_def, $a$IF hdr IN ('ai','code') THEN$a$, $a$IF hdr IN ('agent','system','ai','code') THEN$a$, 'platform.actor_declaration_report');
  perform pg_temp.onehome_rewrite(v_fn, v_def, 'DD-064');

  -- platform._stamp_actor_tier(): every comparison against what declared_actor_tier/actor_tier now return
  v_fn := 'platform._stamp_actor_tier()'::regprocedure;
  v_def := pg_get_functiondef(v_fn);
  v_def := pg_temp.onehome_sub(v_def, $a$IF tier IN ('ai', 'code') AND sys IS NULL THEN$a$, $a$IF tier IN ('agent', 'system') AND sys IS NULL THEN$a$, 'platform._stamp_actor_tier');
  v_def := pg_temp.onehome_sub(v_def, $a$A `human` tier is exempt on purpose$a$, $a$A `user` tier is exempt on purpose$a$, 'platform._stamp_actor_tier');
  v_def := pg_temp.onehome_sub(v_def, $a$IF tier = 'human' AND agent_id IS NOT NULL THEN$a$, $a$IF tier = 'user' AND agent_id IS NOT NULL THEN$a$, 'platform._stamp_actor_tier');
  v_def := pg_temp.onehome_sub(v_def, $a$This write declares actor_tier=human AND an actor_agent.$a$, $a$This write declares actor_tier=user AND an actor_agent.$a$, 'platform._stamp_actor_tier');
  v_def := pg_temp.onehome_sub(v_def, $a$declare actor_tier=ai and the agent that is running$a$, $a$declare actor_tier=agent and the agent that is running$a$, 'platform._stamp_actor_tier');
  v_def := pg_temp.onehome_sub(v_def, $a$IF raw_tier = 'human' THEN$a$, $a$IF raw_tier = 'user' THEN$a$, 'platform._stamp_actor_tier');
  v_def := pg_temp.onehome_sub(v_def, $a$ELSIF raw_tier IN ('ai', 'code') THEN$a$, $a$ELSIF raw_tier IN ('agent', 'system') THEN$a$, 'platform._stamp_actor_tier');
  perform pg_temp.onehome_rewrite(v_fn, v_def, 'DD-064');

  -- the custom.* doors that ask "is a machine writing?"
  for r in select p.oid from pg_proc p
            where p.pronamespace = 'custom'::regnamespace
              and p.prosrc like '%coalesce(platform.declared_actor_tier(), platform.actor_tier()) in (''ai'', ''code'')%'
  loop
    perform pg_temp.onehome_rewrite(r.oid,
      replace(pg_get_functiondef(r.oid), $a$coalesce(platform.declared_actor_tier(), platform.actor_tier()) in ('ai', 'code')$a$,
                                         $a$coalesce(platform.declared_actor_tier(), platform.actor_tier()) in ('agent', 'system')$a$), 'DD-064');
  end loop;

  -- platform.set_org_change_policy: actor_tier() now answers 'user' for a person
  select p.oid::regprocedure into v_fn from pg_proc p where p.oid = 'platform.set_org_change_policy'::regproc;
  v_def := pg_get_functiondef(v_fn);
  v_def := pg_temp.onehome_sub(v_def, $a$if v_uid is null and v_tier <> 'human' then$a$, $a$if v_uid is null and v_tier <> 'user' then$a$, 'platform.set_org_change_policy');
  v_def := pg_temp.onehome_sub(v_def, $a$  if v_tier <> 'human' then$a$, $a$  if v_tier <> 'user' then$a$, 'platform.set_org_change_policy');
  perform pg_temp.onehome_rewrite(v_fn, v_def, 'DD-064');

  -- platform.write_is_a_persons_own: reads the RAW GUC, so it accepts both spellings of a person
  v_fn := 'platform.write_is_a_persons_own()'::regprocedure;
  v_def := pg_get_functiondef(v_fn);
  v_def := pg_temp.onehome_sub(v_def, $a$if v_tier is not null and v_tier <> 'human' then return false; end if;$a$,
                                      $a$if v_tier is not null and platform.canonical_actor_tier(v_tier) is distinct from 'user' then return false; end if;$a$, 'platform.write_is_a_persons_own');
  v_def := pg_temp.onehome_sub(v_def, $a$an agent's turn (`ai`), the
  -- platform's own machinery (`code`)$a$, $a$an agent's turn (`agent`), the
  -- platform's own machinery (`system`)$a$, 'platform.write_is_a_persons_own');
  perform pg_temp.onehome_rewrite(v_fn, v_def, 'DD-064');

  -- _stamp_task_origin (schema workspace, or projects once DD-067 ran)
  select p.oid::regprocedure into v_fn from pg_proc p
   where p.proname = '_stamp_task_origin' and p.pronamespace in (select oid from pg_namespace where nspname in ('workspace', 'projects'));
  if v_fn is not null then
    v_def := pg_get_functiondef(v_fn);
    v_def := pg_temp.onehome_sub(v_def, $a$if platform.actor_tier() = 'ai' and$a$, $a$if platform.actor_tier() = 'agent' and$a$, '_stamp_task_origin');
    perform pg_temp.onehome_rewrite(v_fn, v_def, 'DD-064');
  end if;

  -- platform.dated_change_create: the client passes provenance; both spellings are accepted during the transition
  select p.oid::regprocedure into v_fn from pg_proc p where p.oid = 'platform.dated_change_create'::regproc;
  v_def := pg_get_functiondef(v_fn);
  v_def := pg_temp.onehome_sub(v_def, $a$if p_provenance is not null and p_provenance not in ('ai', 'human', 'code') then$a$,
                                      $a$if p_provenance is not null and platform.canonical_actor_tier(p_provenance) is null then$a$, 'platform.dated_change_create');
  v_def := pg_temp.onehome_sub(v_def, $a$'dated_change_provenance: provenance is ai, human or code.'$a$, $a$'dated_change_provenance: provenance is agent, user or system.'$a$, 'platform.dated_change_create');
  v_def := pg_temp.onehome_sub(v_def, $a$perform set_config('app.actor_tier', p_provenance, true);$a$,
                                      $a$perform set_config('app.actor_tier', platform.canonical_actor_tier(p_provenance), true);$a$, 'platform.dated_change_create');
  perform pg_temp.onehome_rewrite(v_fn, v_def, 'DD-064');

  -- the record store translates the platform's declaration into its own words through custom.retired_actor_words()
  -- (ai -> agent, code -> system, human -> user). The declaration now arrives in those words already, so a value the
  -- map does not know but the store's vocabulary does is taken as it is (actor_word), and a history row stamped in
  -- the new words is labelled by them instead of falling through to 'system' (history_actor).
  v_fn := 'custom.actor_word(text)'::regprocedure;
  v_def := pg_get_functiondef(v_fn);
  v_def := pg_temp.onehome_sub(v_def, $a$    v_word := v_map ->> v_live;$a$,
    $a$    v_word := coalesce(v_map ->> v_live, case when v_live = any (custom.actor_vocabulary()) then v_live end);$a$, 'custom.actor_word');
  perform pg_temp.onehome_rewrite(v_fn, v_def, 'DD-064');
  v_fn := 'custom.history_actor(text,jsonb,uuid,jsonb)'::regprocedure;
  v_def := pg_get_functiondef(v_fn);
  v_def := pg_temp.onehome_sub(v_def, $a$                    custom.retired_actor_words() ->> p_tier,
                    'system') as kind,$a$,
    $a$                    custom.retired_actor_words() ->> p_tier,
                    case when p_tier in ('user', 'agent', 'system') then p_tier end,
                    'system') as kind,$a$, 'custom.history_actor');
  perform pg_temp.onehome_rewrite(v_fn, v_def, 'DD-064');

  -- server bodies that declare themselves the platform's own machinery
  for r in select p.oid from pg_proc p
            where p.prosrc ~ 'set_config\(''app\.actor_tier'', ''code'', true\)'
  loop
    perform pg_temp.onehome_rewrite(r.oid,
      regexp_replace(pg_get_functiondef(r.oid), 'set_config\(''app\.actor_tier'', ''code'', true\)', 'set_config(''app.actor_tier'', ''system'', true)', 'gi'), 'DD-064');
  end loop;
end $$;

-- 4. backfill the small tables, triggers off for THIS transaction only
set local session_replication_role = replica;
update agent.definition            set updated_by_tier = platform.canonical_actor_tier(updated_by_tier) where updated_by_tier in ('code', 'ai', 'human');
update agent.definition_version    set created_by_tier = platform.canonical_actor_tier(created_by_tier) where created_by_tier in ('code', 'ai', 'human');
update tool.definition             set updated_by_tier = platform.canonical_actor_tier(updated_by_tier) where updated_by_tier in ('code', 'ai', 'human');
update tool.definition_version     set created_by_tier = platform.canonical_actor_tier(created_by_tier) where created_by_tier in ('code', 'ai', 'human');
update workflow.definition         set updated_by_tier = platform.canonical_actor_tier(updated_by_tier) where updated_by_tier in ('code', 'ai', 'human');
update workflow.definition_version set created_by_tier = platform.canonical_actor_tier(created_by_tier) where created_by_tier in ('code', 'ai', 'human');
update crm.party                   set updated_by_tier = platform.canonical_actor_tier(updated_by_tier) where updated_by_tier in ('code', 'ai', 'human');
update crm.party                   set created_by_tier = platform.canonical_actor_tier(created_by_tier) where created_by_tier in ('code', 'ai', 'human');
update content_ir.kind_instance    set updated_by_tier = platform.canonical_actor_tier(updated_by_tier) where updated_by_tier in ('code', 'ai', 'human');
update content_ir.kind_instance    set created_by_tier = platform.canonical_actor_tier(created_by_tier) where created_by_tier in ('code', 'ai', 'human');
update platform.org_change_policy  set updated_by_tier = platform.canonical_actor_tier(updated_by_tier) where updated_by_tier in ('code', 'ai', 'human');
update platform.org_change_policy  set created_by_tier = platform.canonical_actor_tier(created_by_tier) where created_by_tier in ('code', 'ai', 'human');
update content.document_version    set actor_tier      = platform.canonical_actor_tier(actor_tier)      where actor_tier      in ('code', 'ai', 'human');
update platform.associations       set updated_by_tier = platform.canonical_actor_tier(updated_by_tier) where updated_by_tier in ('code', 'ai', 'human');
set local session_replication_role = origin;

do $$
declare v_left bigint;
begin
  select (select count(*) from agent.definition where updated_by_tier in ('code','ai','human'))
       + (select count(*) from agent.definition_version where created_by_tier in ('code','ai','human'))
       + (select count(*) from tool.definition where updated_by_tier in ('code','ai','human'))
       + (select count(*) from tool.definition_version where created_by_tier in ('code','ai','human'))
       + (select count(*) from workflow.definition where updated_by_tier in ('code','ai','human'))
       + (select count(*) from workflow.definition_version where created_by_tier in ('code','ai','human'))
       + (select count(*) from crm.party where updated_by_tier in ('code','ai','human') or created_by_tier in ('code','ai','human'))
       + (select count(*) from content_ir.kind_instance where updated_by_tier in ('code','ai','human') or created_by_tier in ('code','ai','human'))
       + (select count(*) from content.document_version where actor_tier in ('code','ai','human'))
       + (select count(*) from platform.associations where updated_by_tier in ('code','ai','human'))
    into v_left;
  if v_left > 0 then raise exception 'DD-064: % small-table rows still hold an old word', v_left; end if;
  raise notice 'DD-064: small tables speak system|agent|user; history.row_versions is the batched backfill';
end $$;
