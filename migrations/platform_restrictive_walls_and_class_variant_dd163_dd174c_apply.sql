-- platform_restrictive_walls_and_class_variant_dd163_dd174c_apply
-- THE FOUR WALLS COME DOWN AND THE FOUR TOKENS ARE GENERATED (DD-163 + DD-174, lane B-57. SECURITY.)
--
-- Every drop here is named, reasoned and recorded in `iam.superseded_policy` (DD-147). Nothing
-- drops a policy nobody enumerated, and the enumeration is RE-READ before any drop: any difference
-- from the census this file was written against aborts the whole file, naming both sides. A census
-- taken at 21:40 and applied at 21:55 is a guess unless something re-reads it.
--
-- WHAT IS KEPT, ON PURPOSE. `billing.usage_ledger` and `rag.retrieval_audit` each carry three
-- RESTRICTIVE command-scoped write walls (`platform_admin_{insert,update,delete}_only`). They are
-- the "the server writes this ledger" wall and they stay: superseding them would let a person
-- INSERT their own usage rows, which is a widening on the write axis nobody asked for. They touch
-- no SELECT. `platform.share_links` keeps `share_links_svc_all` (service_role). DD-147 keeps them
-- and names them at apply time; that notice is the record.
set local lock_timeout = '4s';

do $$
declare
  r record;
  v_live text[];
  v_missing text[];
  v_extra text[];
  n integer := 0;
begin
  for r in
    select * from (values
      -- table                              , token                     , variant , the bespoke policies ON the table now                                                                                  , the ones this file supersedes                                                        , generate?
      ('runtime','global_execution_control','global_execution_control','component',
        array['platform_admin_only'],
        array['platform_admin_only'], false),
      ('platform','org_module_config','org_module_config','entity',
        array['omc_read','omc_service','omc_write','platform_admin_only'],
        array['platform_admin_only'], false),
      ('platform','edge_payload_kind','edge_payload_kind','system',
        array['edge_payload_kind_read','platform_admin_only'],
        array['platform_admin_only'], false),
      ('platform','share_links','platform_share_link','entity',
        array['platform_admin_only','share_links_owner_all','share_links_svc_all'],
        array['platform_admin_only','share_links_owner_all'], true),
      ('billing','usage_ledger','billing_usage_ledger','personal',
        array['platform_admin_delete_only','platform_admin_insert_only','platform_admin_update_only','usage_no_write','usage_self'],
        array['usage_no_write','usage_self'], true),
      ('rag','retrieval_audit','retrieval_audit','personal',
        array['platform_admin_delete_only','platform_admin_insert_only','platform_admin_update_only','retrieval_audit_org_member_select','retrieval_audit_self_select'],
        array['retrieval_audit_org_member_select','retrieval_audit_self_select'], true),
      ('platform','knob_override_audit','knob_override_audit','ledger',
        array['knob_override_audit_read'],
        array['knob_override_audit_read'], true)
    ) as t(sch, tbl, token, variant, census, supersede, generate)
    order by t.sch, t.tbl
  loop
    if to_regclass(format('%I.%I', r.sch, r.tbl)) is null then
      raise exception 'b57: %.% does not exist', r.sch, r.tbl;
    end if;
    select coalesce(array_agg(p.polname order by p.polname), '{}') into v_live
      from pg_policy p
     where p.polrelid = format('%I.%I', r.sch, r.tbl)::regclass
       and not (p.polname = any (iam.generated_policy_names()));
    v_missing := array(select unnest(r.census::text[]) except select unnest(v_live));
    v_extra   := array(select unnest(v_live) except select unnest(r.census::text[]));
    if v_missing <> '{}' or v_extra <> '{}' then
      raise exception
        'b57: the bespoke policy set on %.% is not what this file was written against. Declared but absent: %. Present but undeclared: %. Nothing was dropped. Re-census and re-write this file rather than guessing.',
        r.sch, r.tbl, array_to_string(v_missing, ', '), array_to_string(v_extra, ', ');
    end if;

    perform iam.supersede_bespoke_policies(r.sch, r.tbl, r.supersede::text[],
      case
        when r.token = 'global_execution_control' then
          'DD-163: platform_admin_only was a RESTRICTIVE FOR ALL policy, so it ANDed with std_select and killed the only non-staff read lane this table has — iam.has_access(''global_execution'', root_execution_id, ''viewer''), on 160,536 rows. Measured 2026-09-12: three platform admins read all 160,536 and every other identity read 0. The lane it was hiding is the one the runtime feature wrote; nothing replaces the wall because writes stay admin-only through platform_admin_all.'
        when r.token = 'org_module_config' then
          'DD-163: platform_admin_only was a RESTRICTIVE FOR ALL policy, so it ANDed with omc_read and omc_write and left an organization unable to read or write its OWN module configuration. Measured 2026-09-12: three real organization members each read 0 of their own rows. omc_read (members) and omc_write (the organization owner) are this table''s contract and now do their job; no variant can be generated here because the table has no id and no created_by.'
        when r.token = 'edge_payload_kind' then
          'DD-163: platform_admin_only was a RESTRICTIVE FOR ALL policy TO authenticated, so it ANDed with edge_payload_kind_read USING (true) and produced the exact inversion of the intent: a SIGNED-OUT visitor read all 8 catalogue rows and every SIGNED-IN person read 0. Writes stay with platform_admin_all. The token is now classed public, which is what a catalogue anon may read has always been.'
        when r.token = 'platform_share_link' then
          'DD-163: platform_admin_only was a RESTRICTIVE FOR ALL policy that ANDed share_links_owner_all to false, so nobody could see their own share links — developer111@pixelium.uk owns 179 and read 0, seo@titaniumsuccess.com owns 10 and read 0 (measured 2026-09-12). share_links_owner_all is superseded in the same breath because the generated entity lane set for the confidential class carries the owner lane and the sharing lanes; kept, the two would OR and leave the table wider than either regime intended.'
        when r.token = 'billing_usage_ledger' then
          'DD-174: usage_self and usage_no_write are the hand-written pair the personal variant now emits properly — std_select on user_id = auth.uid(), with the three RESTRICTIVE write walls beside them untouched. Superseded rather than kept because a permissive duplicate ORs with the generated set and makes the emitted contract unreadable.'
        when r.token = 'retrieval_audit' then
          'DD-174: retrieval_audit_org_member_select published one person''s search queries to everybody in their organization — an organization admin read 178 rows, a plain member 43 and a NON-MEMBER 49, none of them their own. The class is private and private has no organization lane. retrieval_audit_self_select is superseded with it because the personal variant emits exactly that lane. The three RESTRICTIVE write walls stay.'
        when r.token = 'knob_override_audit' then
          'DD-174: knob_override_audit_read is superseded by the generated ledger lane, which after iam_ledger_lane_follows_the_class_dd174a.sql emits the organization-member arm its confidential class grants and NOT the global-readable system-org arm the class never sanctioned.'
      end);

    if r.generate then
      perform iam.apply_rls(r.sch, r.tbl, r.token, r.variant);
      raise notice 'b57: generated % (%.% / %)', r.token, r.sch, r.tbl, r.variant;
    else
      raise notice 'b57: %.% keeps its bespoke policy set — % (see the registry row for the exact refusal)', r.sch, r.tbl, r.token;
    end if;
    n := n + 1;
  end loop;
  raise notice 'b57: % table(s) handled', n;
end $$;
