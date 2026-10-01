-- INVERSE of migrations/campaign/readinessparity_b_scope_tables_refuse_writes_outside_the_doors.sql (lane READINESS-PARITY).
-- window-class: DROP TRIGGER takes SHARE ROW EXCLUSIVE on each of the four scope tables (watched window only).
-- lane: READINESS-PARITY
DROP TRIGGER IF EXISTS aaa_refuse_writes_outside_the_doors ON context.scope_types;
DROP TRIGGER IF EXISTS aaa_refuse_writes_outside_the_doors ON context.scopes;
DROP TRIGGER IF EXISTS aaa_refuse_writes_outside_the_doors ON context.context_items;
DROP TRIGGER IF EXISTS aaa_refuse_writes_outside_the_doors ON context.context_item_values;
DROP FUNCTION IF EXISTS context._refuse_writes_outside_the_doors();
