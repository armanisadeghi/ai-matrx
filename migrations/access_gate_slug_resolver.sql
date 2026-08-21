-- Access Gate — the slug resolver.
--
-- `public.access_denied_context(p_type, p_id uuid)` needs the record's uuid,
-- but slug-addressed routes (`/organizations/[orgId]` accepts a slug) have no
-- uuid to ask about when the RLS-filtered read came back empty: the client
-- cannot resolve a slug it is not allowed to read. So the gate could only say
-- "this address didn't match" — for a record that exists, is nameable under
-- the disclosure ruling, and whose owner could be asked.
--
-- This closes that gap: resolve (type, slug) -> uuid so the surface can then
-- ask `access_denied_context` the real question.
--
-- DISCLOSURE. Returning a uuid reveals only EXISTENCE. The 2026-08-11 owner
-- ruling already grants a signed-in user kind + name + owner + org for any
-- record they land on, so existence is strictly less than what the next call
-- discloses. Anonymous callers learn nothing — not even that the slug maps to
-- anything — same as the context resolver itself. `allow_preview = false`
-- types reduce disclosure to kind-only in the CONTEXT call; existence via a
-- slug the caller was handed is still within that (the kind-only screen reads
-- identically), but a new slug type whose SLUG is itself content (the
-- `web_page` test: would naming it reveal what's inside?) must not be added
-- here.
--
-- Types are registered EXPLICITLY, one case each. No dynamic SQL over the
-- entity registry: a slug column is not part of the registry contract, and a
-- generic path would silently do the wrong thing for tables whose "slug" has
-- different uniqueness or visibility semantics.

create or replace function public.access_gate_resolve_slug(
  p_type text,
  p_slug text
)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public', 'platform', 'iam'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  -- Anonymous callers learn nothing about any row — not even that the slug
  -- resolves. The signed-out gate screen invites sign-in either way.
  if v_uid is null then
    return null;
  end if;

  if p_type is null or p_slug is null or length(p_slug) = 0 then
    return null;
  end if;

  case p_type
    when 'organization' then
      -- Exact match, mirroring the client's own slug read
      -- (features/organizations/service.ts::getOrganizationBySlug).
      select o.id into v_id
      from iam.organizations o
      where o.slug = p_slug
      limit 1;
    else
      -- Unregistered type: not an error, simply nothing to resolve. The
      -- calling surface keeps its honest "address didn't match" answer.
      v_id := null;
  end case;

  return v_id;
end;
$function$;

comment on function public.access_gate_resolve_slug(text, text) is
  'Access Gate: resolve a slug-addressed record to its uuid so access_denied_context can answer truthfully. Signed-in only; anonymous callers get null (no enumeration). Explicit per-type registration — see migration header before adding a type.';

revoke all on function public.access_gate_resolve_slug(text, text) from public;
grant execute on function public.access_gate_resolve_slug(text, text) to anon, authenticated;
