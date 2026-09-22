-- additive: yes
-- guard: custom/system_enabled
--
-- chair-step: it GRANTS EXECUTE to `authenticated` on TWO existing functions of schema
--   `custom` (`custom.field_kinds()` and `custom.doc_signature_intact(uuid, uuid)`), and a
--   GRANT is the one shape this runner's allow-list refuses by name. It is the whole point of
--   the file: both functions already exist, both are already read by a screen, and neither
--   could be called by a browser. No function body is created, replaced, dropped or revoked;
--   no row of any feature is deleted or rewritten. Each grant is preceded by its
--   `platform.client_callable_door` declaration, which is the required order. The inverse is
--   `migrations/inverse/fix10b_the_registry_and_the_seal_are_reachable_from_a_screen_down.sql`.
--
-- LANE FIX-10B — two doors a screen must call, measured unreachable from the admin seat on
-- 2026-09-22 while proving VERIFIER-10 F6.
--
-- 1. `custom.field_kinds()` IS THE REGISTRY, AND NOTHING COULD READ IT. Sub-lane FIX-10B-F6
--    built it as THE ONE published list of every kind a column can be, precisely so the
--    Add-field panel stops retyping its own list and `signature` becomes pickable. Called
--    from the admin seat through the client door it answers `42501 permission denied for
--    function field_kinds`. Its older sibling `custom.parity_field_types()` — the fourteen-row
--    parity floor the registry SELECTS from — has both a door row and the grant, which is the
--    precedent this file follows exactly. Without this the fix reaches no screen at all: a
--    registry no client may read is the same list retyped, one indirection later.
--
-- 2. `custom.doc_signature_intact(uuid, uuid)` IS HOW A SCREEN ASKS WHETHER A SEAL STILL
--    HOLDS, AND IT ANSWERS NOBODY. `@ai-matrx/records-ui`'s `SignBlock` calls it once per
--    signature, for every signature it lists. From a browser that is `42501` every time. Its
--    two siblings on the same screen, `custom.doc_signature_read` and `custom.doc_signatures`,
--    are both declared and granted; this one was missed. So the e-sign half of Documents could
--    write a seal it could never verify out loud — the sealed hash VERIFIER-10 names as the
--    point of the feature.
--
-- BOTH ARE SECURITY INVOKER, and that is left exactly as it is. EXECUTE is not authority here:
-- `field_kinds` is a constant list of words with no organization in it, and
-- `doc_signature_intact` reads as the CALLER, so every row it can see is a row this person
-- could already read. Granting EXECUTE on an invoker function adds no reach; withholding it
-- only made the screen lie.

-- ── 1. THE REGISTRY ──────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', 'field_kinds', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false,
       'migrations/campaign/fix10b_the_registry_and_the_seal_are_reachable_from_a_screen.sql (lane FIX-10B)',
       'THE ONE list of every kind a column can be. The Add-field panel reads it instead of carrying its own copy, so a kind the store accepts is never invisible to a screen (VERIFIER-10 F6: signature was). A constant list of words with no organization in it.'
  from pg_proc p
 where p.proname = 'field_kinds' and p.pronamespace = 'custom'::regnamespace
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = 'field_kinds'
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.field_kinds() to authenticated;

-- ── 2. THE SEAL ──────────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', 'doc_signature_intact', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false,
       'migrations/campaign/fix10b_the_registry_and_the_seal_are_reachable_from_a_screen.sql (lane FIX-10B)',
       'Ask whether a signature still seals the document it was made on. SignBlock calls it once per signature; without the grant the screen that shows a seal could never say whether it holds. SECURITY INVOKER, so it sees only what the caller can already read.'
  from pg_proc p
 where p.proname = 'doc_signature_intact' and p.pronamespace = 'custom'::regnamespace
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = 'doc_signature_intact'
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.doc_signature_intact(uuid, uuid) to authenticated;
