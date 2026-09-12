-- THE VALUE CONTRACT, mirrored (WP1, 2026-09-11).
--
-- `SurfaceWriteTarget.valueKind` (features/surfaces/types.ts) names the
-- registered Kind whose `emitted_json_schema` IS the contract for the value a
-- write target accepts. The mirror carries it so the SERVER half of the 360
-- loop can state it too: aidream's `surface_resolver.py` reads the column and
-- `_write_targets_block` prints `kind=<slug>` beside the target, which is how
-- a server-side agent learns the shape without guessing at prose.
--
-- Nullable by design and deliberately NOT constrained to a kind registry the
-- database cannot see: this table is a read-only projection of code (written
-- by manifest-sync.service.ts), and the authority on whether a slug is
-- registered is `pnpm check:surface-drift` at author time plus
-- `validateAgainstKind` at write time. A FK here would make a kind rename a
-- sync failure instead of a drift report.

alter table ui.ui_surface_write_target
  add column if not exists kind_key text;

comment on column ui.ui_surface_write_target.kind_key is
  'Registered content_ir kind slug whose emitted_json_schema is the value contract for this write target (SurfaceWriteTarget.valueKind). NULL = no declared contract; required in code for object/array targets (ratcheted). Synced from code — never hand-edit.';
