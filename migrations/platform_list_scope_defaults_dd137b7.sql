-- platform_list_scope_defaults_dd137b7 — THE LIST RPCs READ THE REGISTRY (DD-137b, step 4, part one).
--
-- Design: VISIBILITY-BY-CLASS §3.3 ("the second axis — where a list lands", chair R2), item 3:
--   "p_scope text DEFAULT NULL, and line one becomes
--    v_scope := lower(coalesce(p_scope, platform.entity_default_list_scope('<token>'))).
--    A SQL parameter default cannot be dynamic; a coalesce can."
-- and item 4: the RPCs' live word is `orgs`, the registry value is `organization`, and
-- `platform.entity_default_list_scope` maps one to the other. We do not rename a live parameter
-- vocabulary to make a new column prettier.
--
-- 🚨 WHAT THIS IS AND IS NOT. This is the DEFAULT, not the conversion. §3.3's full repair also turns
-- the eleven `SECURITY DEFINER` functions into `SECURITY INVOKER` and DELETES their bespoke org
-- predicates, because eleven hand-written predicates cannot all be one registry word (five require
-- `visibility in ('internal','public')`, wfx_list_scoped requires `internal` only, mnd_list_scoped
-- has no visibility test and no role test, crm_inbox_list_scoped resolves membership from a
-- different table). That conversion is per-RPC surgery on functions of several hundred lines each,
-- and each one needs its own access delta — the harness now exists for exactly that. It is NOT done
-- here, it is not pretended to be done, and `pnpm check:list-scope` is RED at 11 of 11 until it is.
--
-- Two of the eleven are deliberately left alone and the reason is recorded rather than the file
-- quietly skipping them:
--   * `mnd_list_scoped` — its `p_scope` is not a list scope at all. It feeds `p_resolution_for`,
--     which answers "whose mandate ladder am I being shown", and ownership is a separate parameter
--     (`p_home`). Defaulting it from a list-scope column would change what the screen MEANS.
--   * `edu_library_list_scoped` — it passes `p_scope` straight into
--     `public.edu_library_scope_rows(p_scope)`, so the default belongs in that function, on its own
--     token, with its own proof.
do $$
declare
  r record;
  v_src text; v_new text; v_done int := 0;
  -- RPC -> the registry token whose list scope it answers, each one read off the function's own
  -- primary FROM clause rather than guessed from the prefix.
  v_map jsonb := jsonb_build_object(
    'agx_list_scoped',            'agent',                 -- agent.definition
    'crm_inbox_list_scoped',      'crm_interaction',       -- crm.interaction
    'cvx_list_scoped',            'conversation',          -- chat.conversation
    'ivw_list_scoped',            'interview_session',     -- interview.session
    'mkt_initiative_list_scoped', 'marketing_initiative',  -- marketing.initiative
    'seo_rank_target_list_scoped','seo_rank_target',       -- seo.rank_target
    'shx_list_scoped',            'content_ir_kind',       -- content_ir.kind_definition
    'trx_list_scoped',            'studio_session',        -- transcripts.studio_sessions
    'wfx_list_scoped',            'workflow'               -- workflow.definition
  );
  v_token text;
begin
  -- 🚨 THE WHOLE DEFINITION IS REWRITTEN, NOT REASSEMBLED. An earlier version of this file rebuilt
  -- the CREATE statement from pg_get_function_identity_arguments + pg_get_function_result and was
  -- refused by Postgres with `cannot remove parameter defaults from existing function` — identity
  -- arguments deliberately omit DEFAULTs, and every one of these RPCs is called with most of its
  -- eleven parameters left out. `pg_get_functiondef` is the definition Postgres itself would print,
  -- so patching THAT text changes exactly one line and nothing else: no signature, no volatility,
  -- no search_path, no defaults, no grants.
  for r in select p.oid, p.proname, p.prosrc, pg_get_functiondef(p.oid) def
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and v_map ? p.proname
            order by p.proname
  loop
    v_token := v_map ->> r.proname;
    if not exists (select 1 from platform.entity_types et
                    where et.token = v_token and et.is_active) then
      raise exception 'dd137b7: % maps to token %, which is not an active registered entity',
        r.proname, v_token;
    end if;

    if position('entity_default_list_scope' in r.prosrc) > 0 then
      raise notice 'dd137b7: % already reads the registry', r.proname;
      v_done := v_done + 1;
      continue;
    end if;

    v_new := replace(r.def,
      'lower(coalesce(p_scope, ''mine''))',
      format('lower(coalesce(p_scope, platform.entity_default_list_scope(%L)))', v_token));
    if v_new = r.def then
      v_new := replace(r.def,
        'lower(coalesce(p_scope,''mine''))',
        format('lower(coalesce(p_scope, platform.entity_default_list_scope(%L)))', v_token));
    end if;
    if v_new = r.def then
      raise exception 'dd137b7: could not find the hard-coded ''mine'' default in % — it must be '
        'read by hand rather than patched blind', r.proname;
    end if;

    execute v_new;
    v_done := v_done + 1;
  end loop;

  if v_done <> 9 then
    raise exception 'dd137b7: patched % of the nine list RPCs — a silent miss is exactly the shape '
      'of the omission this file exists to prevent', v_done;
  end if;
end $$;

-- ═══ proven, not asserted ═══
do $$
declare v_n integer; v_scope text;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like '%\_list\_scoped'
     and p.prosrc like '%entity_default_list_scope%';
  if v_n <> 9 then raise exception 'dd137b7: only % list RPCs read the registry', v_n; end if;

  -- the registry answers in the RPCs' own vocabulary, and the two axes really are separate:
  -- `conversation` is the strictest CLASS on the platform and still lands on `mine` because that is
  -- where a list of my own chats belongs — not because anything is hidden.
  if platform.entity_default_list_scope('conversation') <> 'mine' then
    raise exception 'dd137b7: conversation should land on mine';
  end if;
  -- and `content_ir_kind_instance` — the SEO keyword case that started this whole design, where
  -- four people in one organization each saw only their own keywords — lands on the organization.
  if platform.entity_default_list_scope('content_ir_kind_instance') <> 'orgs' then
    raise exception 'dd137b7: the kind-instance list must land on the organization (FT-3)';
  end if;
  if platform.entity_default_list_scope('seo_rank_target') <> 'orgs' then
    raise exception 'dd137b7: the SEO rank-target screen must land on the organization';
  end if;

  -- a caller that passes a scope still gets exactly that scope: the default is a default.
  select lower(coalesce(null, platform.entity_default_list_scope('workflow'))) into v_scope;
  if v_scope <> 'orgs' then raise exception 'dd137b7: workflow should land on orgs'; end if;

  raise notice 'dd137b7: nine list RPCs read the registry; the conversion to SECURITY INVOKER is '
    'NOT done and pnpm check:list-scope is RED at 11 of 11 until it is';
end $$;
