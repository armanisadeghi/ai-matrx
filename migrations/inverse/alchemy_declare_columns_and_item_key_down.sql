-- chair-step: the inverse of migrations/alchemy_declare_columns_and_item_key.sql (Matrx Alchemy ALC-14 re-key step 1)
--   — drops the item-type table, the new key and its twin indexes, the added columns and checks, and
--   restores the original mode / apply_policy checks. Refuses (by the restored CHECKs) if any row was
--   written with mode 'stream' or apply_policy 'queued' in between — delete those first, on purpose.
--   Takes brief ACCESS EXCLUSIVE locks on ui_surface_value, ui_surface_write_target,
--   ui_surface_client_tool and ui_surface; run it in the 1–4 AM PT window.
drop index if exists ui.ui_surface_value_item_key;
drop index if exists ui.ui_surface_value_screen_key_twin;
drop index if exists ui.ui_surface_write_target_item_key;
drop index if exists ui.ui_surface_write_target_screen_key_twin;

drop table if exists ui.ui_surface_item_type;
delete from platform.entity_types where token = 'ui_surface_item_type';

alter table ui.ui_surface drop column if exists content_hash;

alter table ui.ui_surface_client_tool
  drop constraint if exists ui_surface_client_tool_mode_check,
  add constraint ui_surface_client_tool_mode_check check (mode in ('draft', 'entity', 'ui'));

alter table ui.ui_surface_write_target
  drop constraint if exists ui_surface_write_target_item_type_chk,
  drop constraint if exists ui_surface_write_target_stream_ops_check,
  drop constraint if exists ui_surface_write_target_approval_comparison_check,
  drop constraint if exists ui_surface_write_target_mode_check,
  add constraint ui_surface_write_target_mode_check check (mode in ('draft', 'entity', 'ui')),
  drop constraint if exists ui_surface_write_target_apply_policy_check,
  add constraint ui_surface_write_target_apply_policy_check check (apply_policy in ('manual', 'ask', 'auto')),
  drop column if exists item_type,
  drop column if exists destination,
  drop column if exists stream_ops,
  drop column if exists approval_comparison,
  drop column if exists patchable;

alter table ui.ui_surface_value
  drop constraint if exists ui_surface_value_item_type_chk,
  drop constraint if exists ui_surface_value_role_check,
  drop constraint if exists ui_surface_value_live_slot_check,
  drop constraint if exists ui_surface_value_classification_check,
  drop column if exists item_type,
  drop column if exists role,
  drop column if exists live_slot,
  drop column if exists kind_key,
  drop column if exists included_by_default,
  drop column if exists classification,
  drop column if exists exportable;
