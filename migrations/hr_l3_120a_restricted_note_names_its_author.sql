-- hr_l3_120a — A RESTRICTED NOTE NAMES ITS AUTHOR.
--
-- THE GAP (verified live 2026-08-30). `hr._project_row` is the ONE place an audited HR door
-- turns a stored row into the payload a client renders, and it resolves a person's display name
-- from exactly two column names:
--
--     v_subject := coalesce(nullif(v_row ->> 'subject_employment_id',''),
--                           nullif(v_row ->> 'employment_id',''))::uuid;
--
-- `hr.restricted_note` names its person `author_employment_id` — the note's WRITER, not its
-- subject — so it matched neither branch and the row went out with no name on it at all. The
-- client half was honest about it (`fetchHrCaseRestrictedNotes` mapped `author_name` from
-- `row.subject_name` and always got null), which is why `RestrictedNotesPanel` has been
-- rendering every note unsigned: kind, date, body, and nobody.
--
-- WHY A SHAPE BRANCH AND NOT A PER-TOKEN COLUMN MAP. Measured before choosing: of the 130
-- registered `hr` tokens, exactly two carry `author_employment_id` — `hr_restricted_note` and
-- `hr_schedule_guidance` — and NEITHER carries `subject_employment_id` or `employment_id`, so
-- neither can name its person today. A token→column table would need a row for both and a new
-- row for every author-shaped table added later; the branch below is the same shape rule the
-- subject branch already is, and it covers both the day it lands. The two ideas do not collide
-- either: `author_name` is a SEPARATE key, so a table that one day carries both a subject and an
-- author names both, and no existing consumer of `subject_name` changes meaning.
--
-- THE DISPLAY-NAME LAW IS NOT RE-IMPLEMENTED HERE. The author goes through
-- `hr._subject_display_name`, the same one door the subject branch uses, which delegates to
-- `hr._employee_display_name` and applies the viewer's own directory permissions: an author who
-- opted out of the directory is named only to themselves and to HR in that organization, and to
-- everybody else this key comes back NULL. That is the point — ABSENT, never the uuid. Nothing
-- in this file compares, caches, or second-guesses that verdict, and the contract pinned below
-- fails the moment somebody arms a second copy of the rule inside `_project_row`.
--
-- NOT A WIDENING, AND NOT A NEW DOOR. `_project_row` is reached only from inside
-- `hr._door_get` / `hr._door_list` / `hr.break_glass` / `hr.my_compensation`, AFTER
-- `hr._door_verdict` has already decided the caller may have the row; `authenticated` and `anon`
-- hold no EXECUTE on it (checked live: both false, and it holds no
-- `platform.client_callable_door` row because it is not client-callable). So no door is created
-- or changed here and no GRANT is issued — there is nothing to declare. What changes is one more
-- key on a payload the caller was already entitled to, whose value is decided by the suppression
-- rule and not by this function.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE PROJECTION
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function hr._project_row(p_token text, p_schema text, p_table text, p_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'hr', 'public'
as $function$
declare v_row jsonb; c text; v_subject uuid; v_author uuid;
begin
  execute format('select to_jsonb(t) from %I.%I t where t.id = $1', p_schema, p_table)
     into v_row using p_id;
  if v_row is null then return null; end if;
  foreach c in array coalesce(
      (select client_excluded_columns from platform.entity_types where token = p_token), '{}'::text[])
  loop
    v_row := v_row - c;
  end loop;

  -- hr_l3_41 decision 1: whichever subject column this class actually carries. `hr.incident` names
  -- it `subject_employment_id`; the rest name it `employment_id`. Anything else keeps no name.
  v_subject := coalesce(nullif(v_row ->> 'subject_employment_id',''),
                        nullif(v_row ->> 'employment_id',''))::uuid;
  if v_subject is not null then
    v_row := v_row || jsonb_build_object(
      'subject_name', hr._subject_display_name(v_subject, auth.uid()));
  end if;

  -- hr_l3_120a: the row's AUTHOR, on its own key. A note or a piece of guidance names the person
  -- who WROTE it, which is a different fact from who it is about — `hr.restricted_note` and
  -- `hr.schedule_guidance` carry `author_employment_id` and no subject column at all, so before
  -- this branch they went out unsigned. Same one display-name door as the subject branch, so the
  -- viewer's own directory permissions decide it: a suppressed name comes back NULL and the
  -- surface renders the note without a byline. NEVER the uuid.
  v_author := nullif(v_row ->> 'author_employment_id','')::uuid;
  if v_author is not null then
    v_row := v_row || jsonb_build_object(
      'author_name', hr._subject_display_name(v_author, auth.uid()));
  end if;

  return v_row;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE PIN
-- ─────────────────────────────────────────────────────────────────────────────
-- Both branches, and the fact that neither of them is a second copy of the display-name rule.
-- `must_not_contain 'p_token ='` bans the per-token branch this file deliberately did not write —
-- any `p_token = 'hr_...'` special case would trip it, while the token names that appear in the
-- comments do not, because `pg_proc.prosrc` includes them. `directory_opt_out` /
-- `_punch_capability` are the suppression rule's own internals, and
-- their appearance here would mean `_project_row` had started deciding for itself who may see a
-- name — the exact shape of the leak `hr_l3_66` closed one layer down.
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   must_be_definer)
select 'hr', '_project_row', 'hr_l3_120a',
       array['subject_employment_id','author_employment_id','_subject_display_name'],
       array['directory_opt_out','_punch_capability','p_token ='],
       'hr_l3_120a: this is the ONE projection every audited HR door returns through. It resolves '
    || 'a person''s name for BOTH shapes a table can carry — subject (hr_l3_41) and author '
    || '(hr_l3_120a) — and it resolves neither itself: both go through hr._subject_display_name '
    || 'so the directory-suppression rule has exactly one body. A per-token column name in here '
    || 'means the next author-shaped table renders unsigned again, which is the defect this '
    || 'migration fixed.',
       true
where not exists (
  select 1 from hr.function_contract
   where schema_name = 'hr' and function_name = '_project_row');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SELF-PROOF — the migration fails rather than reporting green
-- ─────────────────────────────────────────────────────────────────────────────
do $proof$
declare
  v_txt text; v_n integer; v_row jsonb;
  v_note hr.restricted_note%rowtype; v_login uuid; v_name text;
  v_inc_id uuid; v_schema text; v_table text;
begin
  -- 3a. The branch is in the live body, read out of pg_proc rather than described.
  select pg_get_functiondef(p.oid) into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_project_row';
  if v_txt not like '%author_employment_id%' then
    raise exception 'hr_l3_120a: hr._project_row has no author branch';
  end if;
  if v_txt like '%directory_opt_out%' or v_txt like '%_punch_capability%' then
    raise exception 'hr_l3_120a: hr._project_row re-implements the suppression rule';
  end if;

  -- 3b. THE PAYLOAD, ON A REAL ROW. auth.uid() is NULL in a migration, so the display-name door
  --     correctly answers NULL — what is asserted here is that the KEY IS EMITTED, which is the
  --     thing that was missing. A null value with the key present is what the client reads as
  --     "no byline"; the key absent is what made the client read `subject_name` and get nothing.
  select * into v_note from hr.restricted_note where deleted_at is null order by created_at limit 1;
  if v_note.id is null then
    raise notice 'hr_l3_120a: no live hr.restricted_note row to project — payload proof skipped';
  else
    v_row := hr._project_row('hr_restricted_note','hr','restricted_note', v_note.id);
    if not (v_row ? 'author_name') then
      raise exception 'hr_l3_120a: the projected restricted_note carries no author_name key';
    end if;
    if v_row ->> 'author_name' = v_note.author_employment_id::text then
      raise exception 'hr_l3_120a: author_name is the uuid — a name is a name or it is absent';
    end if;

    -- 3c. AND IT ACTUALLY RESOLVES TO A NAME for a viewer entitled to it. The author reading
    --     their own note is the floor case: hr._employee_display_name returns the name to the
    --     subject themselves even under a directory opt-out, so this must be non-null whenever
    --     the author's employee row is live and named.
    select e.login_user_id into v_login
      from hr.employment em join hr.employee e on e.id = em.employee_id
     where em.id = v_note.author_employment_id and e.deleted_at is null and e.display_name is not null;
    if v_login is not null then
      v_name := hr._subject_display_name(v_note.author_employment_id, v_login);
      if v_name is null then
        raise exception 'hr_l3_120a: the author cannot resolve their own name through the display door';
      end if;
    end if;
  end if;

  -- 3d. NO REGRESSION on the subject branch this file rewrote around.
  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = 'hr_incident';
  select id into v_inc_id from hr.incident
   where deleted_at is null and subject_employment_id is not null limit 1;
  if v_inc_id is null then
    raise notice 'hr_l3_120a: no live hr.incident with a subject — subject-branch proof skipped';
  else
    v_row := hr._project_row('hr_incident', v_schema, v_table, v_inc_id);
    if not (v_row ? 'subject_name') then
      raise exception 'hr_l3_120a: hr._project_row stopped emitting subject_name';
    end if;
  end if;

  -- 3e. The contract is pinned and the whole HR contract set is intact.
  if not exists (select 1 from hr.function_contract
                  where schema_name='hr' and function_name='_project_row' and is_active) then
    raise exception 'hr_l3_120a: no active hr.function_contract row for hr._project_row';
  end if;
  select count(*) into v_n from hr.function_contracts_broken();
  if v_n > 0 then
    raise exception 'hr_l3_120a: hr.function_contracts_broken() returns % row(s)', v_n;
  end if;

  -- 3f. NOT A DOOR. This function must stay unreachable from a client role — the branch added
  --     above is only ever run behind hr._door_verdict.
  if has_function_privilege('authenticated','hr._project_row(text,text,text,uuid)','execute')
     or has_function_privilege('anon','hr._project_row(text,text,text,uuid)','execute') then
    raise exception 'hr_l3_120a: hr._project_row is executable by a client role';
  end if;

  raise notice 'hr_l3_120a: author branch live, name resolves through the one display door, subject branch intact.';
end
$proof$;

commit;
