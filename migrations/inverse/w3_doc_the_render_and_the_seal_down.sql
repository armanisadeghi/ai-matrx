-- chair-step: dropping W3-DOC's two provisioned tables, their write doors and everything platform.provision wrote beside them is this lane's teardown, never an additive change, and it reaches production only at a terminal with the campaign stopped
--
-- THE INVERSE of `migrations/campaign/w3_doc_the_render_and_the_seal.sql` (§4.13, rule 27).
--
-- IT UNDOES WHAT `platform.provision` WROTE, NOT ONLY THE DDL — the two tables, their
-- indexes, their write-door functions, their `platform.client_callable_door` rows, their
-- `platform.stamped_write_table` rows, their `platform.entity_types` rows and their
-- `platform.provision_spec` declarations. An inverse that dropped the tables alone would
-- leave the registry naming relations that no longer exist, which is the shape
-- `provision_shape_guard` exists to refuse.
--
-- 🚨 IT NEVER DROPS SCHEMA `custom`, and it never re-opens it. This lane holds no lock and
-- owns only its reserved prefix `doc_`. Everything below is dropped BY NAME. The security
-- repair the up-migration performed — closing the 53 leaked client EXECUTE grants in schema
-- `custom` — is deliberately NOT reversed: it restored §6.3 fact two's stated posture, which
-- was untrue on the branch before it ran, and re-granting `EXECUTE` on
-- `custom.assert_store_door` to `anon` to be tidy would be this campaign's worst possible
-- rollback. The declared state (`platform.schema_client_exposure.client_exposed = false`)
-- and the actual state agree after this file exactly as they do before it.
--
-- 🚨 IT REFUSES WHEN A SEAL WOULD BE LOST. `custom.doc_signature` is VAL-10's audit trail and
-- is immutable by construction; dropping it silently would be the one thing this lane exists
-- to make impossible. A row in it stops this file by name.

set lock_timeout = '2s';
set statement_timeout = '300s';

do $inv$
declare
  v_seals  bigint := 0;
  v_docs   bigint := 0;
begin
  if to_regclass('custom.doc_signature') is not null then
    execute 'select count(*) from custom.doc_signature' into v_seals;
  end if;
  if v_seals > 0 then
    raise exception 'REFUSING to drop custom.doc_signature: it holds % signature(s), and a signature is immutable once signed', v_seals
      using errcode = '2BP01',
            hint = 'VAL-10. A seal names its signer, its time, its hash and the document version it signed; dropping the table would destroy exactly the evidence that makes those four facts worth anything. If this teardown is genuinely wanted, the seals are exported first and that is a decision with a person''s name on it, never a migration''s.';
  end if;

  if to_regclass('custom.doc_render') is not null then
    execute 'select count(*) from custom.doc_render' into v_docs;
    if v_docs > 0 then
      raise notice 'custom.doc_render holds % rendered document(s); they go with the table. The RECORDS they were rendered from are ordinary rows of custom.record and are NOT touched - a record that loses its renders is an unrendered record again.', v_docs;
    end if;
  end if;
end;
$inv$;

-- ── the write doors, by name (a table DROP does not take them) ─────────────────
drop function if exists custom.doc_signature_write(uuid, uuid, uuid, text, text, uuid, text, integer);
drop function if exists custom.doc_render_write(uuid, uuid, uuid, uuid, integer, text, text);

-- ── the two tables, the seal first (it names the render it sealed) ─────────────
-- 🚨 THE TWO TABLES STAY STANDING, EMPTY AND UNREGISTERED (lane INVERSE-GUARD, 2026-09-21).
-- This file used to DROP them. Two later lanes built on them: `custom.doc_sign`
-- (`argsruled_four_arguments_in_the_store.sql`) writes a render and a seal through them, and
-- `w3_doc_the_render_path_and_the_signature_value_v2.sql` attached `doc_render_immutable` and
-- `doc_signature_immutable` over `custom._doc_render_immutable` / `custom._doc_signature_immutable`,
-- both of which read the very tables that were dropped. So the inverse left two live triggers
-- over missing relations and took a door in another lane down with it — which is not the
-- teardown this file describes, it is a broken store. `storerel_red` lost a whole session to
-- exactly this class.
--
-- WHAT THE DEFECT ACTUALLY IS: W3-DOC's render and seal, as a thing a person can reach, are
-- gone. That is restored in full by what this file still does — both write doors are dropped
-- above, and every `client_callable_door`, `stamped_write_table`, `entity_types` and
-- `provision_spec` row this lane wrote goes below, so nothing declares these relations and no
-- client can write to them. They are also EMPTY by construction: the refusal at the top of
-- this file stops it by name when a single seal exists, so there is nothing in them to lose.
-- Two unregistered, empty tables under their own immutability guards are precisely the prior
-- state; two missing tables under live triggers are a different thing entirely.

-- ── what platform.provision wrote beside the DDL ───────────────────────────────
delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by in ('platform.provision(doc_render)', 'platform.provision(doc_signature)');
delete from platform.stamped_write_table
 where schema_name = 'custom' and table_name in ('doc_render', 'doc_signature')
   and declared_by in ('platform.provision(doc_render)', 'platform.provision(doc_signature)');
delete from platform.entity_relationships
 where child_type in ('doc_render', 'doc_signature')
    or parent_type in ('doc_render', 'doc_signature');
delete from platform.entity_types
 where token in ('doc_render', 'doc_signature') and schema_name = 'custom';

-- 🚨 platform.provision_spec IS APPEND-ONLY and a DELETE is refused by
-- `platform._provision_spec_is_append_only()` with "the applied declaration IS the record".
-- So the teardown is RECORDED rather than erased: one `deprovision` row per token, carrying
-- the same declaration, becomes that token's current row.
insert into platform.provision_spec (
  token, spec, spec_hash, type, origin, owner_org_id, verb, result,
  applied_by, applied_via, artifacts_status, applied_lane, applied_actor, applied_role)
select s.token, s.spec, s.spec_hash, s.type, s.origin, s.owner_org_id, 'deprovision',
       jsonb_build_object('created', '[]'::jsonb, 'certify', '[]'::jsonb,
                          'note', 'migrations/inverse/w3_doc_the_render_and_the_seal_down.sql dropped W3-DOC''s render and seal: both tables, both write doors, the door rows, the stamped-write rows and the registry rows. Schema custom was left CLOSED, as the up-migration left it.'),
       session_user, 'runner', 'complete', 'full', null, session_user
  from platform.v_provision_spec_current s
 where s.token in ('doc_render', 'doc_signature') and s.verb <> 'deprovision';

delete from platform.provision_spec_grandfather
 where lane = 'unprovisioned_relation'
   and object_ref in ('custom.doc_render', 'custom.doc_signature');
