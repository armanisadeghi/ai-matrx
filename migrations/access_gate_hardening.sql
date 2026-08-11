-- Access Gate hardening — the seven defects found by the adversarial pass,
-- 2026-08-11. Applied live in two migrations of the same name family:
--   access_gate_hardening_allow_preview   (rename + write path + kind-only set)
--   access_gate_hardening_request_rpcs    (race, self-decide, dead-target)
--   access_gate_denied_context_decision_note (project the decline reason)
--
-- Recorded here as one file so the ledger and the repo agree. Every statement
-- below is idempotent (CREATE OR REPLACE / IF EXISTS), so a fresh database
-- reaches the same state by running the access_gate_* files in filename order.

-- 1. THE FLAG WAS NAMED BACKWARDS (deny_preview=true meant MAXIMUM disclosure).
--    access_gate_access_requests.sql now creates it as allow_preview directly;
--    this line is the safety net for a database that predates that fix.
alter table platform.entity_types
  add column if not exists allow_preview boolean not null default true;

comment on column platform.entity_types.allow_preview is
  'When TRUE (default), access_denied_context may tell a signed-in user who cannot open a row its title, owner and organization, so they know what they are asking for and whom to ask. When FALSE, only the entity KIND is revealed. Set false for entities whose title is derived from private content rather than deliberately authored. Flip it with admin_set_entity_type_preview.';

-- 2. CONTENT-DERIVED TITLES LEAKED. A conversation title is generated FROM its
--    content; a canonical page's title column IS the private URL.
update platform.entity_types
   set allow_preview = false
 where token in ('conversation', 'web_page');

-- 3. THE KILL SWITCH HAD NO WRITE PATH. Mirrors admin_set_entity_type_active.
create or replace function public.admin_set_entity_type_preview(
  p_token text,
  p_allow boolean
)
returns boolean
language plpgsql volatile security definer
set search_path to 'public', 'platform'
as $function$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can change preview disclosure.'
      using errcode = '42501';
  end if;
  update platform.entity_types
     set allow_preview = coalesce(p_allow, true)
   where token = p_token;
  if not found then
    raise exception 'Unknown entity type: %', p_token using errcode = '22023';
  end if;
  return true;
end;
$function$;

revoke all on function public.admin_set_entity_type_preview(text, boolean) from public;
grant execute on function public.admin_set_entity_type_preview(text, boolean) to authenticated;
