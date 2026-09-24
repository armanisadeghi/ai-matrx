-- RC-A1: validate every NOT VALID foreign key rcstore_h attached (VALIDATE takes only SHARE
-- UPDATE EXCLUSIVE on the child and ROW SHARE on the parent; the tables are empty), then the
-- DONE GATE: iam.canonical_certify_ok must be true for content.document, its certified custom
-- version store content.document_version, and every Detail — or this transaction refuses.
--
-- Apply inside the 1–4 AM PT window, straight after rcstore_h.

set local lock_timeout = '2s';

select platform.provision_validate_base_contract('content.document');
select platform.provision_validate_base_contract('content.document_version');
select platform.provision_validate_base_contract('content.univer_payload');
select platform.provision_validate_base_contract('skill.skill_detail');
select platform.provision_validate_base_contract('agent.message_template_detail');

alter table content.document validate constraint document_document_type_id_fkey;
alter table content.document validate constraint document_folder_id_fkey;
alter table content.document validate constraint document_last_conversation_id_fkey;
alter table content.document_version validate constraint document_version_actor_id_fkey;
alter table content.document_version validate constraint document_version_conversation_id_fkey;

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
    raise exception E'RC-A1 is not certified:\n  - %', v_bad
      using hint = 'Every FAIL/WARN above must clear before the store is done (iam.canonical_certify_ok).';
  end if;
  if (select status from iam.verify_canonical('content', 'document', 'document') where check_name = 'trg_version_capture') <> 'PASS' then
    raise exception 'content.document trg_version_capture is not PASS: the certified custom version store is not recognised';
  end if;
  if exists (select 1 from pg_constraint c
              where c.conrelid in ('content.document'::regclass, 'content.document_version'::regclass,
                                   'content.univer_payload'::regclass, 'skill.skill_detail'::regclass,
                                   'agent.message_template_detail'::regclass)
                and c.contype = 'f' and not c.convalidated) then
    raise exception 'RC-A1 still carries a NOT VALID foreign key';
  end if;
end $$;
