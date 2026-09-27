-- chair-step: INVERSE of migrations/campaign/registrykernel_a_level_move_bumps_the_kernel_fixture_in_its_own_transaction.sql (lane REGISTRY-KERNEL-CHECK). Disarms the eight registry triggers so a registry change no longer runs the kernel equivalence check — a level move then moves the kernel's answers silently again (the class the up closed). DISABLE, not DROP: DROP TRIGGER drags in Supabase's supautils lock set (23 auth/storage/realtime relations at ACCESS EXCLUSIVE, window-class, scripts/lib/ddl-lock-footprint.json), DISABLE takes SHARE ROW EXCLUSIVE on the one table. The three functions stay (the disabled triggers name them); re-applying the up re-arms the triggers. Any patch a bump made to platform.kernel_equivalence_expected() stays (it is the recording of answers the registry really gives), and every platform.kernel_fingerprint_record / ops.system_error row stays: append-only evidence.
ALTER TABLE platform.entity_types DISABLE TRIGGER _kernel_answers_before_a_registry_change;
ALTER TABLE platform.entity_types DISABLE TRIGGER zzz_kernel_answers_follow_the_registry_i;
ALTER TABLE platform.entity_types DISABLE TRIGGER zzz_kernel_answers_follow_the_registry_u;
ALTER TABLE platform.entity_types DISABLE TRIGGER zzz_kernel_answers_follow_the_registry_d;
ALTER TABLE platform.entity_relationships DISABLE TRIGGER _kernel_answers_before_a_registry_change;
ALTER TABLE platform.entity_relationships DISABLE TRIGGER zzz_kernel_answers_follow_the_registry_i;
ALTER TABLE platform.entity_relationships DISABLE TRIGGER zzz_kernel_answers_follow_the_registry_u;
ALTER TABLE platform.entity_relationships DISABLE TRIGGER zzz_kernel_answers_follow_the_registry_d;
