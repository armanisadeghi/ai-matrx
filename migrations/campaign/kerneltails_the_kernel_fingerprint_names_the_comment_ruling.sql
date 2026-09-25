-- chair-step: lane KERNEL-TAILS (tail 1). RE-RECORDS iam.entity_read_kernel_expected() for the access-kernel bodies production and the clone hold since rca2b_the_access_check_asks_a_comments_record.sql (21:51:24Z production, 21:49:48Z clone). That file changed two fingerprinted members BY RULING — rich-content STORE-DESIGN §3.8, register row RC-A2 round 2: "a detail (a comment) names its record, and its access IS that record's, everywhere the kernel is asked" — and re-recorded nothing, so platform.provision refused every spec with preflight.read_kernel from 21:51Z (D249's class; SHARE-LANE-2's 20:38Z file did the same thing and its 21:04Z file re-recorded cc430d18…). The members that moved (aidream scripts/check_db_guards.py): iam.has_access_for_base(uuid, text, uuid, permission_level, boolean, text[]) and iam.accessible_entity_ids(text, permission_level, integer, boolean). Proof before recording (the recorded value MEANS "re-read and re-proved"): aidream scripts/_verify_entity_read_equivalence.py on production, 351 tables identical on every sampled user, 0 lost, 0 gained (51 have no std_select policy and are not compared, the same set as before). The literal below is what the live bodies hash to on production AND the clone (both 181368ebc712dc15dc8c07e1b8f1974e); the file refuses itself if the live fingerprint is anything else. No body but the expectation changes. No data write.
-- based-on: iam.entity_read_kernel_expected() a55a4f4d51bfcd8951554a917531dc0176fc3f8f4731e55a71d4bfa80ecd7616
-- lane: KERNEL-TAILS
-- INVERSE: migrations/inverse/kerneltails_the_kernel_fingerprint_names_the_comment_ruling_down.sql
set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT '181368ebc712dc15dc8c07e1b8f1974e'::text
$function$;

do $g$
begin
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'kerneltails: the live access-kernel fingerprint is % but this file records %; another lane moved a fingerprinted body after rca2b — re-derive the file.',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  end if;
  if not ((platform.provision_preflight())->>'ok')::boolean then
    raise exception 'kerneltails: the provisioner preflight still refuses after the re-record: %', platform.provision_preflight();
  end if;
end $g$;
