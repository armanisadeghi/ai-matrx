-- AI catalog reshape follow-up: `ai.model_definition.model_provider` (FK to
-- ai.provider, added in the 2026-07-02 reshape) was never backfilled/reconciled
-- against the legacy free-text `provider` column. Result: 33 rows had a null
-- FK and ~10 rows had the FK pointing at the WRONG provider (e.g. a WAN model
-- FK'd to Google's row) purely because the correct provider didn't exist yet
-- in ai.provider. Idempotent: every INSERT is guarded, the UPDATE is a pure
-- re-derivation safe to re-run.

-- 1. Insert the providers that exist as free text on model_definition.provider
--    but were never added to ai.provider (matches the metadata shape of the
--    existing 13 rows: same system org, is_system=true, visibility=public).
insert into ai.provider (name, slug, organization_id, is_system, visibility)
select v.name, v.slug, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, true, 'public'::platform.visibility
from (values
  ('Black Forest', 'black-forest'),
  ('ByteDance', 'bytedance'),
  ('ElevenLabs', 'elevenlabs'),
  ('Ideogram', 'ideogram'),
  ('Kuaishou', 'kuaishou'),
  ('Luma', 'luma'),
  ('MiniMax', 'minimax'),
  ('Recraft', 'recraft'),
  ('Runway', 'runway'),
  ('Together', 'together'),
  ('WAN', 'wan')
) as v(name, slug)
where not exists (
  select 1 from ai.provider p where lower(trim(p.name)) = lower(trim(v.name))
);

-- 2. Re-derive model_provider from the free-text provider column for every
--    row where an exact (case/whitespace-insensitive) provider name match
--    exists — this backfills every null AND corrects every row where the FK
--    had drifted onto the wrong provider (both classes fixed by the same
--    single rule: "model_provider must reference the provider named in
--    `provider`"). Rows whose free text has no matching provider row (there
--    are none left after step 1) are left untouched, not nulled.
update ai.model_definition m
set model_provider = p.id
from ai.provider p
where lower(trim(m.provider)) = lower(trim(p.name))
  and (m.model_provider is null or m.model_provider != p.id);
