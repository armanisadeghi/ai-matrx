-- platform_stamp_actor_authuid_fallback.sql
-- ---------------------------------------------------------------------------
-- Architecture fix: make the shared actor-stamp trigger work over PostgREST.
--
-- _stamp_actor reads the acting user from current_setting('app.user_id'), which
-- the aidream backend sets — but PostgREST (the browser -> Supabase path) sets
-- request.jwt.claims, NOT app.user_id. So over PostgREST `uid` was always NULL
-- and created_by/updated_by only got stamped because the client passed them
-- explicitly. That made the canonical INSERT check (created_by = auth.uid())
-- silently dependent on every client remembering to send created_by.
--
-- Fix (strictly additive): fall back to (select auth.uid()) when app.user_id is
-- unset. Backend path unchanged (app.user_id still wins); browser path now
-- auto-stamps the actor from the JWT. Applies to every table carrying the shared
-- _stamp_actor trigger.
--
-- Idempotent (CREATE OR REPLACE). Trigger attachments unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION platform._stamp_actor()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  uid uuid := COALESCE(
    NULLIF(current_setting('app.user_id', true), '')::uuid,  -- backend-set actor (wins)
    (SELECT auth.uid())                                       -- PostgREST JWT actor (fallback)
  );
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, uid);
  END IF;
  NEW.updated_by := COALESCE(uid, NEW.updated_by);
  RETURN NEW;
END
$function$;
