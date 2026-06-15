-- ctx_lock_down_is_system.sql
--
-- 🔒 CRITICAL SECURITY FIX. is_system makes a scope type's context items resolve for EVERY
-- user platform-wide. The gated RPC (admin_set_scope_type_system) checks is_super_admin(),
-- but it was NOT the only write path: ctx_scope_types RLS lets an org OWNER/ADMIN UPDATE
-- their own rows, and authenticated/anon hold column-level UPDATE/INSERT grants — so a
-- non-super-admin could flip is_system with a direct table write and broadcast their org's
-- private context to the whole platform. (Same class as the prior cross-tenant leaks.)
--
-- Two-layer lock-down (defense in depth):
--   1) REVOKE the direct column grants → writes to is_system can't go through PostgREST.
--   2) A BEFORE trigger that rejects any INSERT/UPDATE changing is_system unless the caller
--      is a super admin — grant-independent, survives any future grant drift, and applies
--      even inside the SECURITY DEFINER RPC (where is_super_admin() still reads the caller's
--      JWT and passes for super admins).
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus). Idempotent.

REVOKE INSERT (is_system), UPDATE (is_system) ON public.ctx_scope_types FROM authenticated;
REVOKE INSERT (is_system), UPDATE (is_system) ON public.ctx_scope_types FROM anon;

CREATE OR REPLACE FUNCTION public._guard_scope_type_is_system()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_system IS TRUE AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'only super admins can create a System scope type'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_system IS DISTINCT FROM OLD.is_system AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'only super admins can change a scope type''s System flag'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_scope_type_is_system ON public.ctx_scope_types;
CREATE TRIGGER guard_scope_type_is_system
  BEFORE INSERT OR UPDATE ON public.ctx_scope_types
  FOR EACH ROW EXECUTE FUNCTION public._guard_scope_type_is_system();
