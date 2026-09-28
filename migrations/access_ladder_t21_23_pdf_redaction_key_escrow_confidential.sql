-- lane: access-ladder T-21
-- Access ladder T-21 (2026-09-28): pdf.pdf_redaction_key_escrow becomes Confidential, as Arman approved.
-- The independent table review (common-docs/projects/access-ladder/table-review.md) lists it private -> confidential:
-- these keys reverse a legal redaction, so exposing them to coworkers defeats the redaction. Arman approved that
-- review's Confidential list on 2026-09-26 in these words: "I agree, including the part about the basic employee
-- list." T-8b left this one table Private because iam.apply_rls refused it (no created_by).
-- Here: platform.retrofit_entity adds created_by (from owner_id, the escrow's owner), updated_by, metadata, version and
-- the stamp/touch triggers, FKs NOT VALID (validated right after, in their own transaction); the owner-only bespoke
-- policies are superseded by the generated restricted set (owner = created_by = owner_id, plus platform_admin_read);
-- then the level moves through the approval door, which records Arman's words and regenerates the policies.
-- The table is empty today (0 rows), so the backfill touches nothing.
set local lock_timeout = '3s';
set local statement_timeout = '180s';

select platform.retrofit_entity('pdf', 'pdf_redaction_key_escrow', 'pdf_redaction_key_escrow', 'keep', null, 'owner_id');

select iam.supersede_bespoke_policies('pdf', 'pdf_redaction_key_escrow',
  array['pdf_redaction_key_escrow_select', 'pdf_redaction_key_escrow_insert', 'pdf_redaction_key_escrow_update'],
  'Bespoke owner_id-only policies from before the access ladder. The generated restricted set now carries the same owner lane on created_by (backfilled from owner_id) plus the canonical platform_admin_read.');

update platform.entity_types
   set type_reason = 'Access ladder T-21 (2026-09-28): moved to the restricted variant as an Arman-approved Confidential table; registry type stays entity so its custom-fields design is unchanged.'
 where token = 'pdf_redaction_key_escrow' and type_reason is null;

select platform.set_table_confidential_arman_explicitly_approved(
  p_token => 'pdf_redaction_key_escrow',
  p_arman_words => 'I agree, including the part about the basic employee list.',
  p_approved_on => '2026-09-26',
  p_rls_variant => 'restricted');

do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'pdf_redaction_key_escrow' and data_class = 'confidential' and rls_variant = 'restricted') then
    raise exception 'T-21: pdf.pdf_redaction_key_escrow did not land on Confidential/restricted';
  end if;
end $$;
