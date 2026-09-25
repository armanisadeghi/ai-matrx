-- target: branch
--
-- W3-HIST — BRANCH LEVELLING, rule 36 in the direction nobody had checked: production holds
--           eleven rows and the branch holds ZERO.
--
-- THE DEFECT, MEASURED 2026-09-18 01:52 UTC
-- ----------------------------------------
--   branch:     select count(*) from platform.knob_scope_kind  ->  0
--   production: select count(*) from platform.knob_scope_kind  -> 11
--
-- `platform.knob_override.scope_kind` carries `knob_override_scope_kind_fkey` REFERENCES
-- `platform.knob_scope_kind(kind)`. With the table empty, NO knob override of ANY kind can be
-- written on the rehearsal branch — not at the organization rung, not at the table rung, not
-- at the user rung. Every lane rehearsing "an organization sets this differently" therefore
-- rehearses a path that cannot exist there, and the `override_direction` walk inside
-- `platform.knob_resolve` never executes a single loop iteration. That is a green nobody can
-- spend, which is exactly what rule 36 exists to stop.
--
-- It is `platform` row data rather than schema, so `pnpm check:branch-schema-drift` is right
-- to be silent about it: it compares OBJECTS. Recorded here so the next reader knows the
-- gate's scope rather than assuming it covered this.
--
-- WHY THIS LANE FIXES IT (rule 20: a different class that BLOCKS the exit is fixed and named
-- prominently, never filed as a chip)
-- ------------------------------------------------------------------------------------------
-- HIS-3's law is "the retention floor is a platform setting, default thirty days, raisable by
-- an organization and never lowerable". The refusal half is provable without a rung — this
-- lane's `history.retention_floor_raise` refuses before it writes. The POSITIVE control is
-- not: an organization that actually raises its floor to 60 and reads 60 back needs the
-- `organization` rung to exist. Rule 14 forbids an exit made only of absences, so the rung
-- has to be there.
--
-- WHAT IS COPIED, AND HOW FAITHFULLY
-- ----------------------------------
-- All eleven rows verbatim from production, read SELECT-only inside `begin transaction read
-- only` at 01:52 UTC on 2026-09-18: the same `kind`, `precedence`, `scope_schema`,
-- `scope_table`, `scope_row_identity`, `id`, `organization_id`, `visibility` and `metadata`.
-- The ids are copied rather than generated so a row can be diffed across the two databases by
-- primary key, which is what makes a later drift reading meaningful. `created_by` and
-- `updated_by` are left NULL — they are governance columns and copying a person's id onto the
-- rehearsal branch is exactly the thing the preamble forbids.
--
-- `organization_id` is `39c38960-d30c-4840-b0c1-c9960de95582` on every row, production's
-- system organization. The insert is guarded by its existence on the branch: if the branch's
-- restored graph does not carry that organization the file REFUSES by name rather than
-- inventing a different one, because a rung parented to the wrong organization is worse than
-- a missing rung — it would answer for a tenant that never asked.
--
-- BRANCH ONLY, and it will never be otherwise: production already has these rows, so the same
-- file at `--target production` would be a no-op wearing a migration's clothes.
--
-- Idempotent: `on conflict (kind) do nothing`, so it applies twice with the same result.

set lock_timeout = '2s';
set statement_timeout = '120s';

do $lvl$
declare
  v_org uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_before integer;
  v_after  integer;
begin
  select count(*) into v_before from platform.knob_scope_kind;

  if not exists (select 1 from iam.organizations o where o.id = v_org) then
    raise exception 'W3-HIST branch levelling: production''s system organization % is not on this branch, so the eleven knob rungs cannot be copied onto it.', v_org
      using errcode = '23503',
            hint = 'W0-DATA restores the real graph onto the rehearsal branch and that restore is what carries iam.organizations. Re-run it, or level platform.knob_scope_kind from a production read that names whichever organization this branch actually holds — never a different organization chosen here, which would answer knob reads for a tenant that never asked.';
  end if;

  insert into platform.knob_scope_kind
    (kind, precedence, scope_schema, scope_table, scope_row_identity, description, id, organization_id, visibility, metadata)
  values
    ('organization', 10, null, null, 'direct',
     'The organization itself. scope_id = organization_id.',
     'fae766de-d556-41e5-9a93-ea9a872c18d1', v_org, 'internal', '{}'::jsonb),
    ('employer_profile', 20, 'hr', 'employer_profile', 'tenant_row',
     'HR employer profile within an organization (SPEC-DATA-MODEL §19 rung 3).',
     'd09f61b5-3274-42fd-8c3a-3f96e0e0b515', v_org, 'internal', '{}'::jsonb),
    ('brand', 22, 'web', 'brand', 'tenant_row',
     'Marketing brand within an organization (settings-ladder rung 3).',
     '31f8b8ad-87a8-4005-b6a9-17fefbda50ef', v_org, 'internal', '{}'::jsonb),
    ('pay_group', 30, 'hr', 'pay_group', 'tenant_row',
     'HR pay group within an employer (nearer than employer_profile).',
     'ae4cf400-07a7-42eb-a164-4c84d68b79a3', v_org, 'internal', '{}'::jsonb),
    ('site', 32, 'web', 'site', 'tenant_row',
     'Marketing site within a brand (settings-ladder rung 4).',
     'bbe82a80-84b6-434e-99bc-28c4ae2449fa', v_org, 'internal', '{}'::jsonb),
    ('location', 40, 'hr', 'location', 'tenant_row',
     'HR physical location (nearest HR scope).',
     '26d56a94-1978-40a6-b3ea-a9e38b7031ea', v_org, 'internal', '{}'::jsonb),
    ('table', 50, 'platform', 'entity_types', 'platform_taxonomy',
     'One registered table (platform.entity_types.id). Lets a setting be answered per table — DD-131 §4.1, Arman 2026-09-12: "you can override it at the level of the the schema structure for that particular kind".',
     'f65e7084-a0e6-4151-b446-d77bea858dea', v_org, 'internal', '{}'::jsonb),
    ('agent', 60, 'agent', 'definition', 'tenant_row',
     'One agent definition (agent.definition.id). Lets a setting be answered per agent — DD-131 §4.1, Arman 2026-09-12: "or you can override it at the level of, um, the agent itself".',
     '03b9cab0-dda7-4e1f-80fc-749bab04566c', v_org, 'internal', '{}'::jsonb),
    ('rulebook', 70, 'platform', 'rulebook', 'tenant_row',
     'One Rulebook (platform.rulebook.id). Lets a Masterwork setting be answered per Rulebook — the subject of the work — without every Rulebook in the organization inheriting it. Below the user rung on purpose: a person''s standing preference beats a value the system measured onto one Rulebook.',
     '59e13d49-4429-4641-88e1-c1b287d811fb', v_org, 'internal', '{}'::jsonb),
    ('device', 90, null, null, 'direct',
     'One installed client on one machine (desktop instance, extension profile, kiosk device). Narrower than user: what is set here applies only on this device. scope_id is the device / instance id issued by the client.',
     '0e642e71-798d-4ce0-be76-8672a0af6670', v_org, 'internal', '{}'::jsonb),
    ('user', 100, null, null, 'direct',
     'The individual, org-qualified: the same person may hold different values in different organizations. scope_id = user_id.',
     '1c800cdf-8d24-496e-aa2c-c8fbf3e9fe6c', v_org, 'internal', '{}'::jsonb)
  on conflict (kind) do nothing;

  select count(*) into v_after from platform.knob_scope_kind;
  raise notice 'W3-HIST branch levelling: platform.knob_scope_kind % -> % rungs (production holds 11)', v_before, v_after;

  if v_after <> 11 then
    raise exception 'W3-HIST branch levelling: the branch holds % rungs after this file and production holds 11.', v_after
      using errcode = '23514',
            hint = 'A count that is not 11 means either a rung was already there under a different id (compare by kind) or the copy is incomplete. Neither is something to shrug at: a missing rung silently disarms every knob override written at it.';
  end if;
end;
$lvl$;
