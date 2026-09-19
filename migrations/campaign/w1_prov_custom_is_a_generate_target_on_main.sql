-- chair-step: this seeds the ONE row that lets `platform.provision(spec)` accept schema `custom` at all. It is an INSERT into `platform.provision_generate_target`, a registry table by every definition the additive allow-list uses but not one of the eight that list names — the same class, and the same loud route, as `w1_prov_closed_declares_custom_closed.sql`. A person reads the one statement below before it runs.
--
-- LAND — `custom` IS A PROVISION GENERATE TARGET ON THE MAIN DATABASE.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- `platform.provision_validate` carries THE PARITY RULE, in its own words: "provisionable only
-- if the repository can generate for it". With no row in `platform.provision_generate_target`,
-- schema `custom` is refused by name — `identity.schema.not_generable` — and NOTHING can be
-- provisioned into it. Measured on the main database 2026-09-18: 57 rows, no `custom`.
--
-- The rehearsal copy has the row, seeded by `w1_prov_branch_custom_generate_target.sql`. That
-- file REFUSES ITSELF on the main database by `system_identifier`, on the reasoning that
-- publishing it here contradicts §6 fact three of the OFF switch. It cannot be reused, so this
-- file is written instead, and it says plainly what it is and is not:
--
--   · WHAT IT IS NOT. It does not add `custom` to any `generate:` block in
--     `aidream/db/matrx_orm.yaml`, to `additional_schemas` in matrx-orm's config, or to the
--     frontend's `db-types` schema list. §6 fact three — "`custom` appears in no `generate:`
--     block and no `additional_schemas` list, and a startup assertion fails if any registered
--     model resolves into it" — is UNCHANGED by this row, and W3-ASSERT's assertion still
--     passes, because no model resolves into `custom` either before or after it.
--   · WHAT IT IS. One row in a platform registry saying the schema may be provisioned into.
--     It grants nothing, exposes nothing and switches nothing on. Schema `custom` is declared
--     CLOSED to every client role in `platform.schema_client_exposure` by the file that runs
--     immediately before this one, and the provisioner now honours that declaration.
--   · WHAT IS STILL OWED, so nobody reads this row as a claim that is already true: the
--     repository's two generate lists are switch-checklist step 3's work, beside
--     `GRANT USAGE ON SCHEMA custom TO authenticated`. Until they run, the row is a permission
--     to build, not a statement that the projection exists. `published_by` says so in the
--     database itself, so the next person to read the registry is not guessing.
--
-- THE INVERSE, one statement, and it is safe precisely because nothing outside this campaign
-- provisions into `custom`:
--     delete from platform.provision_generate_target where schema_name = 'custom';

set lock_timeout = '5s';
set statement_timeout = '120s';

insert into platform.provision_generate_target (schema_name, orm_target, types_target, published_by)
values ('custom', true, true,
        'LAND 2026-09-18 — the parity row that lets platform.provision(spec) accept schema `custom`. The repo generate lists (aidream/db/matrx_orm.yaml `generate:`, matrx-orm `additional_schemas`, the frontend `db-types` schema list) are switch-checklist step 3 and have NOT run: until they do this row is a permission to build, not a claim that the projection exists. Schema `custom` is declared CLOSED to every client role in platform.schema_client_exposure and every campaign knob resolves false.')
on conflict (schema_name) do nothing;
