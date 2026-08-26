-- HR domain — C1 (register item HRB-004): registry sub-feature nodes + the first
-- `platform.feature_knob` rows under the settled HR knob-slug vocabulary.
--
-- Authority: /projects/hr-domain/specs/SPEC-DATA-MODEL.md §17.7 (taxonomy map), §19.1/§19.2
-- (knob grammar + register), and /projects/hr-domain/readiness/R-CORE-READINESS.md §a.4 + B1.
--
-- Idempotent. Applied live as migration `hr_c1_registry_and_knobs`.
--
-- TWO DELIBERATE OMISSIONS, both recorded on the register:
--   1. SPEC-DATA-MODEL §18.1 file 00 says "promote the seven feature nodes to canonical".
--      /policies/feature-registry.md forbids an agent flipping ANY node to canonical — that is
--      Arman's, batched by the docs-steward. The nodes stay `proposed`; nothing in the schema
--      depends on their status.
--   2. `hr.employees.self_service_field_policy` (§19.2) is a jsonb map, and
--      `platform.feature_knob.value_type` admits only number/integer/boolean/string/enum.
--      Seeding it would require a platform CHECK change with 438 tokens downstream — not a
--      change this lane makes on its own authority. Left for the knob-store owner.

set local lock_timeout = '20s';

-- ============================================================ 1. sub-feature registry nodes
-- The only two sub-features SPEC-DATA-MODEL names: §10 `employee-relations` and
-- §14 `compliance-substrate`, both under the `hr-employees` feature node. `proposed` per
-- /policies/feature-registry.md — agents may add proposed nodes, never canonical ones.

insert into platform.taxonomy_node (slug, name, level, parent_id, status, notes)
select v.slug, v.name, 'subfeature',
       (select id from platform.taxonomy_node where slug = 'hr-employees'),
       'proposed', v.notes
from (values
  ('employee-relations', 'Employee Relations',
   'HR Domain build (HRB-004). Corrective actions, incidents, incident parties and the owner-only restricted-note lane - SPEC-DATA-MODEL section 10.'),
  ('compliance-substrate', 'Compliance Substrate',
   'HR Domain build (HRB-004). Record classes, retention rules, legal holds, disposition evidence and the audited-read log - SPEC-DATA-MODEL sections 14/15.')
) as v(slug, name, notes)
where not exists (select 1 from platform.taxonomy_node t where t.slug = v.slug);

-- ============================================================ 2. knob vocabulary + first rows
-- Grammar (SPEC-DATA-MODEL §19.1, settled by R-CORE B1): feature = 'hr.<slug>', slug snake_case,
-- drawn from the CLOSED seventeen-slug list:
--   employees · time_and_attendance · scheduling · leave · hiring · onboarding · training ·
--   documents_and_forms · access · approvals · records · relations · workflow ·
--   jurisdiction_rules · contracts · sms · domain_wide
-- The "must resolve to a registry node" rule is DROPPED (R-CORE B1): `platform.feature_knob`
-- has no taxonomy column and no FK, and nine of the seventeen slugs have no node at all.
--
-- Seeded here: the `hr.employees` group only — the knobs governing the tables this tranche
-- actually creates (SPEC-DATA-MODEL §6/§4, files 03 and 04). Every other group lands with its
-- own lane in `hr_14_knobs_and_shareables.sql`, per §19.2.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due)
values
 ('hr.employees','directory_shows_hire_date','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
  'Directory shows hire date',
  'Whether the employee directory card exposes the hire date to ordinary org members.',
  'agent',
  'Hire date is directory-tier information every colleague can already infer from tenure talk, and service-anniversary recognition is a normal HR courtesy; orgs that treat it as sensitive turn it off in one click.',
  '2026-11-25'),

 ('hr.employees','directory_shows_manager','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
  'Directory shows manager',
  'Whether the employee directory card exposes the primary reporting line to ordinary org members.',
  'agent',
  'The reporting line is the single most-asked directory question ("who do I ask?"), and hiding it by default would make the org chart useless to the people it exists for.',
  '2026-11-25'),

 ('hr.employees','employee_number_format','"EMP-{seq:05}"'::jsonb,'"EMP-{seq:05}"'::jsonb,'string',null,null,null,null,
  'Employee number format',
  'Template used to mint hr.employee.employee_number. {seq:0N} is a zero-padded per-org sequence.',
  'agent',
  'A readable prefixed number is what payroll and I-9 packets are filed under; five digits covers any org we will onboard before this knob is reviewed, and the template is per-org because incoming customers arrive with an existing numbering scheme.',
  '2026-11-25'),

 ('hr.employees','ssn_reveal_requires_reauth','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
  'SSN reveal requires re-authentication',
  'Whether hr.reveal_ssn demands a fresh authentication factor before returning the full value.',
  'agent',
  'The SSN is the one HR value whose leak is unrecoverable for the employee; a re-auth prompt costs an authorised HR admin five seconds and defeats a walked-away session entirely.',
  '2026-11-25'),

 ('hr.employees','org_chart_history_enabled','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
  'Historical org chart enabled',
  'Whether hr.org_chart_as_of is exposed in the UI so the org chart can be read as of a past date.',
  'agent',
  'The effective-dated position model already stores everything the historical chart needs (SPEC-DATA-MODEL 4.10), so the capability is free; the knob exists because a reorg-sensitive org may want the past hidden from ordinary viewers.',
  '2026-11-25'),

 ('hr.employees','blended_rate_min_cell','5'::jsonb,'5'::jsonb,'integer','employees',3,25,null,
  'Blended-rate minimum cell size',
  'Fewest employments that must fall in a bucket before a blended labour rate is shown rather than suppressed.',
  'agent',
  'Five is the same suppression floor the EEO aggregate uses, and it is the smallest cell where a viewer cannot back out an individual pay rate from a group average. Range stops at 25 because a larger floor suppresses every small department into uselessness.',
  '2026-11-25'),

 ('hr.employees','blended_rate_round_to','0.25'::jsonb,'0.25'::jsonb,'number','usd',0.01,5.00,null,
  'Blended-rate rounding increment',
  'Dollar increment a displayed blended labour rate is rounded to.',
  'agent',
  'A quarter-dollar increment reads as a rate rather than a payroll figure, which is the point of a blended rate, and it blurs the last digit that would otherwise help reverse a small cell back to one person.',
  '2026-11-25')

on conflict (feature, key) do update set
  label       = excluded.label,
  description = excluded.description,
  basis       = excluded.basis,
  unit        = excluded.unit,
  value_type  = excluded.value_type,
  min_value   = excluded.min_value,
  max_value   = excluded.max_value,
  allowed_values = excluded.allowed_values,
  default_value  = excluded.default_value,
  review_due  = excluded.review_due
where platform.feature_knob.set_by <> 'human';   -- re-seeding never overwrites a reviewed value

-- ============================================================ 3. assertions
do $$
declare v_nodes integer; v_knobs integer;
begin
  select count(*) into v_nodes from platform.taxonomy_node t
    join platform.taxonomy_node p on p.id = t.parent_id
   where t.level = 'subfeature' and p.slug = 'hr-employees'
     and t.slug in ('employee-relations','compliance-substrate');
  if v_nodes <> 2 then
    raise exception 'hr_c1: expected 2 hr-employees sub-feature nodes, found %', v_nodes;
  end if;

  if exists (select 1 from platform.taxonomy_node t
              join platform.taxonomy_node p on p.id = t.parent_id
             where p.slug = 'hr-employees' and t.level = 'subfeature' and t.status <> 'proposed') then
    raise exception 'hr_c1: a sub-feature node is not proposed';
  end if;

  select count(*) into v_knobs from platform.feature_knob where feature = 'hr.employees';
  if v_knobs < 7 then
    raise exception 'hr_c1: expected >= 7 hr.employees knobs, found %', v_knobs;
  end if;

  -- the closed slug list is the whole HR knob vocabulary; anything else is drift
  if exists (
    select 1 from platform.feature_knob
     where feature like 'hr.%'
       and split_part(feature, '.', 2) not in (
         'employees','time_and_attendance','scheduling','leave','hiring','onboarding','training',
         'documents_and_forms','access','approvals','records','relations','workflow',
         'jurisdiction_rules','contracts','sms','domain_wide')
  ) then
    raise exception 'hr_c1: a feature_knob row uses an HR slug outside the closed seventeen';
  end if;
end $$;
