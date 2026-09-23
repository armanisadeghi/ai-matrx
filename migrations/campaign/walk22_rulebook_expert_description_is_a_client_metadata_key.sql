-- lane: MASTERWORK-WALK-22
-- THE GUIDE LINE IS HERS (cold walk 22, friction).
-- common-docs/projects/masterwork-methods-census/jobs-bar-2026-09-16/cold-walk-22/README.md
--
-- The Rulebook's Guide line (its description) was rewritten by the interviewer's `update_meta`
-- after turn 1 and the Rulebook page printed the rewrite as the Expert's own words. The screen
-- now records her wording in `platform.rulebook.metadata.expert_description` (written at
-- `rulebook_create`, and again when she chooses "Use it" through `rulebook_save`), and shows a
-- differing live description as a suggestion she accepts or declines
-- (matrx-frontend 8fa7020080, features/masterwork/types.ts `suggestedDescription`).
--
-- Both doors refuse any top-level metadata key a client may not write, by the declared set in
-- `public._rulebook_client_metadata_keys()` (DOORS-ONLY-5). This adds `expert_description` to it.
-- Nothing else changes: same signature, volatility, search_path and comment as DOORS-ONLY-5.
--
-- APPLIED LIVE 2026-09-22 through the Supabase MCP (migration
-- `walk22_rulebook_expert_description_is_a_client_metadata_key`); this file is the record, so
-- a later release or a re-run of doorsonly5_* / walk20_* cannot silently drop the key.
-- IDEMPOTENT: `create or replace` of an immutable SQL function plus a `comment on`; running it
-- twice leaves the same function.

create or replace function public._rulebook_client_metadata_keys()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- THE DECLARED CLIENT SET. `coherence` is deliberately absent: it is written by aidream's
  -- Coherence Partner ABOUT the Expert's work, it is the one key platform._touch_rulebook
  -- treats as background (so it does not bump `version`), and a browser must not be able to
  -- rewrite the machine's reading of the book. Mirrored by BACKGROUND_METADATA_KEYS in
  -- aidream/services/distillation/rulebook_writes.py, from the other direction.
  -- `expert_description` (cold walk 22): the Guide-line wording the Expert wrote or last chose,
  -- so a rewrite by the interviewer is shown as a suggestion, never a silent overwrite.
  select array['intake', 'capture_plan', 'daily_drip', 'prediction_ledger',
               'dump_url_sources', 'checkup', 'expert_description']::text[];
$fn$;

comment on function public._rulebook_client_metadata_keys() is
  'DOORS-ONLY-5: the top-level platform.rulebook.metadata keys a CLIENT may write, named rather than inferred. `coherence` is absent on purpose — it is the server lane''s reading of the Expert''s work and the one key the touch trigger treats as background.';
