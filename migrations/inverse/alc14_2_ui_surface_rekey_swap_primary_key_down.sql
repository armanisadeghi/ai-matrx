-- chair-step: the inverse of migrations/alc14_2_ui_surface_rekey_swap_primary_key.sql (ALC-14 re-key step 2)
--   — puts the primary keys back on (surface_name, name) using the step-1 twin indexes, and
--   re-creates the (surface_name, item_type, name) unique indexes step 2 consumed. Refuses if any
--   row carries a non-empty item_type that shares a screen value's name (the twin forbids it anyway).
--   Brief ACCESS EXCLUSIVE on both tables; 1–4 AM PT window.
alter table ui.ui_surface_value
  drop constraint ui_surface_value_pkey,
  add constraint ui_surface_value_pkey primary key using index ui_surface_value_screen_key_twin;
create unique index if not exists ui_surface_value_item_key on ui.ui_surface_value (surface_name, item_type, name);

alter table ui.ui_surface_write_target
  drop constraint ui_surface_write_target_pkey,
  add constraint ui_surface_write_target_pkey primary key using index ui_surface_write_target_screen_key_twin;
create unique index if not exists ui_surface_write_target_item_key on ui.ui_surface_write_target (surface_name, item_type, name);
