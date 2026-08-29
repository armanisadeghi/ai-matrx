-- HR domain L3 — migration 111. THE SQL HALF OF "NOBODY HAND-ASSEMBLES AN HR URL".
--
-- 🚨 THE NOTIFICATION AND WORKFLOW SPINE HAND-BUILT `/hr...` LINKS WITH NO EMPLOYER IN THEM.
--
-- `features/hr/routes.ts` opens with the law and gives the reason: HR is strictly single-employer,
-- SPEC-UI-IA §1 resolves the active employer from `?org=` FIRST, and a link that drops the param
-- silently lands the reader in a DIFFERENT employer. On 2026-08-28 the frontend made `org` a
-- REQUIRED argument on all 49 builders and added a TEXTUAL guard
-- (`features/hr/__tests__/no-hand-built-hr-urls.test.ts`) for the string literals the compiler
-- cannot see. That guard reads `.ts`/`.tsx` only. It structurally CANNOT see a `||` concatenation
-- inside a `CREATE FUNCTION` body — and that is where the worst instances were living.
--
-- Worst, because a notice's deep link is the ONE link a person is most likely to follow from
-- OUTSIDE the app — out of an email, an SMS, an in-app notification — with no HR page already
-- open to inherit an employer from. It is the last place that may drop the param, and it was the
-- place that dropped it 26 times.
--
-- MEASURED PRE-FIX ON THE LIVE BODIES (2026-08-28): 26 composition sites across 16 functions in
-- `hr.*` and `public.hr_*` built an `/hr…` link carrying no employer. Two of them —
-- `hr._wf_notify` and `hr._wf_project_step` — are the notification spine, and they had already
-- written 535 live `communication.notification` rows across 2 organizations whose stored
-- `deep_link` carries no employer at all.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE EMPLOYER WAS ALWAYS IN SCOPE. Not one of the 16 functions had to go and find it:
--    `inst.organization_id` / `i.organization_id` on the workflow rowtype, `p_organization_id` on
--    the leave doors, `v_org` on every `public.hr_*` writer (they already gate on it). So none of
--    these links "could not know" the employer — they simply were not asked to carry it, and no
--    mechanism ever asked. There is therefore NO honest-landing case in this batch; every site is
--    fixed to carry the employer rather than to explain its absence. `hr.my_time_off` is the one
--    function with no org variable, and it resolves one from the employment it is already scoped
--    to — a scalar subquery, not a new parameter, because the signature is a client door.
--
-- 2. THE PARAM IS `?org=<uuid>`, matching `HR_ORG_PARAM` in `features/hr/constants.ts`.
--    `hrUrl()` accepts a slug OR a uuid (`HrOrgRef`); SQL holds the uuid, so it writes the uuid.
--
-- 3. THE EMPLOYER GOES FIRST IN THE QUERY STRING, and everything that used to be `?x=` becomes
--    `&x=`. Query-param order does not matter to the reader, but writing the employer first makes
--    every one of these links start `…?org=` — which is what makes the guard in decision 5 a
--    same-line check instead of an expression parser.
--
-- 4. `hr.clock_state` (4 sites) and `public.hr_invite_accept` (1 site) ALREADY carried
--    `&org=`/`?org=` and are untouched. They are the proof that the pattern was known and simply
--    not enforced — which is the entire argument for a mechanism over a review note.
--
-- 5. THE GUARD IS CHECK 37, AND IT IS NARROWED THE WAY THE TYPESCRIPT ONE IS. `/hr` is also the
--    prefix of aidream's own HTTP routes, and those appear in these same bodies as
--    `'E-11 POST /hr/time/recompute'`, `'aidream POST /hr/identity/{id}/ssn/reveal'` and in prose
--    comments. A guard that shouted about those would be switched off inside a week — the exact
--    reasoning `no-hand-built-hr-urls.test.ts` gives for its own navigation-position narrowing.
--    The SQL analogue of "navigation position" is: THE LITERAL STARTS AT THE PATH. A link literal
--    is written `'/hr/...'`; an API-route mention names the verb first (`'POST /hr/...'`) and a
--    comment does not open a quote at all. So the detector matches `'/hr` — quote immediately
--    followed by the path — and nothing else. Measured against the live corpus that is exact: it
--    flagged all 26 real sites, all 6 API-route/prose mentions were correctly ignored, and both
--    already-correct functions were correctly green.
--
-- 6. THE CHECK IS PER LINE, ON PURPOSE, AND THAT IS A RULE ABOUT HOW TO WRITE THE LINK. The
--    employer must appear on the SAME source line as the path literal. A window over several
--    lines would be the beginning of an expression parser, and an expression parser is the thing
--    that eventually gets a case wrong and goes quietly blind. `public.hr_transfer` was the only
--    site whose composition genuinely spanned two lines; it becomes a `format()` with the whole
--    template on one line, which is more readable than the concatenation it replaces. The escape
--    hatch is a comment marker, `hr-url-exempt:`, exactly as in the TypeScript guard — visible in
--    the diff, with an author.
--
-- 6b. THE GUARD MATCHED ITSELF ON THE FIRST RUN, and that is recorded rather than quietly patched:
--    a detector for a shape necessarily CONTAINS that shape — in its match pattern and in the
--    sentence it prints to explain the finding. Four such self-matches came back red. The fix is
--    the same one `no-hand-built-hr-urls.test.ts` applies to `features/hr/routes.ts`: the two
--    functions that exist to TALK ABOUT the shape are out of scope, because a match pattern and a
--    diagnostic row are not navigation and can never send anybody anywhere. That is the entire
--    exemption — no per-site allowlist, and every other function in `hr` / `public.hr_*` /
--    `communication` is checked. The pattern also spells its quote as `chr(39)` so it does not
--    contain the shape at all.
--
-- 7. THE 535 EXISTING NOTIFICATION ROWS ARE BACKFILLED, NOT PRESERVED. A `deep_link` is a
--    POINTER, not evidence: the evidential fields of a notice are its event_key, payload, target,
--    channel, address, status and timestamps, and none of those move here. The employer written
--    in is not invented — it is read off `communication.notification.organization_id` on the very
--    same row, which has always been correct. Leaving them would not preserve a record, it would
--    leave 535 live landmines: an unread in-app notice followed tomorrow lands its reader in
--    whichever employer the picker happens to choose. The harm is prospective, so the repair is
--    too. `payload -> 'deep_link'` moves in lockstep with the column or the two disagree, and a
--    checksum over every OTHER column (and over `payload - 'deep_link'`) is asserted identical
--    before and after, so "nothing else moved" is proven, not claimed. The two columns that DO
--    move are `updated_at` / `updated_by`, written by the table's own `_touch_row` / `_stamp_actor`
--    triggers — which is the correct outcome and the opposite of hiding the edit: the rows say
--    they were repaired, and by whom. They are excluded from the witness for exactly that reason.
--
-- 8. WHERE THE GUARD ACTUALLY BLOCKS. Check 37 rides `hr.punch_write_path_conformance()`, whose
--    strict lane runs in `.github/workflows/ci.yml` job `hr-punch` on every PR/push — the only
--    invocation in this repo that can genuinely fail a build (`run-release-gates.sh` is advisory
--    by contract and `release.sh` runs it `|| true`). The key must ALSO be added to
--    `EXPECTED_CHECKS` in `scripts/check-hr-punch-write-path.ts`, or a check that stops being
--    returned would vanish silently — the anti-decay mechanism that file exists for.
--
-- 9. WHAT CHECK 37 DOES NOT BLOCK ON, AND SAYS SO EVERY RUN. 150 rows of
--    `communication.notification_event_type` declare a `config -> 'deep_link_template'` starting
--    `/hr` with no employer in it (mirrored in `aidream/services/notifications/hr_catalog/*.py`).
--    Nothing renders them today — no function in the database reads `deep_link_template` — so
--    they are a DORMANT instance of this class, and adding `?org={{organization.id}}` to a
--    template with no renderer would ship a link that resolves to a literal. They are therefore
--    COUNTED AND PRINTED in check 37's detail on every run rather than fixed here or hidden.
--
-- Authority: features/hr/routes.ts header law; SPEC-UI-IA §1; SPEC-NOTIFICATIONS §2.1 (the object
-- route). Continues hr_c4_47 / hr_c4_48, which threaded the READ reference into these same links
-- and did not notice the employer was missing from them.
-- Applied live as `hr_l3_111_an_hr_deep_link_carries_the_employer`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

-- ============================================================ 0. pre-conditions snapshot
do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_l3_111_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the detector (RD 5/6)
create or replace function hr.hr_links_without_employer()
returns table(schema_name text, function_name text, line_no integer, line text)
language sql
stable
set search_path = hr, public
as $fn$
  with scoped as (
    select n.nspname::text as schema_name, p.proname::text as function_name, p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.prokind = 'f'
       and ( n.nspname in ('hr', 'communication')
          or (n.nspname = 'public' and p.proname like 'hr\_%') )
       -- 🚨 THE GUARD MACHINERY ITSELF, and nothing else. These two functions DESCRIBE the banned
       -- shape (a match pattern, a diagnostic sentence) rather than navigate to it, so they carry
       -- it by construction and can never carry a real link — a diagnostic row is not an href.
       -- Exactly the exemption `no-hand-built-hr-urls.test.ts` grants `features/hr/routes.ts`:
       -- banning the literal in the one place that exists to talk about it bans the guard, and a
       -- guard that goes red on its own prose gets switched off the first time somebody reworders
       -- a sentence. Every other function in these schemas is in scope, with no allowlist.
       and not (n.nspname = 'hr'
                and p.proname in ('hr_links_without_employer', 'punch_write_path_conformance'))
  ), src as (
    -- RD 5: NAVIGATION POSITION IN SQL IS "the literal starts at the path". A link literal opens
    -- at the path; an HTTP-route mention names the verb first (POST /hr/...) and a prose comment
    -- opens no quote at all. Matching quote-then-path is what keeps this guard narrow enough to
    -- survive. The quote is chr(39) rather than an escaped literal so this pattern does not
    -- itself contain the shape it is looking for.
    select s.schema_name, s.function_name, u.ord::integer as line_no, u.t as line
      from scoped s, unnest(string_to_array(s.prosrc, E'\n')) with ordinality as u(t, ord)
     where u.t like '%' || chr(39) || '/hr%'
  )
  select schema_name, function_name, line_no, btrim(line)
    from src
   -- RD 6: same line, deliberately. And the escape hatch is a marker with an author, never a
   -- heuristic — the standard `no-hand-built-hr-urls.test.ts` set for the TypeScript half.
   where line !~ 'org=' and line !~ 'hr-url-exempt:'
   order by schema_name, function_name, line_no;
$fn$;

comment on function hr.hr_links_without_employer() is
  'Every line in an hr.* / public.hr_* / communication.* function body that opens an /hr link '
  'literal without the employer on the same line. HR is single-employer; a link with no ?org= '
  'lands its reader in whichever employer the picker chooses. Backs conformance check 37.';

-- ============================================================ 2. THE GUARD IS RED (falsification)
-- 🚨 A guard that cannot fail proves nothing. This records, permanently and in the migration that
-- fixes them, how many sites the detector found in the UNFIXED bodies. Section 6 asserts zero.
do $$
declare v_pre integer;
begin
  select count(*) into v_pre from hr.hr_links_without_employer();
  perform set_config('matrx.hr_l3_111_sites_before', v_pre::text, true);
  if v_pre = 0 then
    raise notice 'hr_l3_111: detector already green (% sites) — re-run over fixed bodies', v_pre;
  else
    raise notice 'hr_l3_111: DETECTOR IS RED — % hand-built /hr link site(s) carry no employer', v_pre;
  end if;
end $$;

-- ============================================================ 3. the 26 sites (RD 1/2/3)
do $mig$
declare
  v_i integer; v_oid oid; v_def text; v_new text; v_fixed integer := 0;
  v_sch text; v_fn text; v_old text; v_rep text;
  -- schema, function, old, new — one row per composition shape. `replace` is all-occurrences, so
  -- a shape that appears twice in one body (hr.wf_inbox, public.hr_employee_invite) is fixed at
  -- both sites by one row and can never be half-applied.
  v_sites constant text[][] := array[
    -- ── the notification spine ────────────────────────────────────────────────────────────────
    ['hr', '_wf_notify',
     $o$v_link := '/hr/tasks/' || p_instance::text || coalesce('?step=' || p_step::text, '');$o$,
     $o$v_link := '/hr/tasks/' || p_instance::text || '?org=' || inst.organization_id::text || coalesce('&step=' || p_step::text, '');$o$],
    ['hr', '_wf_project_step',
     $o$'/hr/tasks/' || inst.id::text || '?step=' || p_step::text,$o$,
     $o$'/hr/tasks/' || inst.id::text || '?org=' || inst.organization_id::text || '&step=' || p_step::text,$o$],
    ['hr', '_l1_notify_consent_requested',
     $o$p_request_id, '/hr/me',$o$,
     $o$p_request_id, '/hr/me?org=' || v_org::text,$o$],
    ['hr', '_punch_notify_edited',
     $o$v_link := '/hr/me/timesheet?punch=' || coalesce($o$,
     $o$v_link := '/hr/me/timesheet?org=' || p_organization_id::text || '&punch=' || coalesce($o$],
    -- ── the workflow queue / inbox doors ──────────────────────────────────────────────────────
    ['hr', 'wf_inbox',
     $o$'/hr/tasks/' || i.id::text || '?step=' || s.id::text$o$,
     $o$'/hr/tasks/' || i.id::text || '?org=' || i.organization_id::text || '&step=' || s.id::text$o$],
    ['hr', 'wf_pending',
     $o$'/hr/tasks/' || i.id::text || '?step=' || s.id::text$o$,
     $o$'/hr/tasks/' || i.id::text || '?org=' || i.organization_id::text || '&step=' || s.id::text$o$],
    ['hr', 'wf_for_target',
     $o$'deep_link', '/hr/tasks/' || i.id::text))$o$,
     $o$'deep_link', '/hr/tasks/' || i.id::text || '?org=' || i.organization_id::text))$o$],
    -- ── the leave ledger addresses ────────────────────────────────────────────────────────────
    ['hr', 'leave_balances',
     $o$format('/hr/leave/balances/%s/%s', v_r.employment_id, v_r.leave_policy_id)$o$,
     $o$format('/hr/leave/balances/%s/%s?org=%s', v_r.employment_id, v_r.leave_policy_id, p_organization_id)$o$],
    ['hr', 'leave_calendar',
     $o$then '/hr/me/time-off'$o$,
     $o$then format('/hr/me/time-off?org=%s', p_organization_id)$o$],
    ['hr', 'leave_calendar',
     $o$format('/hr/leave?request=%s', v_r.id)$o$,
     $o$format('/hr/leave?request=%s&org=%s', v_r.id, p_organization_id)$o$],
    -- RD 1: the one function with no org variable resolves one from the employment it is already
    -- scoped to, rather than growing a parameter on a client door.
    ['hr', 'my_time_off',
     $o$format('/hr/me/time-off/%s', v_r.leave_policy_id)$o$,
     $o$format('/hr/me/time-off/%s?org=%s', v_r.leave_policy_id, (select em.organization_id from hr.employment em where em.id = v_emp))$o$],
    -- ── refusal-envelope doors ────────────────────────────────────────────────────────────────
    ['hr', 'position_change_wf_validate',
     $o$'door','/hr/settings/structure');$o$,
     $o$'door','/hr/settings/structure?org=' || inst.organization_id::text);$o$],
    ['hr', 'recompute_apply',
     $o$'door', '/hr/settings/pay-groups'));$o$,
     $o$'door', '/hr/settings/pay-groups?org=' || v_org::text));$o$],
    ['public', 'hr_compensation_upsert',
     $o$'door', '/hr/time/pay-periods');$o$,
     $o$'door', '/hr/time/pay-periods?org=' || v_org::text);$o$],
    ['public', 'hr_employee_create',
     $o$'door', '/hr/settings/structure');$o$,
     $o$'door', '/hr/settings/structure?org=' || v_org::text);$o$],
    ['public', 'hr_employee_create',
     $o$'door', '/hr/settings/employer');$o$,
     $o$'door', '/hr/settings/employer?org=' || v_org::text);$o$],
    ['public', 'hr_employee_create',
     $o$'door', '/hr/people/new',$o$,
     $o$'door', '/hr/people/new?org=' || v_org::text,$o$],
    ['public', 'hr_employee_create',
     $o$'door', '/hr/people/' || (v_prior ->> 'employee_id'));$o$,
     $o$'door', '/hr/people/' || (v_prior ->> 'employee_id') || '?org=' || v_org::text);$o$],
    ['public', 'hr_employee_create',
     $o$'door', '/hr/people/' || v_employee || '/job');$o$,
     $o$'door', '/hr/people/' || v_employee || '/job?org=' || v_org::text);$o$],
    ['public', 'hr_employee_invite',
     $o$'door', '/hr/people/' || p_employee_id || '/personal');$o$,
     $o$'door', '/hr/people/' || p_employee_id || '/personal?org=' || v_org::text);$o$],
    ['public', 'hr_employer_profile_update',
     $o$'door', '/hr/settings/employer');$o$,
     $o$'door', '/hr/settings/employer?org=' || v_org::text);$o$],
    ['public', 'hr_structure_deactivate',
     $o$when 'department' then '/hr/people?department_id=' || p_id$o$,
     $o$when 'department' then '/hr/people?department_id=' || p_id || '&org=' || v_org::text$o$],
    ['public', 'hr_structure_deactivate',
     $o$when 'location'   then '/hr/people?location_id=' || p_id$o$,
     $o$when 'location'   then '/hr/people?location_id=' || p_id || '&org=' || v_org::text$o$],
    ['public', 'hr_structure_deactivate',
     $o$else '/hr/people?job_title_id=' || p_id end);$o$,
     $o$else '/hr/people?job_title_id=' || p_id || '&org=' || v_org::text end);$o$]
  ];
begin
  for v_i in 1 .. array_length(v_sites, 1) loop
    v_sch := v_sites[v_i][1]; v_fn := v_sites[v_i][2];
    v_old := v_sites[v_i][3]; v_rep := v_sites[v_i][4];

    select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = v_sch and p.proname = v_fn and p.prokind = 'f';
    if v_oid is null then
      raise exception 'hr_l3_111: %.% does not exist', v_sch, v_fn;
    end if;
    v_def := pg_get_functiondef(v_oid);

    if position(v_rep in v_def) > 0 then
      raise notice 'hr_l3_111: %.% site % already carries the employer', v_sch, v_fn, v_i;
      continue;
    end if;
    if position(v_old in v_def) = 0 then
      -- 🚨 NEVER HALF-APPLY. A body that no longer carries the expected composition has been
      -- rewritten by another lane; guessing at it is how a fix gets silently discarded.
      raise exception 'hr_l3_111: %.% does not carry the expected composition (site %) — refusing to half-apply: %',
        v_sch, v_fn, v_i, left(v_old, 80);
    end if;
    v_new := replace(v_def, v_old, v_rep);
    execute v_new;
    v_fixed := v_fixed + 1;
  end loop;
  raise notice 'hr_l3_111: % composition shape(s) rewritten to carry the employer', v_fixed;
end
$mig$;

-- ── 3b. public.hr_transfer — the one composition that spanned two lines (RD 6) ────────────────────
-- Done separately and as ONE regexp_replace, because rewriting its two lines as two independent
-- string swaps would leave the body SYNTACTICALLY INVALID between them and the first CREATE OR
-- REPLACE would refuse. The pattern is whitespace-tolerant (`\s+` across the line break) so it
-- cannot depend on hand-counted indentation, and the result is a single-line format() template.
do $mig$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_transfer' and p.prokind = 'f';
  if v_oid is null then raise exception 'hr_l3_111: public.hr_transfer does not exist'; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ~ '/hr/people/%s\?org=%s' then
    raise notice 'hr_l3_111: public.hr_transfer already carries the employer';
  else
    v_new := regexp_replace(v_def,
      '''door'', ''/hr/people/'' \|\| coalesce\(\(select em\.employee_id::text from hr\.employment em\s+where em\.id = v_employment\), ''''\)\);',
      '''door'', ''/hr/people/'' || coalesce((select em.employee_id::text from hr.employment em where em.id = v_employment), '''') || ''?org='' || v_org::text);');
    if v_new = v_def then
      raise exception 'hr_l3_111: public.hr_transfer does not carry the expected composition — refusing to half-apply';
    end if;
    execute v_new;
    raise notice 'hr_l3_111: public.hr_transfer''s cross-employer door now carries the employer';
  end if;
end
$mig$;

-- ============================================================ 4. the 535 existing notices (RD 7)
do $bf$
declare
  v_rows integer; v_before text; v_after text; v_cnt_before bigint; v_cnt_after bigint;
begin
  -- the "nothing else moved" witness: every column except deep_link, plus payload minus its
  -- deep_link key. Captured BEFORE the update and asserted identical after it.
  select count(*), md5(coalesce(string_agg(w, '|' order by w), ''))
    into v_cnt_before, v_before
    from (select id::text || ':' || coalesce(organization_id::text,'') || ':' || coalesce(event_key,'')
                 || ':' || coalesce(recipient_user_id::text,'') || ':' || coalesce(recipient_kind,'')
                 || ':' || coalesce(channel,'') || ':' || coalesce(to_address,'') || ':' || coalesce(status,'')
                 || ':' || coalesce(error_code,'') || ':' || coalesce(target_kind,'')
                 || ':' || coalesce(target_id::text,'') || ':' || coalesce(dedupe_key,'')
                 || ':' || coalesce(created_at::text,'')
                 || ':' || md5((payload - 'deep_link')::text) as w
            from communication.notification) q;

  with fix as (
    select id,
           deep_link || case when deep_link like '%?%' then '&' else '?' end
                      || 'org=' || organization_id::text as new_link
      from communication.notification
     where deep_link like '/hr%' and deep_link !~ '[?&]org=' and organization_id is not null
  )
  update communication.notification n
     set deep_link = f.new_link,
         payload = case when n.payload ? 'deep_link'
                        then jsonb_set(n.payload, '{deep_link}', to_jsonb(f.new_link))
                        else n.payload end
    from fix f
   where n.id = f.id;
  get diagnostics v_rows = row_count;

  select count(*), md5(coalesce(string_agg(w, '|' order by w), ''))
    into v_cnt_after, v_after
    from (select id::text || ':' || coalesce(organization_id::text,'') || ':' || coalesce(event_key,'')
                 || ':' || coalesce(recipient_user_id::text,'') || ':' || coalesce(recipient_kind,'')
                 || ':' || coalesce(channel,'') || ':' || coalesce(to_address,'') || ':' || coalesce(status,'')
                 || ':' || coalesce(error_code,'') || ':' || coalesce(target_kind,'')
                 || ':' || coalesce(target_id::text,'') || ':' || coalesce(dedupe_key,'')
                 || ':' || coalesce(created_at::text,'')
                 || ':' || md5((payload - 'deep_link')::text) as w
            from communication.notification) q;

  if v_cnt_before <> v_cnt_after then
    raise exception 'hr_l3_111: notification row count moved % -> %', v_cnt_before, v_cnt_after;
  end if;
  if v_before is distinct from v_after then
    raise exception 'hr_l3_111: the backfill moved something other than deep_link — refusing';
  end if;
  if exists (select 1 from communication.notification
              where deep_link like '/hr%' and deep_link !~ '[?&]org=') then
    raise exception 'hr_l3_111: an employer-free HR deep link survived the backfill';
  end if;
  raise notice 'hr_l3_111: % notification deep_link(s) backfilled; every column except deep_link, payload.deep_link and the trigger-written updated_at/updated_by is byte-identical', v_rows;
end
$bf$;

-- ============================================================ 5. CHECK 37 (RD 8/9)
do $mig$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_write_path_conformance';
  if v_src is null then
    raise exception 'hr_l3_111: hr.punch_write_path_conformance not found';
  end if;
  if position('hr_deep_links_carry_the_employer' in v_src) > 0 then
    raise notice 'hr_l3_111: check 37 already installed';
    return;
  end if;

  v_new := replace(v_src,
$anchor$        || 'so it can never block a migration.');
  end;
  return next;

end
$function$$anchor$,
$anchor$        || 'so it can never block a migration.');
  end;
  return next;

  ---------------------------------------------------------------- 37. every hand-built /hr link carries the employer
  check_key := 'hr_deep_links_carry_the_employer';
  declare v_tmpl integer; begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'function', t.schema_name || '.' || t.function_name,
             'line_no', t.line_no, 'line', left(t.line, 200)) order by t.schema_name, t.function_name, t.line_no),
           '[]'::jsonb)
      into v_bad from hr.hr_links_without_employer() t;
    -- RD 9: the DORMANT half — declared templates nothing renders yet. Counted every run, never
    -- blocking, so it can neither be forgotten nor block on a link that does not exist yet.
    select count(*) into v_tmpl from communication.notification_event_type
     where config ->> 'deep_link_template' like '/hr%'
       and (config ->> 'deep_link_template') !~ '[?&]org=';
    ok       := (v_bad = '[]'::jsonb);
    severity := 'blocking';
    detail   := jsonb_build_object(
      'violations', v_bad,
      'catalog_templates_without_employer', v_tmpl,
      'why', 'features/hr/routes.ts: NOBODY HAND-ASSEMBLES AN HR URL. HR is strictly '
        || 'single-employer and SPEC-UI-IA 1 resolves the active employer from ?org= FIRST, so a '
        || '/hr link with no employer lands its reader in whichever employer the picker chooses -- '
        || 'proven live on 2026-08-28, where a bare /hr/tasks link rewrote every subsequent link to '
        || 'a DIFFERENT employer. The TypeScript guard (no-hand-built-hr-urls.test.ts) closed this '
        || 'for .ts/.tsx and structurally cannot see a || concatenation inside a CREATE FUNCTION '
        || 'body -- which is where the 26 worst instances were, including the notification spine, '
        || 'the one link people follow from OUTSIDE the app with no employer to inherit. Detector: '
        || 'hr.hr_links_without_employer(). Narrowed to NAVIGATION POSITION the way the TS guard is: '
        || 'a link literal starts at the path, so it matches quote-then-/hr and ignores '
        || 'POST /hr/... route mentions and prose. The employer must sit on the SAME line as the '
        || 'path (write a format() template if the composition is long); the escape hatch is an '
        || 'hr-url-exempt: comment with an author. catalog_templates_without_employer counts '
        || 'communication.notification_event_type deep_link_template declarations of the same shape '
        || '-- nothing renders them yet, so they are reported and NOT blocked on.');
  end;
  return next;

end
$function$$anchor$);

  if v_new = v_src then
    raise exception 'hr_l3_111: the check-37 anchor did not match — the conformance function tail moved';
  end if;
  execute v_new;
end
$mig$;

-- ============================================================ 6. the contracts
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, must_be_definer, reason)
values
  ('hr', 'punch_write_path_conformance', 'hr_l3_111',
   array['hr_deep_links_carry_the_employer', 'hr_links_without_employer'], '{}', true,
   'hr_l3_111: check 37 -- the SQL half of "nobody hand-assembles an HR URL". A re-emit of the '
   || 'conformance function that drops it removes the ONLY mechanism that can see an employer-free '
   || '/hr link inside a function body; the TypeScript guard reads .ts/.tsx and is structurally '
   || 'blind to SQL.'),
  ('hr', '_wf_notify', 'hr_l3_111',
   array['?org=', 'inst.organization_id::text'], '{}', true,
   'hr_l3_111: the notification deep link must carry the employer. This is the link a person '
   || 'follows from an email or an SMS with no HR page open to inherit an employer from -- the last '
   || 'place in the product that may drop ?org=. It wrote 535 employer-free links before this.'),
  ('hr', '_wf_project_step', 'hr_l3_111',
   array['?org=', 'inst.organization_id::text'], '{}', true,
   'hr_l3_111: the projected step''s source_url is a notification deep link and carries the '
   || 'employer for the same reason hr._wf_notify does.'),
  ('hr', 'wf_inbox', 'hr_l3_111',
   array['?org=', 'i.organization_id::text'], '{}', true,
   'hr_l3_111: both the queue and team scope deep links carry the employer. A queue row followed '
   || 'without it opens the task in whichever employer the picker chooses.'),
  ('hr', 'wf_pending', 'hr_l3_111',
   array['?org=', 'i.organization_id::text'], '{}', true,
   'hr_l3_111: the needs_my_decision deep link carries the employer.'),
  ('hr', '_punch_notify_edited', 'hr_l3_111',
   array['?org=', 'p_organization_id::text'], '{}', true,
   'hr_l3_111: a punch-edited notice points at the employee''s timesheet, which is employer-scoped '
   || 'payroll data. The employer was already a parameter and simply was not written into the link.')
on conflict (schema_name, function_name, home_migration) do update
  set must_contain = excluded.must_contain,
      must_not_contain = excluded.must_not_contain,
      must_be_definer = excluded.must_be_definer,
      reason = excluded.reason,
      is_active = true;

-- ============================================================ 7. post-conditions that EXECUTE
do $$
declare
  v_bad integer; v_before integer; v_pre integer; v_res jsonb; v_sites integer; v_stripped integer;
begin
  -- the detector is green
  select count(*) into v_sites from hr.hr_links_without_employer();
  if v_sites > 0 then
    raise exception 'hr_l3_111: % employer-free /hr link site(s) survived: %', v_sites,
      (select string_agg(schema_name || '.' || function_name || ':' || line_no, ', ')
         from hr.hr_links_without_employer());
  end if;

  -- check 37 landed, is returned, and is green
  perform 1 from hr.punch_write_path_conformance() where check_key = 'hr_deep_links_carry_the_employer';
  if not found then
    raise exception 'hr_l3_111: check 37 did not land in the conformance function';
  end if;
  if exists (select 1 from hr.punch_write_path_conformance()
              where check_key = 'hr_deep_links_carry_the_employer' and not ok) then
    raise exception 'hr_l3_111: check 37 is RED on landing: %',
      (select detail::text from hr.punch_write_path_conformance()
        where check_key = 'hr_deep_links_carry_the_employer');
  end if;

  -- 🚨 the DDL guard (hr_l3_108) revokes client EXECUTE from any re-created definer that is not
  -- grandfathered. All six public.hr_* doors here ARE grandfathered by argtypes and the signatures
  -- did not change, so nothing should have been stripped. Asserted, never assumed.
  select count(*) into v_stripped
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_compensation_upsert','hr_employee_create','hr_employee_invite',
                       'hr_employer_profile_update','hr_structure_deactivate','hr_transfer')
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_stripped > 0 then
    raise exception 'hr_l3_111: % public HR door(s) lost authenticated EXECUTE in the rewrite', v_stripped;
  end if;

  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_l3_111: the workflow door smoke test failed: %', v_res;
  end if;

  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_l3_111: % function contract(s) broken: %', v_bad,
      (select string_agg(qname || '/' || clause || '/' || missing_or_present, ', ')
         from hr.function_contracts_broken());
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_l3_111_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_l3_111: hr conformance findings rose from % to %', v_before, v_bad;
  end if;

  v_pre := current_setting('matrx.hr_l3_111_sites_before')::integer;
  raise notice 'hr_l3_111: guard was RED on % site(s) before the fix and is GREEN after; every HR deep link carries the employer',
    v_pre;
end $$;
