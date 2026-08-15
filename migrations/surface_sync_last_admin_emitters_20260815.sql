-- Idempotent code-first manifest mirror for the final four admin emitters.
-- Value vocabularies were already synced; this promotion mirrors readiness only.

UPDATE ui.ui_surface
SET readiness = 'partial',
    readiness_note = 'Emitter wired, browser verification pending. /administration/knowledge itself is a static link directory; growth-loop remains deliberately excluded as its own pillar.',
    updated_at = now()
WHERE name = 'matrx-admin/knowledge';

UPDATE ui.ui_surface
SET readiness = 'partial',
    readiness_note = 'Emitter wired, browser verification pending.',
    updated_at = now()
WHERE name = 'matrx-admin/skills';

UPDATE ui.ui_surface
SET readiness = 'partial',
    readiness_note = 'Emitter wired, browser verification pending. The reporting hub remains a static link directory with only its section identity.',
    updated_at = now()
WHERE name = 'matrx-admin/reporting';

UPDATE ui.ui_surface
SET readiness = 'partial',
    readiness_note = 'Emitter wired, browser verification pending. kind-registry remains deliberately excluded as its own surface.',
    updated_at = now()
WHERE name = 'matrx-admin/utilities';
