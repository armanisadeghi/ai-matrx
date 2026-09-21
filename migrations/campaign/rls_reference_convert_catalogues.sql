-- lane: RLS-REFERENCE
--
-- ══ THE FIVE CATALOGUES, CONVERTED THROUGH THE CANONICAL ROUTE ════════════════════════════════
--
-- These five tables are the live members of the class `rls_variant='reference'` was built for
-- (migrations/campaign/rls_reference_variant.sql): registered, org-less, owner-less, with no
-- per-row visibility, read by every signed-in member and written only by the server. Each ran one
-- of the two shapes that class produced before the variant existed:
--
--   workbench.schema_templates        RLS OFF + `authenticated: SELECT` -- the GRANT was the whole
--                                     security model, and the single finding of `check:rls-on`
--                                     ARM A. Writes already go through
--                                     public.admin_{create,update,delete}_schema_template (B-8).
--   context.template_context_items    hand-written `template_ci_select USING (true)`
--   context.template_scope_types      hand-written `template_st_select USING (true)`
--   platform.masterwork_run_kind      hand-written `masterwork_run_kind_read_authenticated USING (true)`
--   research.research_intent          a `std_select USING (true)` wearing a GENERATED name, which
--                                     is worse: it reads as certified output and is not.
--
-- THE ROUTE, AND IT IS THE ONLY ROUTE. Nothing here writes a policy or a grant. Each table's
-- hand-written policy is retired by name through `iam.supersede_bespoke_policies` (which demands a
-- 60-character reason), and then ONE registry UPDATE changes the variant and the class --
-- `platform._entity_types_class_regenerates` calls `iam.apply_rls` inside this same commit, and
-- `iam.apply_table_grants` withdraws the client write grant three of them carried. The generated
-- names (`std_select`, `platform_admin_all`) are dropped by that regeneration, which is why they
-- are not named to the supersede helper -- it refuses them on purpose.
--
-- WHAT EACH TABLE GAINS: RLS ON, one certified read lane (`ref_all_members_read`), and a
-- read-only client grant. WHAT NOBODY LOSES: every read that worked before still works -- the
-- predicate was already `true` for `authenticated` on four of them and there was no RLS at all on
-- the fifth. The three that carried `authenticated: arwd` lose an INSERT/UPDATE/DELETE PRIVILEGE
-- that no policy ever admitted a non-admin through and that no client code in either repo uses
-- (grepped: every hit in matrx-frontend and aidream is a read or a type). The platform-admin write
-- lane on the three that had `platform_admin_all` goes with it -- on a catalogue whose rows are
-- seeded by server code (aidream/startup/masterwork_run_kinds.py) or written by a declared door,
-- a staff client-write lane is the door this variant exists to force.
--
-- THE CLASS MOVES private -> organization, and that is a correction, not a widening. `private` was
-- a birth-derived description ("Born unclassified and derived by platform.derive_data_class"), and
-- it was never true of a table every signed-in member could already read. `organization` grants no
-- anonymous lane (`iam.class_lanes.anon_lane` is false for it), so no signed-out reader gains
-- anything; the reference lane's predicate is `true` for `authenticated` either way.

-- ── 1. retire the hand-written reads, by name, with a reason ─────────────────────────────────
select iam.supersede_bespoke_policies('context','template_context_items',
  array['template_ci_select'],
  'A hand-written FOR SELECT TO authenticated USING (true) on a global context-template catalogue. db-rules §6d forbids hand-written policies outright, so iam.verify_canonical reported it as bespoke drift for as long as it existed. The identical lane is now GENERATED as ref_all_members_read by iam.apply_rls(...,''reference''), where the certifier can read it.');

select iam.supersede_bespoke_policies('context','template_scope_types',
  array['template_st_select'],
  'A hand-written FOR SELECT TO authenticated USING (true) on a global scope-type catalogue. db-rules §6d forbids hand-written policies outright, so iam.verify_canonical reported it as bespoke drift for as long as it existed. The identical lane is now GENERATED as ref_all_members_read by iam.apply_rls(...,''reference''), where the certifier can read it.');

select iam.supersede_bespoke_policies('platform','masterwork_run_kind',
  array['masterwork_run_kind_read_authenticated'],
  'A hand-written FOR SELECT TO authenticated USING (true) on the seeded masterwork run-kind vocabulary (aidream/startup/masterwork_run_kinds.py owns the rows). db-rules §6d forbids hand-written policies outright; the identical lane is now GENERATED as ref_all_members_read by iam.apply_rls(...,''reference'').');

-- ── 2. one registry UPDATE per table: the variant, the class, and the scope that follows ─────
-- platform._entity_types_class_regenerates fires on the data_class change and runs iam.apply_rls
-- inside this commit; platform._entity_types_classify_default nulls the list scope for the
-- variant. Nothing below writes a policy or a grant by hand.
update platform.entity_types set
  rls_variant = 'reference',
  data_class = 'organization',
  data_class_reason = 'A platform-shipped catalogue of user-table schema templates: 5 rows, no organization_id, no owner, no visibility column. Every signed-in member reads all of it (utils/user-table-utls/template-utils.ts) and only public.admin_{create,update,delete}_schema_template writes it (B-8 / DD-033). `organization` is the class that describes that -- `private` was a birth-derived description of a table that was never private, and `public` would invite a signed-out reader nobody serves. Lane RLS-REFERENCE, 2026-09-21.',
  default_list_scope = null,
  type_reason = 'rls_variant=reference: an org-less, owner-less, visibility-less catalogue. RLS on, one generated read lane open to every member, writes through the admin_*_schema_template doors.'
where token = 'schema_templates';

update platform.entity_types set
  rls_variant = 'reference',
  data_class = 'organization',
  data_class_reason = 'The global catalogue of context-template items every scope type is built from. No organization_id, no owner, no visibility column; read by every signed-in member through features/scopes/service/scopesService.ts and seeded server-side. `organization` describes a members-only catalogue; `private` was a birth-derived description that was never true of a table with a USING (true) read. Lane RLS-REFERENCE, 2026-09-21.',
  default_list_scope = null
where token = 'template_context_items';

update platform.entity_types set
  rls_variant = 'reference',
  data_class = 'organization',
  data_class_reason = 'The global catalogue of context scope TYPES. No organization_id, no owner, no visibility column; read by every signed-in member through features/scopes/service/scopesService.ts and seeded server-side. `organization` describes a members-only catalogue; `private` was a birth-derived description that was never true of a table with a USING (true) read. Lane RLS-REFERENCE, 2026-09-21.',
  default_list_scope = null
where token = 'template_scope_types';

update platform.entity_types set
  rls_variant = 'reference',
  data_class = 'organization',
  data_class_reason = 'The masterwork run-kind vocabulary, seeded on every boot from masterwork_runs.TERMINAL_TYPES (aidream/startup/masterwork_run_kinds.py, migration 0727) and pointed at by a foreign key on platform.masterwork_run.operation. The code owns the rows; every signed-in member may read the vocabulary. Lane RLS-REFERENCE, 2026-09-21.',
  default_list_scope = null
where token = 'masterwork_run_kind';

update platform.entity_types set
  rls_variant = 'reference',
  data_class = 'organization',
  data_class_reason = 'The fixed research-intent catalogue (~18 rows) that rs_topic.intent_key points at. No organization_id, no owner, no visibility column; read by every signed-in member (features/research/service.ts, features/research/service/server.ts) and seeded by migration. Lane RLS-REFERENCE, 2026-09-21.',
  default_list_scope = null
where token = 'research_intent';

-- ── 3. the end state is ASSERTED here, in the same transaction that made it ──────────────────
-- A migration that reports success in prose and leaves the table half-converted is the failure
-- mode this whole campaign exists to close. If any clause below is false, nothing lands.
do $verify$
declare
  r record; v_bad text := NULL;
  c_tokens constant text[] := array['schema_templates','template_context_items','template_scope_types','masterwork_run_kind','research_intent'];
begin
  for r in
    select et.token, et.schema_name, et.table_name, et.rls_variant, et.data_class::text as dc,
           et.default_list_scope, c.oid as rel, c.relrowsecurity as rls,
           (select array_agg(p.polname::text order by p.polname) from pg_policy p where p.polrelid=c.oid) as pols
      from platform.entity_types et
      join pg_class c on c.oid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
     where et.token = any (c_tokens)
     order by et.token
  loop
    if r.rls_variant <> 'reference' then v_bad := coalesce(v_bad||'; ','')||r.token||' variant='||r.rls_variant; end if;
    if r.dc <> 'organization' then v_bad := coalesce(v_bad||'; ','')||r.token||' class='||r.dc; end if;
    if r.default_list_scope is not null then v_bad := coalesce(v_bad||'; ','')||r.token||' list_scope is not null'; end if;
    if not r.rls then v_bad := coalesce(v_bad||'; ','')||r.token||' RLS still OFF'; end if;
    if r.pols is distinct from array['ref_all_members_read','svc_all'] then
      v_bad := coalesce(v_bad||'; ','')||r.token||' policies='||coalesce(array_to_string(r.pols,','),'(none)');
    end if;
    if has_table_privilege('authenticated', r.rel, 'INSERT')
       or has_table_privilege('authenticated', r.rel, 'UPDATE')
       or has_table_privilege('authenticated', r.rel, 'DELETE') then
      v_bad := coalesce(v_bad||'; ','')||r.token||' authenticated still holds a write privilege';
    end if;
    if not has_table_privilege('authenticated', r.rel, 'SELECT') then
      v_bad := coalesce(v_bad||'; ','')||r.token||' authenticated LOST its read -- every reader of this catalogue would break';
    end if;
    if has_any_column_privilege('anon', r.rel, 'SELECT') then
      v_bad := coalesce(v_bad||'; ','')||r.token||' anon holds a key to a members-only catalogue';
    end if;
  end loop;
  if v_bad is not null then
    raise exception 'rls-reference conversion did not reach the intended state: %', v_bad;
  end if;
  raise notice 'rls-reference: 5 catalogues converted -- RLS on, ref_all_members_read + svc_all only, read-only client grant, no anon key';
end
$verify$;

-- ── 4. and the certifier agrees, measured rather than asserted ───────────────────────────────
do $certify$
declare r record; v_bad text := NULL;
begin
  for r in
    select et.token, v.check_name, v.status, v.detail
      from platform.entity_types et
      cross join lateral iam.verify_canonical(et.schema_name, et.table_name, et.token) v
     where et.token in ('schema_templates','template_context_items','template_scope_types','masterwork_run_kind','research_intent')
       and v.status = 'FAIL'
       and v.check_name in ('rls_enabled','policies_canonical','bespoke_policy_present',
                            'reference_open_read','reference_no_client_write',
                            'reference_has_no_scope_columns','pub_read_anon',
                            'class_lanes_match_policy','data_class_set','data_class_derivations',
                            'default_list_scope_set','visibility','system_org_arm_respects_class')
     order by et.token, v.check_name
  loop
    v_bad := coalesce(v_bad||' | ','')||format('%s/%s: %s', r.token, r.check_name, left(coalesce(r.detail,''),120));
  end loop;
  if v_bad is not null then
    raise exception 'rls-reference: iam.verify_canonical still reports access drift on a converted catalogue -- %', v_bad;
  end if;
  raise notice 'rls-reference: iam.verify_canonical reports no access/policy drift on any of the 5';
end
$certify$;
