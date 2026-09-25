-- Text-only repoint: the mandate scan-report door's declared reason and the
-- renamed_from_key lineage column comment both cite
-- common-docs/projects/mandate-declaration-reporting/DESIGN.md, which was folded
-- into common-docs/systems/intelligence/mandates/STATE.md (§8) during the
-- 2026-09-25 mandate-docs move to systems/intelligence/mandates/. No logic change.

UPDATE platform.client_callable_door
SET reason = 'WRITE. The one door for mandate scan reports (common-docs/systems/intelligence/mandates/STATE.md §8). Deliberately NOT granted to authenticated: the function''s own first act is a JWT-lane check that refuses a browser session, and the grant matches it — a TypeScript repo''s release check reaches it through PostgREST with the same service/secret key its other check:* gates already use. Declared here so the declaration and the enforcement can never disagree.'
WHERE schema_name = 'mandate' AND function_name = 'submit_scan_report';

COMMENT ON COLUMN mandate.definition.renamed_from_key IS
  'The mandate_key this job was renamed FROM. Lineage for RENAME_WITHOUT_LINEAGE (common-docs/systems/intelligence/mandates/STATE.md §8).';
