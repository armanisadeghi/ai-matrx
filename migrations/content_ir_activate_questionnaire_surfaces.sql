-- ============================================================================
-- Activate the questionnaire kind_surface rows (xml_tag + fence_lang).
--
-- kind_questionnaire_full.sql seeded both surfaces is_active=false "until
-- activation" (dual-gate law), relying on the hand-maintained compiled floor
-- to answer meanwhile. The `questionnaire` KIND was activated by the central
-- activation step, but the surface flip was missed — invisible while the
-- floor was hand-maintained, exposed the moment the floor became GENERATED
-- from live kind_surface (Wave 1 C2: only ACTIVE rows are exported).
--
-- Guard: flips ONLY surfaces of an ACTIVE kind — this can never activate a
-- surface whose kind hasn't passed the dual gate.
--
-- After applying: pnpm check:shapes:surfaces:refresh (regenerates BOTH
-- runtime bootstraps) and commit both repos.
-- ============================================================================

update content_ir.kind_surface s
set is_active = true, updated_at = now()
from content_ir.kind_definition k
where k.id = s.kind_definition_id
  and k.kind = 'questionnaire'
  and k.is_active = true
  and s.token = 'questionnaire'
  and s.surface_type in ('xml_tag', 'fence_lang')
  and s.deleted_at is null
  and s.is_active = false;
