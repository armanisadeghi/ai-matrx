-- lane: access-ladder T-21
-- Access ladder T-21 (2026-09-28): billing.usage_ledger moves to Organization, the level the independent table
-- review gave it (common-docs/projects/access-ladder/table-review.md). Toward Organization/Public: no approval.
-- iam.apply_rls refused it in T-8 because it had no created_by. Here: platform.retrofit_entity adds the base
-- columns (created_by from user_id, updated_by, id where missing, metadata, version, stamp/touch triggers,
-- FKs NOT VALID — validated right after, in their own transaction, one table at a time), then the level moves
-- and the class trigger regenerates the policies. One table, one transaction, 3 s lock timeout.
set local lock_timeout = '3s';
set local statement_timeout = '180s';

-- the owner-only `personal` variant cannot hold Organization (and never carries created_by): move to entity first
update platform.entity_types set rls_variant = 'entity' where token = 'billing_usage_ledger' and rls_variant = 'personal';

-- bespoke policies the generated set now does (named, with the reason; iam.supersede_bespoke_policies)
select iam.supersede_bespoke_policies('billing', 'usage_ledger', array['platform_admin_insert_only', 'platform_admin_update_only', 'platform_admin_delete_only'], 'Restrictive admin-only write set on a client_read_only ledger. The registry already closes client writes (read-only grant, no client write lane), so these duplicate that and block regeneration.');

-- written only by the server (service role / SECURITY DEFINER doors): the registry says so, so the
-- generator emits no client write lane and the client grant is read-only
update platform.entity_types set client_read_only = true where token = 'billing_usage_ledger';

select platform.retrofit_entity('billing', 'usage_ledger', 'billing_usage_ledger', 'keep', null, 'user_id', null, null, null);

select set_config('t21.fq', 'billing.usage_ledger', true), set_config('t21.v', 'organization', true);
do $$ declare r record; v_newvar text; v_hasvis boolean; v text := current_setting('t21.v'); begin
 select et.token, et.schema_name s, et.table_name tb, et.rls_variant, et.data_class, et.default_visibility into r from platform.entity_types et where et.schema_name||'.'||et.table_name = current_setting('t21.fq') and et.is_active;
 select exists(select 1 from information_schema.columns c where c.table_schema=r.s and c.table_name=r.tb and c.column_name='visibility') into v_hasvis;
 v_newvar := case when r.rls_variant in ('personal','restricted') then 'entity' else r.rls_variant end;
 if v_newvar is distinct from r.rls_variant then
   update platform.entity_types set type_reason = format('Access ladder T-21 (2026-09-28): rls_variant moved %s -> %s (Organization); type kept as %s so the table''s custom-fields design is unchanged.', r.rls_variant, v_newvar, type)
    where token=r.token and type is not null and type<>'entity' and type_reason is null;
 end if;
 update platform.entity_types set rls_variant=v_newvar,
   default_visibility = case when v='public' and v_hasvis then 'public'::platform.visibility
                             when v<>'public' and v_hasvis and v_newvar not in ('system','ledger','reference') and (r.default_visibility is null or r.default_visibility in ('personal','public')) then 'internal'::platform.visibility
                             when r.default_visibility='personal' then 'internal'::platform.visibility else r.default_visibility end
  where token=r.token;
 update platform.entity_types set data_class = (case when v='public' then 'public' else 'organization' end)::platform.data_class,
   data_class_reason = case v when 'public' then 'Access ladder T-21 (2026-09-28): Public per the independent table review (common-docs/projects/access-ladder/table-review.md) — meant to be seen outside the organization (a platform catalogue or public-web content).'
     when 'platform' then 'Access ladder T-21 (2026-09-28): Organization, platform-owned machinery per the independent table review (common-docs/projects/access-ladder/table-review.md); rows belong to the system organization.'
     else 'Access ladder T-21 (2026-09-28): Organization per the independent table review (common-docs/projects/access-ladder/table-review.md) under the access ladder law; no law or universal company rule keeps coworkers out.' end
  where token=r.token;
 if v_newvar is distinct from r.rls_variant and r.data_class = (case when v='public' then 'public' else 'organization' end)::platform.data_class then
   perform iam.apply_rls(r.s, r.tb, r.token, v_newvar);
 end if;
end $$;

do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'billing_usage_ledger' and data_class = 'organization'::platform.data_class) then raise exception 'T-21: billing.usage_ledger did not land on its level'; end if;
  if exists (select 1 from platform.entity_types where token = 'billing_usage_ledger' and (rls_variant in ('personal','restricted') or default_visibility = 'personal')) then raise exception 'T-21: billing.usage_ledger still owner-only'; end if;
  if exists (select 1 from billing.usage_ledger where created_by is distinct from user_id and user_id is not null) then raise exception 'T-21: billing.usage_ledger created_by not backfilled from user_id'; end if;
end $$;
