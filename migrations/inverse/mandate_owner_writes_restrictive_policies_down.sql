-- chair-step: removes the twelve restrictive *_owner_writes_* policies on mandate.definition, binding, treatment and provision, which puts back the defect where an ordinary org member could update or soft-delete an org-homed mandate, its org binding or its presentation directly through supabase-js. Use only to undo mandate_owner_writes_restrictive_policies.sql.
-- window-class: twelve DROP POLICY on four mandate tables; ACCESS EXCLUSIVE on them plus the 23-relation supautils set until commit

drop policy if exists definition_owner_writes_insert on mandate.definition;
drop policy if exists definition_owner_writes_update on mandate.definition;
drop policy if exists definition_owner_writes_delete on mandate.definition;
drop policy if exists binding_owner_writes_insert on mandate.binding;
drop policy if exists binding_owner_writes_update on mandate.binding;
drop policy if exists binding_owner_writes_delete on mandate.binding;
drop policy if exists treatment_owner_writes_insert on mandate.treatment;
drop policy if exists treatment_owner_writes_update on mandate.treatment;
drop policy if exists treatment_owner_writes_delete on mandate.treatment;
drop policy if exists provision_owner_writes_insert on mandate.provision;
drop policy if exists provision_owner_writes_update on mandate.provision;
drop policy if exists provision_owner_writes_delete on mandate.provision;
