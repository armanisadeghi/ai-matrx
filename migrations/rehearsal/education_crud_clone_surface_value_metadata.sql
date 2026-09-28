-- target: clone
-- Additive test-database convergence to the existing canonical ui value metadata.
-- Production already has this nullable integer column. No records or access policies change.
alter table ui.ui_surface_value add column if not exists max_inline_chars integer;
