-- dd248_stamped_write_register — THE REGISTER OF TABLES WHOSE WRITES MUST CARRY A STAMP
-- (DD-248. SECURITY / PROVENANCE. db-rules §6d. This file creates ONE machinery table and seeds
--  ONE row. It changes no grant, no policy and no function: it is the declaration the guard
--  `pnpm check:stamped-write-doors` measures against, applied first so that guard can be RUN and
--  seen RED against the live database before dd248_one_stamping_door_for_context_cells closes it.)
--
-- ═══ WHAT THIS IS FOR ═════════════════════════════════════════════════════════════════════════
-- Some tables carry a column that says WHO produced the row and HOW — `authored_by`, a
-- `source_type`. A column like that is worth nothing unless exactly one code path can set it, and
-- that path derives it from the caller instead of accepting it as an argument. The moment a second
-- path exists, the column records what the writer CHOSE to say, and every audit, every "who
-- changed this", every AI-vs-human distinction built on it is decoration.
--
-- `platform.client_callable_door` (DD-169) records which functions a client may knock on. It does
-- not say which TABLES may only be reached through one. This register does, and it names the
-- column the door must stamp, so a guard can ask three questions that nobody could ask before:
--   * can a client role write the table WITHOUT a function at all (a table or column privilege)?
--   * is every function a client can execute that writes it a DECLARED door?
--   * does every one of those doors derive the stamp from the caller (`auth.uid()`)?
--
-- THE REGISTER IS MACHINERY, exactly like `platform.client_callable_door`: no grants to any client
-- role, no RLS, reachable only by the owner and the guards that connect as it. A client that could
-- edit the register could declare its way out of the rule.
--
-- ═══ THE SEEDED ROW ═══════════════════════════════════════════════════════════════════════════
-- `context.context_item_values` — every scope cell in the platform, one append-only row per
-- version. `authored_by` is the person or agent the platform will name when somebody asks who
-- filled a cell. Measured live 2026-09-15 (THE PLAN v2 §9 D-5 / B-139): three write doors reached
-- it, two of which let the caller name the author. See the sibling migration for the measurement
-- and what it closed.

create table if not exists platform.stamped_write_table (
  schema_name   text not null,
  table_name    text not null,
  stamp_column  text not null,
  rls_variant   text not null,
  declared_by   text not null,
  reason        text not null,
  declared_at   timestamptz not null default now(),
  primary key (schema_name, table_name)
);

comment on table platform.stamped_write_table is
  'DD-248. Tables whose rows must carry a provenance stamp that ONLY a declared SECURITY DEFINER door may set. For each row, `pnpm check:stamped-write-doors` asserts: no client role holds INSERT/UPDATE/DELETE on the table (at table OR column level); every function a client role can EXECUTE that writes it holds a platform.client_callable_door row; every such door derives the stamp from the caller; and platform.entity_types.rls_variant still says `rls_variant`, so a regeneration cannot widen the grants back open without the guard saying so. Machinery: no client role holds any privilege here.';
comment on column platform.stamped_write_table.stamp_column is
  'The column the door must set FROM THE CALLER, never from an argument the caller supplies — e.g. `authored_by`.';
comment on column platform.stamped_write_table.rls_variant is
  'The iam.apply_table_grants variant this table must be generated with. `ledger` is the read-only-for-clients shape: "writes belong to a SECURITY DEFINER writer".';

insert into platform.stamped_write_table
  (schema_name, table_name, stamp_column, rls_variant, declared_by, reason)
values
  ('context', 'context_item_values', 'authored_by', 'ledger', 'DD-248 / B-139',
   'Every scope cell in the platform, append-only, one row per version. `authored_by` is who the platform names when somebody asks who filled a cell, and `source_type` is how it distinguishes an AI enrichment from a person typing. context.write_context_value is the ONE writer that sets them; public.set_context_value, public.set_scope_context_value, public.scope_system_apply and context.provision_scope_dataset are its declared SECURITY DEFINER doors and each derives the actor from auth.uid(). Nothing else may reach this table.')
on conflict (schema_name, table_name) do nothing;
