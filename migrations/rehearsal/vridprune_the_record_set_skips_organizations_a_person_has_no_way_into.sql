-- vridprune_the_record_set_skips_organizations_a_person_has_no_way_into
-- target: clone
-- based-on: custom.visible_record_ids(uuid, permission_level) a99682186e83ae0581e5708b4d9cfe5f9c2af9f7c17b8a10a4289aeab8c6d5b1
--
-- 🚨 WHERE THIS FILE LIVES, AND WHY. migrations/rehearsal/ is scanned by no release path, so no
-- sweep can apply it; `-- target: clone` lets it be rehearsed on the dev clone only. TO SHIP IT
-- (the owner's step): `git mv` it to migrations/, DELETE the `-- target: clone` line (a file with
-- no target line is production-only; no additive/guard line is needed or wanted — the only knob
-- that fits, custom/accessible_entity_ids_guard, is already ON, and the runner refuses a guarded
-- file whose knob is on), then `pnpm db:apply migrations/<this file>`. It carries a NEW basename on purpose: its first copy,
-- migrations/vridprune_a_person_is_asked_only_about_organizations_they_have_a_way_into.sql, has a
-- production ledger row (2026-09-26 00:15:15Z, duration_ms 0, checksum 373f5506…) although its
-- body was never applied — production's custom.visible_record_ids still hashes a99682186e83….
--
-- WHAT. custom.visible_record_ids(person, level) — the set `iam.accessible_entity_ids('record', …)`
-- answers while `custom/accessible_entity_ids_guard` is on (true since 2026-09-20 02:18:20Z) —
-- asks the read door's full per-pair machinery (custom.visible_predicate_sql → custom.visible_set,
-- several ladder walks) for EVERY (organization, Table) pair on the database: 1,524 pairs on
-- production, ~21-26 ms each, whoever the person is. Measured on production 2026-09-26 as the
-- person: a one-organization member 41.6 s, a member of the largest organization 44.1 s,
-- admin@admin.com 25.7 s. No signed-in door reaches it (authenticated has no SELECT on
-- custom.record and custom.query_access_ids is not executable by it); its callers are the store
-- censuses — custom.shared_only_disagreements ran 25 times on production after the 14:38Z reboot
-- on 2026-09-25, 5,530 s in total, mean 221 s, max 365 s.
--
-- THE FIX. The same loop, over only the organizations in which some row could possibly be
-- visible to the person: her memberships, the system organizations, and any organization holding
-- a row she created, a `public` row, a row named by a grant that could reach her, or a row joined
-- by a carrying edge to anything outside that organization. The proof that a skipped pair's answer
-- was empty is written in the body, arm by arm. Nothing else changes: same signature, security,
-- search_path, grants and per-pair predicate; no table, index, policy or knob is touched.
--
-- PROOF (dev clone jxhgzalwckuarngvsdyq, 2026-09-26; its visible_record_ids, visible_set,
--   visible_predicate_sql, has_visibility, has_access_for_base x3, has_org_access_for and the rest
--   of the ladder hash identically to production's): identical id sets, old body vs this body, for
--   21 (person, level) cases — 0 lost, 0 gained — covering admin@admin.com, test@test.com, a
--   one-organization member, a member of the largest organization, two super admins, record
--   grantees, people in no organization, recent sign-ins, the members of the most organizations,
--   and editor/admin levels. Timing, sequential, same clone: one-organization member 33.5 s -> 3.0 s,
--   largest-organization member 32.8 s -> 2.9 s, test@test.com 29.9 s -> 13.6 s,
--   admin@admin.com 19.3 s -> 18.3 s (a member of 141 organizations: the prune removes little).
--   Guard, red then green: scripts/campaign-tests/vridprune_red.sql / vridprune_green.sql.
-- INVERSE: migrations/inverse/vridprune_the_record_set_skips_organizations_a_person_has_no_way_into_down.sql

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION custom.visible_record_ids(p_user_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pair record;
  v_pred text;
  -- VRID-PRUNE (2026-09-26): the organizations in which some row could possibly be visible to
  -- this person. Every other organization is skipped WITHOUT asking the read door about it,
  -- because the read door's answer there is provably empty (see the proof below).
  v_orgs uuid[];
begin
  -- NO PRINCIPAL, NO SET. The old body said this with `p_user_id is not null` inside the WHERE;
  -- saying it here keeps `custom.visible_predicate_sql`'s own no-principal arm (which judges the
  -- campaign's maintenance connection by its ROLE) out of a function whose whole job is to
  -- answer for a PERSON.
  if p_user_id is null then
    return;
  end if;

  -- 🚨 VRID-PRUNE (2026-09-26) — ONLY THE ORGANIZATIONS THIS PERSON HAS A WAY INTO.
  --
  -- THE DEFECT. This function asked `custom.visible_predicate_sql` — a full `custom.visible_set`,
  -- about five ladder walks — for EVERY (organization, Table) pair on the database: 1,524 pairs on
  -- production, ~21 ms each, 25-38 s for ONE person (measured live 2026-09-25 as admin@admin.com,
  -- test@test.com and a one-organization member). It is what `iam.accessible_entity_ids('record')`
  -- answers while `custom/accessible_entity_ids_guard` is on, and `custom.shared_only_disagreements`
  -- asks it once per member: 218 of that census's 249 s on the clone were spent here.
  --
  -- THE PRUNE, AND WHY IT CANNOT CHANGE AN ANSWER. It only ever REMOVES an organization O, and only
  -- when every one of these holds — each is a conjunct of "no arm of the one ladder can admit a row
  -- of O for this person":
  --   (a) O is not an organization the person is a member of (iam.organization_member — the only
  --       source the member lane, the admin lane, member_lane_confers and has_org_access_for read);
  --   (b) O is not a system organization (the global-readable and super-admin lanes read only those);
  --   (c) no row of O — live or deleted — was created by the person (ownership: iam.owner_of and
  --       platform.partitioned_row_attrs both read custom.record.created_by) or is `public`;
  --   (d) no row of O is named by a grant that could reach the person: an iam.permissions row
  --       granted to the person, to an organization the person is in, or public (any status, any
  --       expiry — wider than the ladder asks); an iam.memberships row of the person (any container
  --       type and status: the record-membership and scope-membership arms); ANY
  --       platform.entity_grants row (the library lanes, every audience);
  --   (e) no carrying edge leaves O: no platform.associations row (live or deleted, ANY type or
  --       role — wider than association_types / carrying_rule / the portal arm / the edu
  --       assignment arm) joins a row of O to anything that is not a row of O, and no
  --       platform.reachability row carries a row of O from anything that is not a row of O.
  -- Under (e) every ancestor the ladder can walk to from a row of O — `custom.visibility_ancestors`
  -- (associations, the Table edge, which is same-organization by its own join, the portal edge),
  -- `iam.has_access_for_base`'s reachability frontier, arm 3b's containment parent (same
  -- organization by its own predicate) and `custom.scope_member_reaches`' carriers — is itself a
  -- row of O, so it too is judged by (a)-(d) alone, and (a)-(d) say no to every row of O. Arm 4
  -- (a Table is known when a record inside it is visible) reads rows of the same O. Hence every
  -- per-row ladder call about a row of O is false, `custom.visible_set` finds no visible class, no
  -- visible grant and no carried row, and the pair's predicate admits only `created_by = person`
  -- rows — of which (c) says there are none. The skipped pair's answer was empty.
  --
  -- A NEW LANE MUST WIDEN THIS LIST. A ladder arm that admits a person to a row by something other
  -- than membership, a system organization, ownership, `public`, a grant row or a carrying edge
  -- would make this prune refuse that person silently. The guard that says so out loud is
  -- scripts/campaign-tests/vridprune_red.sql / vridprune_green.sql (the pruned set against the full walk).
  select coalesce(array_agg(o.org), '{}'::uuid[]) into v_orgs
    from (
      select om.organization_id as org
        from iam.organization_member om
       where om.user_id = p_user_id
      union
      select so.organization_id from iam.system_orgs so
      union
      select r.organization_id
        from custom.record r
       where r.created_by = p_user_id or r.visibility = 'public'::platform.visibility
      union
      select r.organization_id
        from iam.permissions p
        join custom.record r on r.id = p.resource_id
       where p.granted_to_user_id = p_user_id
          or coalesce(p.is_public, false)
          or p.granted_to_organization_id in (select om.organization_id
                                                from iam.organization_member om
                                               where om.user_id = p_user_id)
      union
      select r.organization_id
        from iam.memberships m
        join custom.record r on r.id = m.container_id
       where m.user_id = p_user_id
      union
      select r.organization_id
        from platform.entity_grants g
        join custom.record r on r.id = g.entity_id
      union
      select rs.organization_id
        from platform.associations a
        join custom.record rs on rs.id = a.source_id
       where a.source_type = 'record'
         and not exists (select 1 from custom.record rt
                          where a.target_type = 'record' and rt.id = a.target_id
                            and rt.organization_id = rs.organization_id)
      union
      select rt.organization_id
        from platform.associations a
        join custom.record rt on rt.id = a.target_id
       where a.target_type = 'record'
         and not exists (select 1 from custom.record rs
                          where a.source_type = 'record' and rs.id = a.source_id
                            and rs.organization_id = rt.organization_id)
      union
      select ri.organization_id
        from platform.reachability x
        join custom.record ri on ri.id = x.item_id
       where x.item_type = 'record'
         and not exists (select 1 from custom.record rc
                          where x.container_type = 'record' and rc.id = x.container_id
                            and rc.organization_id = ri.organization_id)
    ) o
   where o.org is not null;

  -- ONE PAIR AT A TIME, AND THE PAIRS ARE THE STORE'S OWN. A record lives in exactly one
  -- (organization, Table), so these groups partition the live rows: no row is asked about twice
  -- and none is missed. `table_id` may be null — `is not distinct from` is what keeps those rows
  -- in their own group rather than dropping them, and `custom.visible_set` says of that group
  -- that it cannot answer set-based, which puts the per-row ladder back for exactly those rows.
  -- A row with no organization is never pruned (VRID-PRUNE reasons about organizations only).
  for v_pair in
    select r.organization_id as org, r.table_id as tbl
      from custom.record r
     where r.deleted_at is null
       and (r.organization_id is null or r.organization_id = any (v_orgs))
     group by r.organization_id, r.table_id
  loop
    -- THE READ DOOR'S OWN PREDICATE, BUILT THE WAY THE READ DOOR BUILDS IT. This is the whole
    -- point of the file: the set form and this function cannot drift, because there is only one
    -- of them. `custom.visible_predicate_sql` emits `true` when the whole pair is visible, the
    -- four-arm set expression when it is not, and the per-row ladder verbatim when
    -- `custom.visible_set` declines.
    v_pred := custom.visible_predicate_sql(p_user_id, v_pair.org, v_pair.tbl, p_required, 'r');

    return query execute format(
      'select r.id from custom.record r'
      || ' where r.organization_id = %L::uuid'
      || '   and r.table_id is not distinct from %L::uuid'
      || '   and r.deleted_at is null'
      || '   and (%s)',
      v_pair.org, v_pair.tbl, v_pred);
  end loop;

  return;
end;
$function$;
