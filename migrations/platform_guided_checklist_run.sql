-- Guided setup checklists — the persistence row behind `lib/guided-setup/`.
--
-- WHY A NEW TABLE (reuse-first requires the justification).
--   Considered and rejected:
--     * platform.user_entity_state — per-USER only, and keyed on a registered
--       entity token + row id. A setup checklist is org work: a teammate who
--       confirms a DNS record has confirmed it for the whole org, and its
--       target is often not a row at all (a domain, a mailbox, a provider).
--     * platform.flexible_data — the user-authored Block Schemas / kind store.
--       Putting machine state in it is exactly the "shoehorn a new concept into
--       a primitive it doesn't fit" anti-pattern.
--     * A JSONB column on each consumer's own table — that is the hand-rolled
--       per-surface version this primitive exists to delete.
--   A checklist run is a genuinely new entity: its own identity
--   (checklist + target + org), its own lifecycle (started → completed →
--   dismissed → restarted), and its own access story.
--
-- WHAT IS AND IS NOT STORED HERE (THE TRUE-CURRENT-STATUS LAW).
--   Machine-verifiable state is NEVER stamped here — it is re-derived live on
--   every visit, because a step that passed can regress (a DNS record gets
--   deleted, a token is revoked). `state` holds only what cannot be derived:
--   the human's confirmations of un-checkable steps, their notes, a record of
--   auto steps we performed on their behalf, and a LAST-KNOWN check result
--   used purely to paint the screen instantly before the live re-check lands.
--
-- Visibility default `internal`: this is org work, not a personal artifact
-- (db-rules §6a-1). Not versioned: `state` records who confirmed what and when
-- inline, and a checkbox log does not want a row_versions entry per click.
--
-- Applied live against Matrx Main (txzxabzwovsujtloxrus) 2026-08-14.

do $$
begin
  if to_regclass('platform.guided_checklist_run') is null then
    perform platform.create_entity_table(
      p_schema      => 'platform',
      p_table       => 'guided_checklist_run',
      p_token       => 'guided_checklist_run',
      p_label       => 'Guided Checklist Run',
      p_fields      => array[
        -- The registry key of the checklist definition (lib/guided-setup/registry.ts).
        'checklist_key text not null',
        -- WHICH instance this run is about (a site id, a domain, an org id).
        -- Empty string = the checklist is a singleton for the org.
        'target_key text not null default ''''',
        -- { steps: { [stepId]: { confirmedAt, confirmedBy, note, ranAt, lastResult } } }
        'state jsonb not null default ''{}''::jsonb',
        'completed_at timestamptz',
        'dismissed_at timestamptz'
      ],
      p_variant     => 'entity',
      p_versioned   => false,
      p_soft_delete => true,
      p_visibility  => 'internal',
      p_category    => false,
      p_listed      => false,
      p_org_default => true,
      p_gin_jsonb   => true
    );
  end if;
end $$;

-- One live run per (org, checklist, target). The partial index lets a soft-deleted
-- run be superseded by a fresh start instead of colliding with it.
create unique index if not exists guided_checklist_run_scope_uk
  on platform.guided_checklist_run (organization_id, checklist_key, target_key)
  where deleted_at is null;

-- The common read is "the run for THIS target", across checklists.
create index if not exists guided_checklist_run_target_idx
  on platform.guided_checklist_run (target_key, checklist_key)
  where deleted_at is null;
