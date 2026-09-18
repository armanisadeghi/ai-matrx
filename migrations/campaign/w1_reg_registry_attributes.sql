-- target: branch,production
-- additive: yes
-- guard: custom/entity_types_guard
--
-- REC-32 · REC-33 · REC-34 · REC-52 — THE REGISTRY ANSWERS A TYPE.
--
-- WHAT THIS FILE IS, AND THE ONE THING IT IS NOT
-- ----------------------------------------------
-- `platform.entity_types` today answers HOW A TABLE IS ENFORCED — `rls_variant`
-- (seven values, `detail` among them since 2026-09-16), `audit_class`,
-- `is_component`, `is_active`. It does not answer WHAT A TABLE IS. The Doctrine's
-- seven types — Entity · Detail · Reference · Ledger · Restricted · System ·
-- Deprecated — are a different axis, and REC-33 says both sit on ONE registry.
-- So this file adds the type axis beside the enforcement axis. It does not move,
-- rename or reinterpret a single live value: after it applies, every function
-- that switches on `rls_variant`, `audit_class`, `is_component` or `is_active`
-- reads exactly what it read before, and nothing in either repository reads the
-- new columns at all.
--
-- WHY `type` MAY DEPART FROM THE DERIVATION, AND WHY THAT COSTS A SENTENCE
-- -----------------------------------------------------------------------
-- DD-062 §1.2 publishes the derivation from the enforcement axis, first match
-- wins, and `entity_types_type_is_derived_or_explained` enforces it. But a
-- derivation reads the word on the row, and W1-CLASS read what is ENFORCED: five
-- `component` tables carry a trigger that raises on every UPDATE and DELETE,
-- which is a Ledger's discipline whatever the variant says; `users.user_secrets`
-- holds secrets. Those rows carry a `type` the derivation does not produce — and
-- the CHECK then REQUIRES `type_reason`, so a departure is never silent and never
-- a typo. The 24 rows that point at nothing keep the same rule.
--
-- WHY THE THREE CHECKS ARE NOT IN THIS FILE, AND WHERE THEY ARE
-- -------------------------------------------------------------
-- Rule 27 says this file applies TWICE with the same result. `ADD COLUMN` takes
-- `IF NOT EXISTS`; `ADD CONSTRAINT` does not, and the guard that would make it
-- idempotent is a DO block, which §6b.2's allow-list refuses outright in a file
-- that names production — correctly, because a DO block can build DDL the scan
-- cannot read. Measured: a second apply of the earlier draft raised SQLSTATE
-- 42710 on `entity_types_type_is_one_of_seven`. So the closed-seven CHECK, the
-- REC-52 equality and DD-062 §1.2's derivation CHECK live in
-- `w1_reg_the_classification_lands.sql`, which is `-- target: branch` and may
-- guard them — and this file is exactly what §1's `W1-REG` row says lands on
-- production: THE NEW ATTRIBUTE COLUMNS AND NOTHING ELSE.
--
-- WHAT LANDS ON PRODUCTION IS THIS FILE AND NOTHING ELSE (§1's `W1-REG` row).
-- The backfill, the classification, the virtual tokens and the deprecations are
-- branch-only files, because each of them needs a DROP CONSTRAINT or an UPDATE
-- and §6b.2's allow-list refuses both at `--target production` — correctly.
--
-- REVERSIBLE: `migrations/inverse/w1_reg_registry_attributes_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

alter table platform.entity_types
  add column if not exists type text;

alter table platform.entity_types
  add column if not exists type_reason text;

alter table platform.entity_types
  add column if not exists custom_fields_enabled boolean not null default false;

comment on column platform.entity_types.type is
  'REC-32/REC-33: the Doctrine''s table type, one of the seven closed values — entity, detail, reference, ledger, restricted, system, deprecated. The type axis, not the enforcement axis: rls_variant/audit_class/is_component keep their exact meaning and every live function keeps switching on them.';

comment on column platform.entity_types.type_reason is
  'REC-32: why this row''s type departs from DD-062 §1.2''s derivation from the enforcement axis. Required by entity_types_type_is_derived_or_explained whenever it does, so a departure is a sentence and never a typo.';

comment on column platform.entity_types.custom_fields_enabled is
  'REC-34/REC-52 (Doctrine §4.4): true for Entity and Detail, false for the other five. Held equal to (type in (entity, detail)) by entity_types_custom_fields_follow_type rather than by a backfill anybody can drift.';
