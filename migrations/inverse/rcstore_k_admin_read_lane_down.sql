-- chair-step: RC-A1 inverse of rcstore_k — there is no earlier policy text to restore: iam.apply_rls is the one policy authority and its output is a function of the generator, not of this file. The inverse is the generator run again (idempotent), which is also the only legal way to reach the pre-rcstore_k shape on a database whose generator predates platform_admin_read.
-- window-class: iam.apply_rls regenerates policies on the five empty rich-content tables (CREATE POLICY freezes the 23-relation supautils set for this short transaction); applied in the 1-4 AM PT window.

set local lock_timeout = '2s';

select iam.apply_rls('content', 'document', 'document', 'entity');
select iam.apply_rls('content', 'document_version', 'document_version', 'component');
select iam.apply_rls('content', 'univer_payload', 'univer_payload', 'component');
select iam.apply_rls('skill', 'skill_detail', 'skill_detail', 'component');
select iam.apply_rls('agent', 'message_template_detail', 'message_template_detail', 'component');
