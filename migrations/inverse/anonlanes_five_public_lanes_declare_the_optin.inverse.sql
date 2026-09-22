-- INVERSE of migrations/campaign/anonlanes_five_public_lanes_declare_the_optin.sql (lane ANON-LANES)
--
-- Clears the five declarations. It deliberately does NOT revoke `anon`'s column grants: those
-- ACLs predate the declaration by weeks and are what five live signed-out pages read. Undoing the
-- DECLARATION is the inverse of declaring it; undoing the ACCESS would be a different change, and
-- a destructive one.
--
-- 🚨 Run this WITH the twin file's inverse, never without it. Once
-- `iam.apply_table_grants` carries the withdrawal arm, an undeclared table with a LIVE anonymous
-- lane makes the generator REFUSE (42501) rather than silently delete a public page — so clearing
-- these five flags while the arm is installed leaves five tables that cannot be regenerated until
-- somebody re-declares them or rules them closed. That refusal is the design working, not a bug.

update platform.entity_types
   set client_anonymous_public_read = false,
       client_anonymous_public_read_reason = null,
       client_anonymous_excluded_columns = null
 where (schema_name, table_name) in
       (('app','definition'),('education','learn_doc'),('agent','message_template'),
        ('workbench','notes'),('canvas','canvas_items'));
