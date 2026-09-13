-- public_list_scoped_my_orgs_dd137c7 — "MY ORGS" MEANS MY ORGANIZATIONS AGAIN, THROUGH ONE
-- EXPRESSION (DD-137c, step 7; VISIBILITY-BY-CLASS §3.3).
--
-- 🚨 FOUND IN A BROWSER, WHICH IS THE ONLY PLACE IT COULD HAVE BEEN FOUND.
-- DD-137c2 deleted the `orgs` arm's bespoke predicate outright, so the arm became "everything RLS
-- allows". At the SQL level that is exactly right and the proof passed. Then the screen was opened
-- as `test@test.com`, a plain member of two organizations holding 8 shapes between them, and the
-- tab said:
--
--     Mine 0   |   My Orgs 1139   |   Shared 0   |   Public 1059
--
-- 1,139 is not that person's organizations. `content_ir.kind_definition` is classed `public`, so RLS
-- hands over the platform's whole shape library — and a tab labelled **My Orgs** was showing it.
-- Law 4: a screen is absent or honest, never lying. It was lying, and no SQL assertion could have
-- noticed, because "everything RLS allows" was precisely what the assertion asked for.
--
-- WHAT CHANGES, AND WHY IT IS NOT THE PREDICATE THAT WAS DELETED
-- --------------------------------------------------------------
-- The `orgs` arm regains ONE clause: `organization_id IN (SELECT iam.my_orgs())`. That is not a
-- walk-back of §3.3, and the difference is the whole point of §3.3:
--
--   DELETED, and staying deleted — the ACCESS decisions:
--     * `visibility IN ('internal','public')` (five of them), `visibility = 'internal'`
--       (wfx_list_scoped), and no visibility test at all (seo, mnd) — eleven functions disagreeing
--       about who may see what. RLS owns visibility.
--     * `created_by IS DISTINCT FROM v_uid` — which excluded the viewer's OWN rows from the
--       organization's list. That is Arman's complaint in one clause and it is gone for good.
--     * eleven hand-written membership CTEs that disagreed with each other: nine resolved membership
--       from `iam.organization_member`, `crm_inbox_list_scoped` from `iam.memberships`, and every one
--       of them silently dropped the person's PERSONAL organization, so rows in it appeared under no
--       tab at all.
--
--   RESTORED, as ONE expression shared by all eleven — a SCOPE narrowing:
--     * `iam.my_orgs()`, the canonical "every organization I belong to", personal included.
--
-- §3.3's own sentence allows exactly this: *"a 'mine / everyone' toggle may only ever NARROW what
-- RLS already allows."* Narrowing is what a tab IS. What it may not do is decide who may read —
-- and it no longer does anywhere.
--
-- The `public` and `shared` tabs are untouched and still answer "everything public" and "granted to
-- me", which is where the wider view belongs and where it is honestly labelled.

do $$
declare
  r record;
  v_def text; v_new text; v_patched int := 0;
begin
  -- Each function's `orgs` arm carries exactly one `(p_org_id IS NULL OR <col> = p_org_id)` clause,
  -- written by DD-137c2. The organization column is READ OUT OF THAT CLAUSE rather than guessed,
  -- so a function whose column is named differently cannot be patched with the wrong one.
  for r in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('agx_list_scoped','crm_inbox_list_scoped','cvx_list_scoped',
                         'ivw_list_scoped','mkt_initiative_list_scoped','seo_rank_target_list_scoped',
                         'shx_list_scoped','trx_list_scoped','wfx_list_scoped')
     order by p.proname
  loop
    v_def := r.def;
    if position('iam.my_orgs' in v_def) > 0 then
      raise notice 'dd137c7: % already narrows to my_orgs', r.proname;
      continue;
    end if;

    -- upper-case form (eight of the nine)
    v_new := regexp_replace(
      v_def,
      '\(p_org_id IS NULL OR ([A-Za-z_][A-Za-z0-9_.]*) = p_org_id\)',
      '(p_org_id IS NULL OR \1 = p_org_id) AND \1 IN (SELECT iam.my_orgs())',
      'g');
    -- lower-case form (mkt_initiative_list_scoped is written in lower case throughout)
    if v_new = v_def then
      v_new := regexp_replace(
        v_def,
        '\(p_org_id is null or ([A-Za-z_][A-Za-z0-9_.]*) = p_org_id\)',
        '(p_org_id is null or \1 = p_org_id) and \1 in (select iam.my_orgs())',
        'g');
    end if;

    if v_new = v_def then
      raise exception 'dd137c7: % has no `(p_org_id IS NULL OR <col> = p_org_id)` clause — it is not '
                      'the function DD-137c2 wrote and must be re-read, never patched blind.', r.proname;
    end if;
    execute v_new;
    v_patched := v_patched + 1;
  end loop;

  if v_patched <> 9 then
    raise exception 'dd137c7: patched % of the 9 list RPCs. All nine share this arm; a miss is a '
                    'function that kept showing the whole platform under a "My Orgs" tab.', v_patched;
  end if;
end $$;

-- ── the two that are shaped differently ───────────────────────────────────────────────────────
-- `edu_library_scope_rows` gained its `orgs` arm in DD-137c3 with no organization clause at all
-- (it takes no `p_org_id`), and `mnd_list_scoped`'s corpus arm was reduced to `true` in DD-137c4.
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'edu_library_scope_rows';
  if position('iam.my_orgs' in v_def) = 0 then
    v_new := replace(v_def,
      E'    FROM unified u\n    WHERE v_scope = ''orgs''',
      E'    FROM unified u\n    WHERE v_scope = ''orgs''\n'
      '      -- DD-137c7: the organization tab shows the organizations this person belongs to,\n'
      '      -- personal included. No visibility test, no owner test — RLS decided both already.\n'
      '      AND u.u_organization_id IN (SELECT iam.my_orgs())');
    if v_new = v_def then
      raise exception 'dd137c7: edu_library_scope_rows has no `orgs` arm to narrow';
    end if;
    execute v_new;
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'mnd_list_scoped';
  if position('iam.my_orgs' in v_def) = 0 then
    v_new := replace(v_def,
      E'          ELSE true',
      E'          -- DD-137c7: `all` is the system organization plus every organization this person\n'
      '          -- belongs to — which is what p_home ''all'' has always meant and what the screen\n'
      '          -- says. RLS is still the ceiling; this only chooses which of the readable rows the\n'
      '          -- tab shows.\n'
      '          ELSE m.organization_id = v_sys\n'
      '               OR m.organization_id IN (SELECT iam.my_orgs())');
    if v_new = v_def then
      raise exception 'dd137c7: mnd_list_scoped has no `ELSE true` corpus arm to narrow';
    end if;
    execute v_new;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════ PROOF — live, real identities
-- The promise has two halves and BOTH are asserted, because either one alone is satisfiable by a
-- function that returns nothing:
--   (a) the organization tab no longer reaches outside the caller's organizations, and
--   (b) it still shows more than `mine` did — the complaint was an EMPTY organization tab, and a
--       narrowing that empties it again has fixed nothing.
do $$
declare
  v_p uuid; v_email text; r record;
  v_ids uuid[]; v_leak uuid[]; v_n_orgs bigint; v_n_mine bigint;
  v_measured int := 0; v_notes text := ''; v_err text;
  v_principals uuid[] := array[
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid,  -- test@test.com (the browser account)
    'c5e92166-e148-4e73-926e-83af0c453665'::uuid,  -- seo@titaniumsuccess.com
    '392afd39-d59c-4418-866b-451e9d93fead'::uuid   -- projectmanager@titaniumsuccess.com
  ];
begin
  for r in
    select * from (values
      ('agx_list_scoped',             'id',        'agent.definition',            'organization_id'),
      ('cvx_list_scoped',             'id',        'chat.conversation',           'organization_id'),
      ('mkt_initiative_list_scoped',  'id',        'marketing.initiative',        'organization_id'),
      ('seo_rank_target_list_scoped', 'target_id', 'seo.rank_target',             'organization_id'),
      ('shx_list_scoped',             'id',        'content_ir.kind_definition',  'organization_id'),
      ('wfx_list_scoped',             'id',        'workflow.definition',         'organization_id')
    ) as t(rpc, id_col, rel, org_col)
  loop
    foreach v_p in array v_principals loop
      select u.email into v_email from auth.users u where u.id = v_p;
      v_err := null; v_ids := null; v_n_orgs := 0; v_n_mine := 0;
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_p::text, 'role', 'authenticated')::text, true);
        execute 'set local role authenticated';
        execute format('select coalesce(array_agg(x.%I), ''{}''), coalesce(max(x.total_count), 0) '
                       'from public.%I(p_scope => ''orgs'', p_limit => 200) x', r.id_col, r.rpc)
          into v_ids, v_n_orgs;
        execute format('select coalesce(max(x.total_count), 0) '
                       'from public.%I(p_scope => ''mine'', p_limit => 200) x', r.rpc)
          into v_n_mine;
        -- (a) every id it returned belongs to an organization this person is a member of
        execute format('select coalesce(array_agg(t.id), ''{}'') from %s t '
                       'where t.id = any($1) '
                       '  and (t.%I is null or t.%I not in (select iam.my_orgs()))',
                       r.rel, r.org_col, r.org_col)
          into v_leak using v_ids;
        execute 'reset role';
      exception when others then
        begin execute 'reset role'; exception when others then null; end;
        v_err := format('%s: %s', sqlstate, sqlerrm);
      end;

      if v_err is not null then
        raise exception 'dd137c7 UNMEASURED — % as % (%)', r.rpc, v_email, v_err;
      end if;
      if cardinality(v_leak) > 0 then
        raise exception 'dd137c7: %(orgs) returned % row(s) outside %''s organizations, e.g. %. '
                        'The tab still does not mean what it says.',
                        r.rpc, cardinality(v_leak), v_email, v_leak[1];
      end if;
      if v_n_orgs > 0 then
        v_measured := v_measured + 1;
        v_notes := v_notes || format('  %s / %s: orgs=%s mine=%s%s',
                                     r.rpc, split_part(v_email, '@', 1), v_n_orgs, v_n_mine, chr(10));
      end if;
    end loop;
  end loop;

  if v_measured = 0 then
    raise exception 'dd137c7: every organization tab came back EMPTY for every principal. That is '
                    'the complaint this campaign exists to fix, not a pass.';
  end if;
  raise notice E'dd137c7 PROVEN on % (rpc, principal) pair(s) with rows:\n%', v_measured, v_notes;
exception when others then
  begin execute 'reset role'; exception when others then null; end;
  raise;
end $$;
