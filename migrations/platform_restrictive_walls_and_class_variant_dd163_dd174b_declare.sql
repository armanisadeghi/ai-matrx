-- platform_restrictive_walls_and_class_variant_dd163_dd174b_declare
-- THE DECLARATIONS, AND THE BEFORE SNAPSHOT (DD-163 + DD-174, lane B-57. SECURITY.)
--
-- Nothing in this file changes a single policy. It writes down what each table IS, so that the
-- generation in the next file reads a registry that already says the right thing — a declaration
-- made AFTER a generation is a declaration the next regeneration quietly overturns (DD-159b).
--
-- ═══ DD-163: the restrictive staff wall, the five siblings B-46 censused ══════════════════════
-- A RESTRICTIVE policy ANDs. `platform_admin_only ... FOR ALL TO authenticated USING
-- (is_platform_admin())` therefore makes every permissive lane beside it dead text for every
-- signed-in person who is not AI Matrx staff. B-46 closed three SELECT-scoped walls; these are the
-- five `FOR ALL` ones. Measured on this database, impersonated, 2026-09-12 (counts are the rows
-- each identity reads TODAY -> the rows the same identity reads with the wall superseded):
--   runtime.global_execution_control  a real `has_access('global_execution', …, 'viewer')` lane
--                                     walled dead on 160,536 rows; only staff read it.
--   platform.share_links              the OWNER lane walled dead: developer111@pixelium.uk owns
--                                     179 share links and reads 0; seo@titaniumsuccess.com owns 10
--                                     and reads 0. B-46 found it; this is the measurement.
--   platform.org_module_config        `omc_read` (organization members) and `omc_write` (the
--                                     organization owner) both dead: 0 -> 1 / 1 / 2 for three real
--                                     members. An organization could not read its own module config.
--   platform.edge_payload_kind        `edge_payload_kind_read USING (true)` for anon AND
--                                     authenticated — but the wall is `TO authenticated`, so a
--                                     SIGNED-OUT visitor reads all 8 rows and a SIGNED-IN person
--                                     reads 0. 0 -> 8 for every signed-in identity.
--   billing.stripe_event              DELIBERATE and staying: raw Stripe webhook payloads. Declared
--                                     as such here, with the reason on the registry row.
--
-- ═══ DD-174: the five where the class and the variant disagreed ═══════════════════════════════
-- The generator half shipped in iam_ledger_lane_follows_the_class_dd174a.sql. These are the
-- registry-side corrections, each with the DATA that decided it:
--   billing_usage_ledger   `private` + `ledger` -> `private` + `personal`. Every one of its 2,184
--                          rows carries a NOT NULL user_id, so a usage ledger is not an
--                          organization's ledger, it is 2,184 people's private records.
--   retrieval_audit        `private` + `ledger` -> `private` + `personal`. Same: user_id never null
--                          on 646 rows. What a person searched for is personal.
--   knob_override_audit    `confidential` + `ledger` KEPT — the class was right and the variant is
--                          now right too (dd174a). It declares the staff lane closed here.
--   udt_document_snapshot  NOT GENERATED, and the reason is a different defect than the register
--   udt_workbook_snapshot  row assumed. Rehearsed live: generating the canonical `component` lane
--                          would have taken a NON-MEMBER from 74 to 101 document snapshots and an
--                          organization admin from 74 to 199. The cause is NOT this token's class
--                          or variant: `iam.accessible_entity_ids('udt_document','viewer')` returns
--                          13 document ids to an identity whose own RLS on workbench.udt_documents
--                          admits 2 (27 vs 1 for an organization admin, 9 vs 1 for a member,
--                          measured 2026-09-12). The component lane resolves its parent through the
--                          KERNEL while the parent's own policy is class-filtered, so EVERY
--                          component generated today can admit rows its parent would refuse. That
--                          is a platform-wide kernel finding, not a two-token registry edit, and it
--                          is written down here and reported rather than half-fixed.
set local lock_timeout = '4s';

-- ═════════════════════════════════════ 1. THE THREE TABLES THAT HAD NO REGISTRY ROW AT ALL
insert into platform.entity_types
  (token, schema_name, table_name, label, rls_variant, audit_class, is_component, is_versioned,
   has_soft_delete, data_class, data_class_reason, audit_class_reason, notes)
values
  ('global_execution_control', 'runtime', 'global_execution_control', 'Global execution control',
   'component', 'entity', true, false, false, null,
   null, null,
   'DD-163: the control row of a runtime.global_execution, one per root execution (PK root_execution_id). '
   || 'Registered as a COMPONENT so the class regime can see it; its class resolves through '
   || 'global_execution -> global_request. REGISTERED, NOT GENERATED: iam.apply_rls refuses it with '
   || '"column ""id"" does not exist" — the component lane''s direct-grant arms and iam.entity_read_expr '
   || 'both key on a uuid id column this table has never had. That is a base retrofit (DD-173), not an '
   || 'RLS edit. Its RESTRICTIVE platform_admin_only wall is superseded in the next file so the '
   || 'has_access viewer lane it was killing is live again.'),
  ('org_module_config', 'platform', 'org_module_config', 'Organization module configuration',
   'entity', 'entity', false, false, false, 'organization',
   'An organization''s own configuration of a module: who may add, what needs approval, the default '
   || 'visibility and permission. It is the organization''s row, readable by its members and writable '
   || 'by its owner — which is exactly what data_class organization means.', null,
   'DD-163: BESPOKE BY DESIGN and registered so the class regime can see it. The table is keyed '
   || '(organization_id, module_token) with no id and no created_by, so no generated variant fits and '
   || 'iam.apply_rls refuses it; omc_read (organization members) and omc_write (the organization owner) '
   || 'ARE its contract. A base retrofit is tracked under DD-173. Its RESTRICTIVE platform_admin_only '
   || 'wall, which made both of those policies dead text, is superseded in the next file.'),
  ('billing_stripe_event', 'billing', 'stripe_event', 'Stripe webhook event',
   'entity', 'machinery', false, false, false, 'confidential',
   'The raw payload Stripe sent us, stored verbatim for replay and reconciliation. It is the billing '
   || 'pipeline''s own input, not anybody''s content: no customer reads it and no organization owns it.',
   'The billing pipeline''s own input: the raw webhook body Stripe posted, consumed by the reconciler '
   || 'and by nothing a client can reach. iam.apply_rls refuses a machinery table by construction, '
   || 'which is the point — a generated policy over a pipeline input is a door nobody asked for.',
   'DD-163: THE RESTRICTIVE STAFF WALL HERE IS DELIBERATE AND STAYS. Of the five tables B-46 censused '
   || 'with a FOR ALL restrictive platform_admin_only policy, this is the one where the wall is the '
   || 'design rather than the defect — the table''s own permissive policy is literally named '
   || 'stripe_event_no_access. It is registered so that the wall is a DECLARED position with a reason '
   || 'on the row instead of an unregistered table nobody can see, and it is named in the '
   || 'check:staff-door residue set for the same reason. audit_class machinery: iam.apply_rls refuses '
   || 'it by construction, which is the sanctioned way to sit outside certification (db-rules §1).');

insert into platform.entity_relationships (parent_type, child_type, kind, fk_column)
values ('global_execution', 'global_execution_control', 'composition', 'root_execution_id');

-- ═══════════════ 1b. A MACHINERY TOKEN COULD NOT HAVE ITS CLASS CORRECTED AT ALL
-- `platform._entity_types_class_regenerates` regenerates a token's policies in the same commit its
-- data_class changes — right, and the reason a declaration can never drift from the policies. But
-- `iam.apply_rls` REFUSES an `audit_class = 'machinery'` token by construction, so on those tokens
-- the trigger turned every class correction into a hard error: `apply_rls: token
-- edge_payload_kind ... is access machinery; generic RLS is forbidden`. The registry entry for a
-- machinery table was therefore permanently whatever the first migration guessed, which is how
-- platform.edge_payload_kind — a catalogue anon reads in full — has been sitting in the registry
-- classed `confidential`. The trigger already has four such carve-outs (component, ledger, inactive,
-- provisioner window); this is the fifth, and it says out loud that the policies were not
-- regenerated and why, because a carve-out that is silent is how a declaration drifts.
create or replace function platform._entity_types_class_regenerates()
returns trigger language plpgsql as $fn$
begin
  if new.data_class is not distinct from old.data_class then return new; end if;
  if new.rls_variant in ('component','ledger') then return new; end if;
  if not new.is_active then return new; end if;
  if to_regclass(format('%I.%I', new.schema_name, new.table_name)) is null then return new; end if;
  -- A regeneration inside the provisioner's own window would be a second one on a table it is
  -- still building; create_entity_table calls apply_rls itself, right after.
  if coalesce(current_setting('matrx.provisioner', true), '') = '1' then return new; end if;
  -- DD-163 (2026-09-12): iam.apply_rls refuses machinery by construction, so regenerating here is
  -- not something this trigger can do — and raising instead meant a machinery token's class could
  -- never be corrected. Say so; never pretend the policies moved.
  if new.audit_class = 'machinery' then
    raise notice 'DD-163: % changed class % -> %, and its policies were NOT regenerated: audit_class is machinery and iam.apply_rls refuses machinery by construction (db-rules §1). The class regime now SEES this table correctly; its policies remain the bespoke set its own feature wrote.',
      new.token, old.data_class, new.data_class;
    return new;
  end if;

  raise notice 'DD-137b: % changed class %s -> %s; regenerating its policies in this commit',
    new.token, old.data_class, new.data_class;
  perform iam.apply_rls(new.schema_name, new.table_name, new.token, new.rls_variant);
  return new;
end
$fn$;

-- ═══════════════════════════════ 2. THE CLASS CORRECTION: a published catalogue is not confidential
-- DD-159 batch 3 classified platform.edge_payload_kind `confidential` from the machinery boilerplate.
-- The table is 8 rows of kind / version / json_schema describing edge payload shapes, its own policy
-- reads `USING (true)` for anon AND authenticated, and anon reads all 8 of them today. A catalogue
-- that a signed-out visitor may read is `public`; calling it confidential while it is world-readable
-- is the registry telling a story the policies contradict.
update platform.entity_types
   set data_class = 'public',
       data_class_reason = 'DD-163: a published catalogue of edge payload kinds — kind, version, '
         || 'description, json_schema. No person, organization or customer content is in it, its own '
         || 'policy grants SELECT on true to anon and authenticated, and anon reads all 8 rows today. '
         || 'It was classed confidential by DD-159 batch 3''s machinery boilerplate, which described '
         || 'the audit_class and not the contents. audit_class stays machinery: iam.apply_rls still '
         || 'refuses to generate over a table the access kernel reads.'
 where token = 'edge_payload_kind';

-- ═══════════════════════════════ 3. DD-174: the two private ledgers become what they are
update platform.entity_types
   set rls_variant = 'personal',
       suppress_platform_admin_lane = true,
       notes = coalesce(notes,'') || ' DD-174 (2026-09-12): rls_variant ledger -> personal. The class '
         || 'is private and private has no organization lane, but the ledger variant emitted an '
         || 'organization read lane and nothing else — rehearsed live, an organization admin would '
         || 'have read 1,520 rows of other people''s spend and a non-member 313. All 2,184 rows carry '
         || 'a NOT NULL user_id, so the row''s user_id IS its complete access boundary (db-rules §6d). '
         || 'suppress_platform_admin_lane declared in the same edit because private closes the staff '
         || 'lane too.'
 where token = 'billing_usage_ledger';

update platform.entity_types
   set rls_variant = 'personal',
       suppress_platform_admin_lane = true,
       notes = coalesce(notes,'') || ' DD-174 (2026-09-12): rls_variant ledger -> personal. Same '
         || 'disagreement as billing_usage_ledger: class private, ledger variant emitting an '
         || 'organization lane. What a person searched for and what came back is personal, user_id is '
         || 'NOT NULL on all 646 rows, and the organization lane was publishing one person''s queries '
         || 'to everybody in their organization (measured: an organization admin read 178 rows, a '
         || 'member 43 and a NON-MEMBER 49, none of them theirs).'
 where token = 'retrieval_audit';

-- ═══════════════════════════════ 4. DD-174: the confidential audit declares its closed staff lane
update platform.entity_types
   set suppress_platform_admin_lane = true,
       notes = coalesce(notes,'') || ' DD-174 (2026-09-12): class confidential and variant ledger are '
         || 'BOTH right; what was wrong was the ledger variant''s unconditional global-readable '
         || 'system-org arm, fixed at the class in iam_ledger_lane_follows_the_class_dd174a.sql. 27 of '
         || 'this table''s 88 rows belong to a global_readable system organization and that arm handed '
         || 'them to every signed-in account (measured: three principals 0 -> 27, a non-member '
         || '17 -> 44). suppress_platform_admin_lane declared here because confidential closes the '
         || 'staff lane.'
 where token = 'knob_override_audit';

-- ═══════════════════════════════ 5. DD-163: the share link declares its closed staff lane
update platform.entity_types
   set suppress_platform_admin_lane = true,
       notes = coalesce(notes,'') || ' DD-163 (2026-09-12): class confidential closes the platform-staff '
         || 'lane, declared here before the generation in the next file. B-48''s "do NOT run '
         || 'iam.apply_rls on it" was written to protect the anonymous link-resolution door — and that '
         || 'door is public.resolve_share_token, a SECURITY DEFINER function anon may EXECUTE. There is '
         || 'no anon POLICY and no anon grant on this table: an anonymous session reads 0 rows before '
         || 'and after, by grant rather than by policy, so RLS generation cannot reach the door. '
         || 'Proven in the gate file with a real anonymous call to the resolver.'
 where token = 'platform_share_link';

-- ═══════════════════════════════ 6. DD-174: the two snapshots, ruled and NOT generated
update platform.entity_types
   set notes = coalesce(notes,'') || ' DD-174 (2026-09-12) — RULED, NOT GENERATED. Generating the '
         || 'canonical component lane was rehearsed live and REFUSED by this lane: a non-member would '
         || 'have gone from 74 to 101 document snapshots and an organization admin from 74 to 199 '
         || '(workbook snapshots: 0 -> 37 for that admin, 0 -> 1 for the non-member). The cause is not '
         || 'this token''s class or variant. iam.accessible_entity_ids(parent, ''viewer'') returns 13 '
         || 'udt_document ids to an identity whose own RLS on workbench.udt_documents admits 2 (27 vs 1 '
         || 'for an organization admin, 9 vs 1 for a member). The component lane resolves its parent '
         || 'through the KERNEL while the parent''s own policy is class-filtered, so a component can '
         || 'admit rows its parent refuses — platform-wide, not two tokens. The hand-written policy '
         || 'this table carries today admits exactly the parent-backed set and stays until that is fixed.'
 where token in ('udt_document_snapshot', 'udt_workbook_snapshot');

-- ═════════════════════════════════════════════════════════ 7. THE BEFORE SNAPSHOT
-- 🚨 runtime.global_execution_control is NOT in this cast, and the omission is deliberate and
-- measured rather than convenient. iam.access_delta_snapshot has no id column to hash there, so it
-- falls back to string_agg over the WHOLE table — 160,536 rows behind a per-row
-- iam.has_access lane, which is the D254 shape: a rehearsal of it ran past 200 seconds per
-- principal and was killed. Its lane is proven in the gate file the way a client actually reads it,
-- one control row by its root_execution_id, with real identities. A cast entry that times out is
-- not evidence.
do $$
declare
  v_before uuid; v_as timestamptz := now();
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',  -- platform admin, arman26@gmail.com (super_admin)
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- platform admin, info@aimatrx.com
    '87a6e699-3622-4869-8843-d0867456c0dd',  -- platform admin AND a real owner on these tables (admin@admin.com)
    'a4955b5c-d524-4d72-a90e-0658d5d51148',  -- developer111@pixelium.uk: a NON-admin who owns 179 share links. The widening witness.
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com: a plain member who owns 10 share links
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: an organization admin, NOT a platform admin
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
  v_tokens text[] := array[
    'platform_share_link', 'org_module_config', 'edge_payload_kind', 'billing_stripe_event',
    'billing_usage_ledger', 'retrieval_audit', 'knob_override_audit',
    'udt_document_snapshot', 'udt_workbook_snapshot'];
begin
  if (select count(*) from iam.access_delta_run where label = 'DD-163/174 BEFORE') > 0 then
    raise notice 'b57: the baseline is already on record';
    return;
  end if;
  v_before := iam.access_delta_snapshot('DD-163/174 BEFORE', v_principals, v_tokens, 400000,
    'B-57: the four restrictive FOR ALL staff walls, the declared-deliberate fifth, and the five class/variant disagreements', v_as);
  raise notice 'b57: baseline % over % tokens x % principals, pinned at %',
    v_before, cardinality(v_tokens), cardinality(v_principals), v_as;
end $$;
