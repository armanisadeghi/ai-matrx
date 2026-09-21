-- DOORS-ONLY-2 inverse -- restores the version of public._library_audit that does NOT name
-- rag.library_audit_log.organization_id. That column is NOT NULL with no default and no
-- trigger, so running this puts all fourteen callers back to failing with
-- `23502 null value in column "organization_id" of relation "library_audit_log"`:
-- industry_assign_org, industry_unassign_org, industry_upsert, industry_set_active,
-- industry_curator_grant, industry_curator_revoke, library_publish, library_revoke,
-- library_subscribe, library_unsubscribe, and the four seo.starter_pack_* doors.
-- Only run it to undo a change that broke something worse, and say what.

create or replace function public._library_audit(
  p_actor uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_industry_id uuid, p_org uuid, p_detail jsonb)
returns void
language sql
security definer
set search_path to 'public', 'rag'
as $function$
  insert into rag.library_audit_log(actor_user_id, action, data_store_id, entity_type, entity_id, industry_id, target_organization_id, detail)
  values (p_actor, p_action, case when p_entity_type = 'data_store' then p_entity_id end, p_entity_type, p_entity_id,
          p_industry_id, p_org, coalesce(p_detail, '{}'::jsonb));
$function$;
