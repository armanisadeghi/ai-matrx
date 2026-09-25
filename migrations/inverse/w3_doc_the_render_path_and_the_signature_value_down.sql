-- 🚨 THREE BODIES ARE LEFT STANDING, ON PURPOSE (lane INVERSE-GUARD, 2026-09-21).
-- `custom.doc_render_document` was ADOPTED after this inverse was written:
-- `custom.sign_request_create` (esign_asking_somebody_to_sign_is_a_door.sql) calls it on the live
-- path, so dropping it would have broken the e-sign door to restore a W3-DOC defect.
-- `custom.doc_render_body` and `custom.doc_content_hash` stay with it because it calls them.
--   THE DEFECT IS STILL RESTORED: the two immutability triggers come off `custom.doc_render` and
-- `custom.doc_signature` and their bodies go, `custom.doc_sign`, `custom.doc_signature_intact` and
-- `custom.doc_signature_field_ok` go, and the `platform.client_callable_door` rows go — so a
-- render can be rewritten, a signature can be rewritten, and no client can reach the signing path.
--
-- target: branch
--
-- THE INVERSE of `migrations/campaign/w3_doc_the_render_path_and_the_signature_value.sql`
-- (W3-DOC, REC-68 · VAL-10). §4.13, rule 27.
--
-- It restores the prior state exactly: the render path, the signature door, the two
-- immutability triggers and their functions, and the two `platform.client_callable_door`
-- rows this file's up-migration declared. Everything is under this lane's own reserved
-- prefix `doc_` inside schema `custom`; no other lane's object is touched and no
-- `-- based-on:` body has to be put back, which is itself the check that the up-migration
-- stayed inside §4.7's no-lock exemption.
--
-- 🚨 IT REFUSES WHEN A SEAL WOULD BE LEFT UNVERIFIABLE. Dropping
-- `custom.doc_signature_intact` while seals stand would leave VAL-10's audit trail with no
-- way to ask whether it still means anything, which is the silent half of exactly the
-- failure this lane exists to prevent.

set lock_timeout = '2s';
set statement_timeout = '300s';

do $inv$
declare
  v_seals bigint := 0;
begin
  if to_regclass('custom.doc_signature') is not null then
    execute 'select count(*) from custom.doc_signature' into v_seals;
  end if;
  if v_seals > 0 then
    raise exception 'REFUSING to drop the render path: % signature(s) stand, and this file owns the only way to ask whether they are still intact', v_seals
      using errcode = '2BP01',
            hint = 'VAL-10. Run migrations/inverse/w3_doc_the_render_and_the_seal_down.sql first - it refuses the same way while seals exist, which is the point: a seal is removed by a decision with a person''s name on it, never by a teardown that ran in the right order.';
  end if;
end;
$inv$;

drop trigger if exists doc_render_immutable on custom.doc_render;
drop trigger if exists doc_signature_immutable on custom.doc_signature;

drop function if exists custom.doc_signature_intact(uuid, uuid);
drop function if exists custom.doc_sign(uuid, uuid, text, text, uuid);
drop function if exists custom._doc_render_immutable();
drop function if exists custom._doc_signature_immutable();
drop function if exists custom.doc_signature_field_ok(jsonb);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.doc_render_document(uuid, uuid, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.doc_render_body(uuid, uuid, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.doc_content_hash(text);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('doc_render_document', 'doc_sign')
   and declared_by = 'migrations/campaign/w3_doc_the_render_path_and_the_signature_value.sql';
