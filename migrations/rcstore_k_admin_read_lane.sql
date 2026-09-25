-- RC-A1: regenerate the rich-content store's RLS with the platform's CURRENT generator so each of
-- the five tables carries the platform_admin_read lane (Arman 2026-09-24: the admin system keeps
-- full read access — common-docs/policies/our-own-admin-database-access.md). iam.canonical_certify
-- gained the `platform_admin_read_present` check after rcstore_i certified the store, so the store
-- read FAIL on every table until the generator ran again. iam.apply_rls is the ONE policy
-- authority; nothing here is hand-written. Ends with the same done gate as rcstore_i.
-- window-class: iam.apply_rls regenerates policies on the five empty rich-content tables (CREATE POLICY freezes the 23-relation supautils set for this short transaction); applied in the 1-4 AM PT window.

set local lock_timeout = '5s';

select iam.apply_rls('content', 'document', 'document', 'entity');
select iam.apply_rls('content', 'document_version', 'document_version', 'component');
select iam.apply_rls('content', 'univer_payload', 'univer_payload', 'component');
select iam.apply_rls('skill', 'skill_detail', 'skill_detail', 'component');
select iam.apply_rls('agent', 'message_template_detail', 'message_template_detail', 'component');

do $$
declare
  v_bad text;
begin
  select string_agg(format('%s.%s [%s] %s: %s', x.s, x.t, x.category, x.status, x.detail), E'\n  - ')
    into v_bad
    from (select 'content' s, 'document' t, c.* from iam.canonical_certify('content', 'document', 'document') c
          union all select 'content', 'document_version', c.* from iam.canonical_certify('content', 'document_version', 'document_version') c
          union all select 'content', 'univer_payload', c.* from iam.canonical_certify('content', 'univer_payload', 'univer_payload') c
          union all select 'skill', 'skill_detail', c.* from iam.canonical_certify('skill', 'skill_detail', 'skill_detail') c
          union all select 'agent', 'message_template_detail', c.* from iam.canonical_certify('agent', 'message_template_detail', 'message_template_detail') c) x
   where x.status <> 'INFO';
  if v_bad is not null then
    raise exception E'RC-A1 is not certified:\n  - %', v_bad;
  end if;
end $$;
