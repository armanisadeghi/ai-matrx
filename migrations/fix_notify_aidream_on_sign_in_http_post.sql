-- Fix: notify_aidream_on_sign_in() trigger function calls extensions.http_post(...)
-- which no longer exists. The pg_net extension exposes net.http_post(...). The
-- broken signature caused every OAuth/PKCE token exchange and every new-user
-- INSERT on auth.users to fail with:
--   ERROR: function extensions.http_post(url => unknown, headers => jsonb,
--          body => jsonb) does not exist (SQLSTATE 42883)
-- → Supabase auth returned 500 "Database error granting user"
-- → /auth/callback exchangeCodeForSession errored
-- → user saw "Authentication failed. Please try again." on the login page.
--
-- Fix: swap extensions.http_post → net.http_post (same named args work) and
-- wrap the call so a webhook failure never blocks sign-in again.

create or replace function public.notify_aidream_on_sign_in()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'net'
as $function$
begin
  begin
    perform net.http_post(
      url := 'https://server.app.matrxserver.com/api/auth/on-sign-in',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer HH58/Q4NSBxi/JeZIXfBdIU+LjJ5HyixGheY9E5F7TEIYWCj4ADZ13CRy3eBUcgy'
      ),
      body := jsonb_build_object(
        'type', TG_OP,
        'table', 'users',
        'schema', 'auth',
        'record', row_to_json(NEW)
      )
    );
  exception when others then
    raise warning 'notify_aidream_on_sign_in webhook failed: % (%), user=%', sqlerrm, sqlstate, NEW.id;
  end;
  return NEW;
end;
$function$;
