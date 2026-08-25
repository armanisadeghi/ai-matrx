-- ledger_users_user_sensitive_items_drop.sql
-- ---------------------------------------------------------------------------
-- Close a genuine §0.7 ledger gap: users.user_sensitive_items was hard-DROPPED
-- with no platform.deprecated_relations row at all.
--
-- SOURCED, not guessed:
--   * Dropped by aidream/db/migrations/0235_credential_vault_phase1.sql:186
--     (`drop table if exists users.user_sensitive_items cascade;`) together with
--     `public.user_sensitive_items_cleanup_vault()` on line 187. Landed
--     2026-07-23.
--   * Reason, from common-docs/projects/unified-credential-vault/PLAN.md I-1:
--     it was a FOURTH credential store wired to Supabase Vault (vault.secrets)
--     via set_sensitive_item / get_sensitive_item_value / delete_sensitive_item
--     plus a delete-cleanup trigger; it held 0 rows and no application code in
--     any repo read or wrote it. Amended Decision 2: "Drop it (Phase 1). Do not
--     evolve it."
--   * Successor: users.credential_items, the structured item layer created in
--     section 1 of that same migration.
--   * Verified live 2026-08-25: all three RPCs and the cleanup trigger function
--     are gone, users.credential_items exists, and the ONLY ledger row for this
--     relation is the intermediate 2026-06-28 public→users schema move — the
--     drop itself was never recorded.
--
-- archived_as is NULL on purpose: this was a hard DROP, not a graveyard
-- retirement, so there is no archived relation to point at. The row exists so
-- the drop is discoverable and reasoned rather than silent.
-- ---------------------------------------------------------------------------

begin;

do $$
begin
  if to_regclass('users.user_sensitive_items') is not null then
    raise exception 'precondition: users.user_sensitive_items still exists — this is not a drop record';
  end if;
  if to_regclass('users.credential_items') is null then
    raise exception 'precondition: successor users.credential_items missing';
  end if;
end $$;

insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason, deprecated_at)
values (
  'users.user_sensitive_items',
  'users.credential_items',
  null,
  'Hard-dropped 2026-07-23 by aidream/db/migrations/0235_credential_vault_phase1.sql (Unified Credential Vault Phase 1), along with public.user_sensitive_items_cleanup_vault(). It was a fourth credential store backed by Supabase Vault via set_sensitive_item/get_sensitive_item_value/delete_sensitive_item; it held 0 rows and had no consumers in any repo, so per unified-credential-vault PLAN.md amended Decision 2 it was dropped rather than evolved. Superseded by users.credential_items. No graveyard copy exists (deliberate hard drop of an empty, unreferenced table). Ledger row backfilled 2026-08-25 to close the §0.7 gap.',
  '2026-07-23T00:00:00Z'
)
on conflict do nothing;

do $$
declare v int;
begin
  select count(*) into v from platform.deprecated_relations
   where old_ref='users.user_sensitive_items' and new_ref='users.credential_items';
  if v <> 1 then raise exception 'verify: expected 1 ledger row, got %', v; end if;
  raise notice 'verify ok: user_sensitive_items drop is ledgered';
end $$;

commit;
