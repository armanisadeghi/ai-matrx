-- hr_l3_97 — §4.1's mandated reason taxonomy, seeded and enforced on both correction lanes.
--
-- PURPOSE
--   SPEC-TIME §4.1 requires the punch edit form to carry *"a REQUIRED reason FROM THE REASON
--   TAXONOMY plus free text"*. The free text shipped (`p_reason`, refused under two characters); the
--   taxonomy never existed. `platform.categories` held 29 `hr_*` dimensions and not one of them was a
--   time or punch reason set, so the definite article in the spec pointed at nothing.
--
--   The same gap left a live hole one door over: `hr.time_adjustment_create` takes
--   `p_reason_category_id uuid` with a real FK to `platform.categories(id)` and validated it against
--   NO dimension at all — so it would have accepted a leave-request reason, an offer-decline reason,
--   or any other category in the database as the reason a timecard was corrected after lock.
--
-- WHY ONE DIMENSION SERVES BOTH DOORS
--   The spec settles it rather than leaving it to taste. §4.1's own flowchart branches on the period
--   state and routes the SAME act both ways: open/submitted/approved → `hr.punch_correct`;
--   *"locked or closed → Edit is ABSENT. The surface offers the adjustment lane instead:
--   hr.time_adjustment_create"*. §1.3 calls that door **"Post-lock correction"**, §5 says the fix
--   *"before and after lock; after lock it becomes a `hr.time_adjustment`"*, and `hr.punch_correct`'s
--   own locked-period refusal routes the caller there BY NAME. A manager's reason for fixing a
--   timecard does not change because the period locked — only the mechanism does. Two dimensions
--   would let the same human act be described in two vocabularies depending on a date.
--
-- THE VALUES (basis recorded on every row, per the ruling)
--   Six derived from the three fields the door actually lets a human correct (`occurred_at`,
--   `punch_kind`, `break_paid`) and from conditions the system already names in
--   `hr.attendance_exception.exception_kind`, plus the ruled catch-all:
--     missed_punch · wrong_time_recorded · wrong_punch_kind · worked_through_break ·
--     duplicate_punch · device_or_clock_error · other_reason
--
--   🚨 `other_reason` IS NOT A GAP IN THE TAXONOMY, IT IS WHAT KEEPS THE TAXONOMY HONEST. §4.1 pairs
--   the category with MANDATORY free text, so the substance always arrives either way. Without a
--   catch-all a manager whose reason fits none of the six must pick one that is FALSE, and a forced
--   wrong pick is a data lie that then gets counted, filtered and reported on. `other_reason` with
--   mandatory prose records "none of these, and here is what actually happened" — which is true.
--
-- Applied live as `hr_l3_97_the_correction_reason_taxonomy`. Idempotent.
--
-- RECORDED TECHNICAL DECISIONS
--   · DROP-THEN-CREATE, NOT `CREATE OR REPLACE`, FOR BOTH DOORS. Adding `p_category` changes the
--     arity, and `CREATE OR REPLACE` with a changed signature does not replace — it OVERLOADS, and
--     PostgREST answers PGRST203 "could not choose the best candidate" to every call it can no longer
--     resolve. That is a silent kill of the whole door, and it is what check 34 exists to catch. The
--     old signature is dropped in the same statement block that creates the new one.
--   · THE PARAMETER DEFAULTS TO NULL SO EXISTING CALLERS ARE UNBROKEN — a three-argument call still
--     resolves against the four-argument function. Requiring a category is the DIALOG's job for a NEW
--     correction; the door's job is to refuse a category that is not one of these, which is the half
--     no client can be trusted to do for itself.
--   · THE CATEGORY IS STORED, NOT JUST VALIDATED. A parameter that is checked and then discarded is
--     the silent-ignore defect hr_l3_94 closed on a different door. It lands on the REPLACEMENT punch
--     in a real FK column beside the free text it qualifies — mirroring `hr.time_adjustment`, which
--     already stores its reason category as a column rather than in metadata.
--   · NO BACKFILL IS NEEDED AND NONE IS PERFORMED. `hr.time_adjustment` holds ZERO rows, so no
--     existing adjustment carries a wrong-dimension category to repair. Verified, not assumed.

-- ── 1. THE VOCABULARY ────────────────────────────────────────────────────────────────────────────
-- 🚨 SEEDED UNDER THE PLATFORM TENANT, THE WAY EVERY OTHER SYSTEM DIMENSION IS.
-- `platform.categories.organization_id` is NOT NULL — categories belong to a tenant, and the 29
-- existing `hr_*` dimensions all live under the "Matrx System" org with `is_system = true`. The org
-- is resolved through `iam.system_orgs` by its KEY rather than by name or a pasted uuid, so this
-- migration is portable to any database that has a system tenant.
insert into platform.categories (organization_id, dimension, name, slug, is_system, position, metadata)
select (select s.organization_id from iam.system_orgs s where s.key = 'system'),
       v.dimension, v.name, v.slug, true, v.position,
       jsonb_build_object(
         'basis', v.basis,
         'authority', 'SPEC-TIME §4.1 — "a REQUIRED reason from the reason taxonomy plus free text"',
         'seeded_by', 'hr_l3_97_the_correction_reason_taxonomy')
  from (values
    ('hr_punch_correction_reason', 'Missed punch', 'missed_punch', 10,
     'The punch was never recorded and is being supplied. Mirrors exception kinds missed_punch and orphan_punch.'),
    ('hr_punch_correction_reason', 'Wrong time recorded', 'wrong_time_recorded', 20,
     'Right event, wrong instant. Corrects the occurred_at field; covers exception kind auto_closed_estimate.'),
    ('hr_punch_correction_reason', 'Wrong punch kind', 'wrong_punch_kind', 30,
     'Right instant, wrong button — a clock_out where a break_start belonged. Corrects the punch_kind field.'),
    ('hr_punch_correction_reason', 'Worked through the break', 'worked_through_break', 40,
     'The break was recorded but the employee worked it. Corrects break_paid; named explicitly in SPEC-TIME §4.1 and an exception kind.'),
    ('hr_punch_correction_reason', 'Duplicate punch', 'duplicate_punch', 50,
     'The same event was recorded twice. The punch register already filters on duplicate_suspected.'),
    ('hr_punch_correction_reason', 'Device or clock error', 'device_or_clock_error', 60,
     'A device or kiosk produced a wrong stamp. Grounded in clock_skew_applied_seconds and exception kind ip_verification_failed.'),
    ('hr_punch_correction_reason', 'Other (explain below)', 'other_reason', 70,
     'None of the above. RULED IN deliberately: §4.1 pairs the category with mandatory free text, so without a catch-all a manager whose reason fits none of the six must pick one that is false, and a forced wrong pick is a data lie.')
  ) as v(dimension, name, slug, position, basis)
 where not exists (
   select 1 from platform.categories c
    where c.dimension = v.dimension and c.slug = v.slug and c.deleted_at is null);

-- ── 2. WHERE THE CHOSEN REASON IS KEPT ───────────────────────────────────────────────────────────
alter table hr.punch
  add column if not exists entered_reason_category_id uuid references platform.categories(id);

comment on column hr.punch.entered_reason_category_id is
  'The hr_punch_correction_reason category chosen for the correction that produced this replacement '
  'punch (hr_l3_97). Sits beside entered_reason, which carries the mandatory free text. Null on a '
  'punch that was recorded normally rather than as a correction.';

-- ── 3. THE INNER DOOR: TAKE IT, VALIDATE IT, STORE IT ────────────────────────────────────────────
do $mig$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_correct';
  if v_src is null then
    raise exception 'hr_l3_97: hr.punch_correct not found';
  end if;

  if position('p_category' in v_src) > 0 then
    return;   -- already applied
  end if;
  v_new := v_src;

  -- 3a. the signature
  v_new := replace(v_new,
    $q$hr.punch_correct(p_punch_ids uuid[], p_new_values jsonb, p_reason text)$q$,
    $q$hr.punch_correct(p_punch_ids uuid[], p_new_values jsonb, p_reason text, p_category uuid DEFAULT NULL::uuid)$q$);

  -- 3b. validation, immediately after the free-text check, before anything is written
  v_new := replace(v_new,
    $q$  if p_punch_ids is null or cardinality(p_punch_ids) = 0 then$q$,
    $q$  -- hr_l3_97: the category is optional on the wire so existing callers keep working, but a
  -- category that IS given must be one of ours. An unvalidated FK to platform.categories accepts
  -- any category in the database -- a leave reason, an offer-decline reason -- as the reason a
  -- timecard was changed.
  if p_category is not null and not exists (
       select 1 from platform.categories c
        where c.id = p_category and c.dimension = 'hr_punch_correction_reason'
          and c.deleted_at is null) then
    return hr._punch_refusal('hr_punch_reason_category_unknown',
      'That is not a punch-correction reason. Choose one of the reasons this form offers.',
      jsonb_build_object('given', p_category, 'dimension', 'hr_punch_correction_reason'));
  end if;

  if p_punch_ids is null or cardinality(p_punch_ids) = 0 then$q$);

  -- 3c. STORE it on the replacement, beside the free text it qualifies
  v_new := replace(v_new,
    $q$      entered_reason, original_values, metadata)$q$,
    $q$      entered_reason, entered_reason_category_id, original_values, metadata)$q$);
  v_new := replace(v_new,
    $q$      p_reason,
      v_item -> 'original_values',                        -- the pre-edit payload, verbatim$q$,
    $q$      p_reason, p_category,
      v_item -> 'original_values',                        -- the pre-edit payload, verbatim$q$);

  -- 3d. one signature only: the three-argument form is DROPPED, never left beside the new one.
  drop function if exists hr.punch_correct(uuid[], jsonb, text);
  execute v_new;
end
$mig$;

-- ── 4. THE PUBLIC DOOR, SAME ARITY CHANGE, SAME NO-OVERLOAD RULE ─────────────────────────────────
drop function if exists public.hr_punch_correct(uuid[], jsonb, text);

create or replace function public.hr_punch_correct(
  p_punch_ids uuid[], p_new_values jsonb, p_reason text, p_category uuid default null)
returns jsonb
language sql
security definer
set search_path to 'public', 'hr'
as $wrap$
  select hr.punch_correct($1, $2, $3, $4);
$wrap$;

revoke execute on function public.hr_punch_correct(uuid[], jsonb, text, uuid) from public;
revoke execute on function public.hr_punch_correct(uuid[], jsonb, text, uuid) from anon;
grant execute on function public.hr_punch_correct(uuid[], jsonb, text, uuid) to authenticated;

-- ── 5. THE ADJACENT HOLE: THE ADJUSTMENT LANE VALIDATES AGAINST THE SAME DIMENSION ───────────────
do $adj$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'time_adjustment_create';
  if v_src is null then
    raise exception 'hr_l3_97: hr.time_adjustment_create not found';
  end if;
  if position('hr_punch_correction_reason' in v_src) > 0 then
    return;   -- already applied
  end if;

  -- 🚨 ANCHORED ON THE END OF THE DECLARE BLOCK, NOT ON THE BARE WORD `begin`. `replace()` rewrites
  -- EVERY occurrence, and plpgsql uses `begin` to open each nested block — this body happens to have
  -- exactly one, but anchoring on a token whose count is a coincidence is how a surgical edit
  -- silently shreds a function the next time somebody adds an exception handler.
  if position($q$  v_inst   uuid;
begin$q$ in v_src) = 0 then
    raise exception 'hr_l3_97: the declare-block anchor in hr.time_adjustment_create has moved';
  end if;
  v_new := replace(v_src,
    $q$  v_inst   uuid;
begin$q$,
    $q$  v_inst   uuid;
begin
  -- hr_l3_97: `p_reason_category_id` has a real FK to platform.categories and was checked against
  -- NO dimension, so any category in the database was accepted as the reason a locked timecard was
  -- corrected. The adjustment is the POST-LOCK CONTINUATION of the punch correction (SPEC-TIME §4.1
  -- routes the same act here when the period is locked), so it takes the SAME vocabulary.
  if p_reason_category_id is not null and not exists (
       select 1 from platform.categories c
        where c.id = p_reason_category_id and c.dimension = 'hr_punch_correction_reason'
          and c.deleted_at is null) then
    return hr._time_refusal('hr_adjustment_reason_category_unknown',
      'That is not a timecard-correction reason. A post-lock adjustment is the same correction as '
      || 'an in-period punch edit, and it uses the same reasons.',
      jsonb_build_object('given', p_reason_category_id,
                         'dimension', 'hr_punch_correction_reason'));
  end if;$q$);

  execute v_new;
end
$adj$;

-- ── 6. FALSIFICATION AND CONTRACTS ───────────────────────────────────────────────────────────────
do $chk$
declare v_n integer; v_src text;
begin
  select count(*) into v_n from platform.categories
   where dimension = 'hr_punch_correction_reason' and deleted_at is null;
  if v_n <> 7 then
    raise exception 'hr_l3_97: expected 7 correction reasons, found %', v_n;
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hr_punch_correct') <> 1 then
    raise exception 'hr_l3_97: public.hr_punch_correct does not resolve to ONE signature - PGRST203';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'punch_correct') <> 1 then
    raise exception 'hr_l3_97: hr.punch_correct does not resolve to one signature';
  end if;

  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_correct';
  if position('entered_reason_category_id' in v_src) = 0 then
    raise exception 'hr_l3_97: the category is validated but never STORED - the silent-ignore defect';
  end if;
end
$chk$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   is_active, must_be_definer, overloads_intended)
values
  ('hr', 'punch_correct', 'hr_l3_97_the_correction_reason_taxonomy',
   array['hr_punch_reason_category_unknown', 'entered_reason_category_id'],
   array[]::text[],
   'SPEC-TIME §4.1 requires a reason FROM THE TAXONOMY plus free text. The category must be '
   || 'VALIDATED against hr_punch_correction_reason (an unvalidated FK to platform.categories '
   || 'accepts a leave reason as a punch-correction reason) and must be STORED on the replacement '
   || 'punch — a parameter that is checked and then discarded is the silent-ignore defect hr_l3_94 '
   || 'closed on another door. A re-emit dropping either half restores one of those two bugs.',
   true, true, false),
  ('hr', 'time_adjustment_create', 'hr_l3_97_the_correction_reason_taxonomy',
   array['hr_adjustment_reason_category_unknown'],
   array[]::text[],
   'p_reason_category_id has a real FK to platform.categories and was checked against no dimension, '
   || 'so any category in the database was accepted as the reason a locked timecard was corrected. '
   || 'The post-lock adjustment is the same human act as the in-period punch edit (SPEC-TIME §4.1 '
   || 'routes it here when the period is locked) and takes the same vocabulary.',
   true, true, false)
on conflict do nothing;
