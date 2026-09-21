-- lane: DOORS-ONLY-2
-- (no `-- target:` line: production-only by definition, the same header DOORS-ONLY's twenty
--  files carry. This is not a new shared path that lands behind a knob -- it is a function
--  that is broken for all fourteen of its callers today, so there is no old path to protect.)
-- additive: yes
-- based-on: public._library_audit(uuid, text, text, uuid, uuid, uuid, jsonb) 183d2a3b2b49bf36bb5a9b2225fd05b725ee58f2117a126f9d4681ff61866535
--
-- FOURTEEN DOORS ARE BROKEN ON THE LIVE DATABASE AND THIS IS THE ONE LINE THAT BREAKS THEM.
-- (Found by DOORS-ONLY, which filed `public.industry_assign_org` returning `400 23502` as its
-- own task. Root-caused here. DOORS-ONLY reported it as two doors; it is fourteen.)
--
-- `rag.library_audit_log` carries `organization_id uuid NOT NULL` with NO DEFAULT and NO
-- TRIGGER -- read from `information_schema.columns.column_default` (null) and from `pg_trigger`
-- on that relation (zero non-internal rows), not assumed. `public._library_audit` inserts
-- `actor_user_id, action, data_store_id, entity_type, entity_id, industry_id,
-- target_organization_id, detail` and NEVER NAMES `organization_id`. So the audit INSERT
-- violates the NOT NULL, the exception propagates out of the caller's
-- `perform public._library_audit(...)`, and the caller's WHOLE TRANSACTION rolls back.
--
-- The assignment itself was always fine. The audit line kills it.
--
-- MEASURED RED, from the seat, on the live database before this file:
--   industry_assign_org(org, 'Legal')   -> 23502 null value in column "organization_id"
--                                          of relation "library_audit_log"
--   industry_unassign_org(org, 'Legal') -> 23502, the same
--
-- FIX THE CLASS, NOT THE INSTANCE. Fourteen functions call `_library_audit` and every one of
-- them is dead today: public.industry_assign_org, industry_unassign_org, industry_upsert,
-- industry_set_active, industry_curator_grant, industry_curator_revoke, library_publish,
-- library_revoke, library_subscribe, library_unsubscribe, and seo.starter_pack_from_proposal,
-- starter_pack_new_version, starter_pack_save, starter_pack_set_status. Patching
-- `industry_assign_org` would have left twelve of them broken. The fix belongs in the audit
-- writer, once.
--
-- WHICH ORGANIZATION THE KERNEL COLUMN MUST NAME -- read from the rows, not chosen.
-- All 44 existing rows have `organization_id` set, and on all 44
-- `organization_id IS DISTINCT FROM target_organization_id` (a `self_subscribe` row carries
-- organization_id 39c38960-... and target_organization_id f9cb3e35-...). And the table's only
-- client policy is
--   std_select USING (organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs()))
-- so `organization_id` decides WHOSE AUDIT TRAIL THE ROW APPEARS IN. It is the ACTOR's
-- organization. `p_org` is the organization acted UPON and already goes, correctly, to
-- `target_organization_id`. Writing the target org into the kernel column would silently move
-- every audit row into a different organization's trail, which is a data-visibility change
-- disguised as a bug fix.
--
-- `iam.default_organization_id(p_user_id)` is the platform's existing, single answer for "this
-- person's organization" (preference -> the legacy JSON key, with its stand-in announced ->
-- the oldest active membership). One primitive, reused; no second notion of a person's org.
--
-- NOTHING FAILS SILENTLY. An actor who belongs to no organization, acting with no target
-- organization, gives the audit row no owner. That state is real and it is raised with the
-- remedy in the sentence, not swallowed and not silently skipped -- an audit row that
-- disappears when the owner cannot be worked out is worse than a loud refusal.
--
-- ADDITIVE: a body replacement of a function that is broken for every caller. Same name, same
-- seven arguments, same `void` return, same SECURITY DEFINER, same search_path. Nothing is
-- dropped, renamed or revoked; no signature moves; no client contract changes. It turns a dead
-- path into a working one.
--
-- Inverse: migrations/inverse/doorsonly2_library_audit_names_the_kernel_organization.inverse.sql
-- Proof: scripts/campaign-tests/doorsonly2_library_audit_green.sql -- red before, green after.

set local lock_timeout = '2s';

create or replace function public._library_audit(
  p_actor uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_industry_id uuid, p_org uuid, p_detail jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'rag'
as $function$
declare
  v_org uuid;
begin
  -- The kernel column is the ACTOR's organization: rag.library_audit_log's std_select reads it,
  -- so it decides whose audit trail this row appears in. p_org is the organization acted UPON
  -- and goes to target_organization_id, exactly where it already went.
  v_org := coalesce(iam.default_organization_id(p_actor), p_org);
  if v_org is null then
    raise exception 'library audit: actor % belongs to no organization and no target organization was given, so this audit row would have no owner and no organization could ever read it. Remedy: set users.user_preferences.default_organization_id for this user, or call the door with a target organization.',
      p_actor
      using errcode = '23502';
  end if;

  insert into rag.library_audit_log(
    organization_id, actor_user_id, action, data_store_id,
    entity_type, entity_id, industry_id, target_organization_id, detail)
  values (
    v_org, p_actor, p_action,
    case when p_entity_type = 'data_store' then p_entity_id end,
    p_entity_type, p_entity_id, p_industry_id, p_org,
    coalesce(p_detail, '{}'::jsonb));
end;
$function$;

comment on function public._library_audit(uuid, text, text, uuid, uuid, uuid, jsonb) is
  'DOORS-ONLY-2 2026-09-21: writes the NOT NULL kernel column rag.library_audit_log.organization_id, which this function never named -- so every one of its fourteen callers (industry_* x6, library_* x4, seo.starter_pack_* x4) died with 23502 and rolled back. organization_id is the ACTOR''s organization (iam.default_organization_id), because it is what the table''s std_select policy reads and therefore decides whose audit trail the row appears in; p_org is the organization acted UPON and stays in target_organization_id. An actor with neither raises with the remedy rather than losing the audit row.';

-- THE ACCESS DECISION, IN DATA. `provision_shape_guard` refuses any SECURITY DEFINER function
-- that reaches COMMIT without one, and it is right to: this function runs as `postgres` with
-- BYPASSRLS and writes an audit row. NO CLIENT MAY EVER CALL IT. It is the shared audit writer
-- the fourteen library/industry/seo doors call from inside their own transaction, after each of
-- those doors has already made its own ladder decision (`is_super_admin` / `is_org_admin` /
-- `_library_assert_admin` / `_pack_assert_creator` / organization membership). A client that
-- could call it directly could forge an audit row naming any actor, any industry and any
-- organization -- which is exactly the forgeable-audit shape SECURITY-SWEEP-2 closed elsewhere.
-- So: signed_in_callers = false, anonymous_callers = false, and the lane said in a sentence.
insert into platform.client_callable_door (
  schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
  non_client_lane, signed_in_callers, anonymous_callers)
values (
  'public', '_library_audit',
  'p_actor uuid, p_action text, p_entity_type text, p_entity_id uuid, p_industry_id uuid, p_org uuid, p_detail jsonb',
  array['uuid'::regtype, 'text'::regtype, 'text'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
  'Internal audit writer, never reached from a client. p_actor is the caller the DOOR already resolved from auth.uid() and is written to actor_user_id; the kernel organization_id is derived from it, never passed in. p_org is the organization acted UPON and is written to target_organization_id; NULL is allowed and means the action named no other organization. p_industry_id and p_entity_id are recorded, not authorised here -- each calling door checks them against its own ladder before it calls this. No argument is trusted as an access decision, because no access decision is made here.',
  'migrations/campaign/doorsonly2_library_audit_names_the_kernel_organization.sql',
  'server_only: called only from inside the fourteen SECURITY DEFINER doors that write the library/industry/seo audit trail (public.industry_assign_org, industry_unassign_org, industry_upsert, industry_set_active, industry_curator_grant, industry_curator_revoke, library_publish, library_revoke, library_subscribe, library_unsubscribe, and seo.starter_pack_from_proposal, starter_pack_new_version, starter_pack_save, starter_pack_set_status), each of which has already made its own ladder decision. No client ever calls it: a direct caller could forge an audit row naming any actor, any industry and any organization.',
  false, false)
on conflict (schema_name, function_name, identity_argtypes) do update set
  reason = excluded.reason,
  declared_by = excluded.declared_by,
  non_client_lane = excluded.non_client_lane,
  signed_in_callers = false,
  anonymous_callers = false;
