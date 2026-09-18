-- dd222b_the_agent_schema_publishes_only_what_a_reader_renders — THE SIBLING SWEEP
-- (DD-222, step 4. db-rules §0/§6d/§9. GRANTS ONLY — no DDL, no policy, no row touched.)
--
-- `dd222_exemplar_is_closed_to_the_signed_out_reader.sql` closed ONE relation with the reasoning
-- that the bound of a signed-out surface is the columns that surface renders. Schema `agent` holds
-- SEVEN declared anon bounds (`ANON_COLUMN_SURFACE` in `lib/security/public-exposure.ts`). Two
-- independent four-repository censuses — this lane's and a second one run without sight of it —
-- agree on the answer for all seven, and they agree with the register's own per-relation reasons:
--
--   agent.message_template   REAL signed-out reader. `app/(public)/p/e/loadPublicResource.ts`
--                            renders /p/e/message_template/<id> with the SSR client (anon for a
--                            signed-out visitor) and asks for exactly the 8 columns
--                            `PUBLIC_LANE_COLUMNS.message_template` declares. Its bound already
--                            equals what it renders — UNTOUCHED by this file, and proven still 200.
--
--   agent.cmp_comparison_sets   no signed-out reader (resourceType `comparison_set` is registered
--   agent.cmp_response_feedback  but absent from `PUBLIC_LANE_TYPES`, so the public loader returns
--   agent.definition             null before issuing a query; every other call site is a (core)/
--   agent.shortcut               (admin) route, an auth-checked API route, or the service role).
--   agent.template               matrx-extend and matrx-local have no reader of any of the five;
--                                aidream reads them as the service role.
--
-- ═══ WHAT THE FIVE ARE PUBLISHING, MEASURED OVER HTTPS WITH NO JWT, 2026-09-14 ═════════════════
-- Two of them are not latent. They are serving the internet right now:
--
--   GET /rest/v1/template?select=id  (Accept-Profile: agent, Prefer: count=exact)
--     -> 200  content-range: 0-8/9    — NINE public agent templates
--   GET /rest/v1/template?select=id,name,messages&limit=1
--     -> 200  [{"name":"AP World Course Outline (Template 2025-11-11)","messages":[{"role":"system",
--              "content":[{"text":"You are a high school AP World History Expert. ..."}]}]}]
--     — the whole system prompt, to anyone on the internet, with no account.
--
--   GET /rest/v1/shortcut?select=id  -> 200  content-range: 0-29/30   — THIRTY public shortcuts
--   GET /rest/v1/shortcut?select=label,pre_execution_message,default_variables,...
--     -> 200  [{"label":"Extract Key Points","pre_execution_message":"Does this work?"}]
--     — `default_user_input`, `default_variables` and `pre_execution_message` are the columns
--       THE USER-INPUT LAW reserves for what a human typed.
--
-- The other three are latent exactly as `agent.exemplar` was — the grant is open, the row gate
-- currently yields nothing: `definition` 0 public of 1152 (`messages` is the agent's system
-- prompt), `cmp_response_feedback` 0 of 11 (`comment` is a human's typed verdict),
-- `cmp_comparison_sets` 0 of 18. Latency is an accident of data, never a decision.
--
-- ═══ THE BOUND, AND WHY IT IS ZERO FOR ALL FIVE ════════════════════════════════════════════════
-- No signed-out surface renders any column of any of the five, so every granted column exceeds
-- what a signed-out reader renders. The public lane register (`utils/permissions/publicLane.ts`)
-- is the one place a type earns an indexable anonymous page, and it names `note`,
-- `message_template` and `fc_set` — no agent, template, shortcut, comparison set or feedback row.
--
-- THE ANONYMOUS SHARE LINK DOES NOT GO THROUGH THESE GRANTS, and that is what makes this safe:
-- `/s/<token>` resolves through `public.resolve_share_token`, which is SECURITY DEFINER (verified
-- live: `pg_proc.prosecdef = true`) and RETURNS THE CONTENT itself — the token is the
-- authorization, the column privilege of `anon` is irrelevant to it. Nothing this file revokes can
-- reach that path.
--
-- Signed-in readers are untouched: `authenticated` keeps every column of all five, asserted below.
--
-- Columns are revoked BY NAME (a table-level REVOKE does not remove column grants — B-78 measured
-- that on `docproc.processed_documents`). The loop takes the names from the catalog, so it cannot
-- miss one the way a hand-typed list can, and it RAISES if a single column survives.
--
-- ═══ WHAT THIS FILE DOES NOT DO ════════════════════════════════════════════════════════════════
-- It changes no row and no policy: `pub_read` is the generated DD-173 base contract and only
-- `iam.apply_rls` may write a policy (§6d). It does not touch `agent.message_template`, the one
-- relation here with a real signed-out reader. And it does not reach outside schema `agent`:
-- roughly 145 relations in OTHER schemas carry the same "no signed-out reader was found" reason in
-- the same register, and sweeping them is its own campaign with its own register row, not a step
-- this file may take on the way past. Named for the chair, not silently left.

do $$
declare
  r         record;
  v_col     record;
  v_before  int;
  v_after   int;
  v_auth    int;
  v_total   int;
  v_names   text;
begin
  for r in
    select unnest(array[
      'agent.cmp_comparison_sets', 'agent.cmp_response_feedback', 'agent.definition',
      'agent.shortcut', 'agent.template'
    ]) as rel
  loop
    select count(*) filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')),
           count(*),
           string_agg(a.attname, ', ' order by a.attnum)
             filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT'))
      into v_before, v_total, v_names
      from pg_attribute a
     where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped;

    for v_col in
      select a.attname
        from pg_attribute a
       where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped
         and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
       order by a.attnum
    loop
      execute format('revoke select (%I) on %s from anon', v_col.attname, r.rel);
    end loop;
    execute format('revoke select on %s from anon', r.rel);

    select count(*) filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')),
           count(*) filter (where has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT'))
      into v_after, v_auth
      from pg_attribute a
     where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped;

    if v_after <> 0 then
      raise exception 'dd222b: anon still holds SELECT on % column(s) of %. The point of this file '
                      'is that the number is zero.', v_after, r.rel;
    end if;
    if has_table_privilege('anon', r.rel::regclass, 'SELECT') then
      raise exception 'dd222b: anon still holds a table-level SELECT on %.', r.rel;
    end if;
    if v_auth <> v_total then
      raise exception 'dd222b: authenticated holds SELECT on only % of % column(s) of %. This file '
                      'may only close the signed-out door.', v_auth, v_total, r.rel;
    end if;

    raise notice 'dd222b: % closed to anon — % of % columns revoked (%), authenticated keeps % of %.',
                 r.rel, v_before, v_total, coalesce(v_names, '(none)'), v_auth, v_total;
  end loop;

  -- The one relation in this schema with a real signed-out reader keeps its bound exactly.
  select count(*) filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT'))
    into v_after
    from pg_attribute a
   where a.attrelid = 'agent.message_template'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_after <> 9 then
    raise exception 'dd222b: agent.message_template anon bound moved from 9 to % columns. The '
                    'public /p/e/message_template page is a REAL signed-out reader and this file '
                    'must not touch it.', v_after;
  end if;
  raise notice 'dd222b: agent.message_template untouched — 9 columns, the exact PUBLIC_LANE_COLUMNS list.';
end $$;
