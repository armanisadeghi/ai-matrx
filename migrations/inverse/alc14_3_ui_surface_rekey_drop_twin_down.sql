-- chair-step: the inverse of migrations/alc14_3_ui_surface_rekey_drop_twin.sql (ALC-14 re-key step 3)
--   — re-creates the (surface_name, name) twin unique indexes. Fails by design once any item type
--   has declared a value whose name a screen value also uses; remove those rows first, on purpose.
create unique index if not exists ui_surface_value_screen_key_twin on ui.ui_surface_value (surface_name, name);
create unique index if not exists ui_surface_write_target_screen_key_twin on ui.ui_surface_write_target (surface_name, name);
