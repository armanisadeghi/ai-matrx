-- short_links_share_alias_and_client_mint.sql
-- Applied live via the Supabase MCP on 2026-08-29 (project brsgrqvjdzwihsvnfqkf) and
-- ledgered in public._schema_migrations (source='matrx-frontend'). The file is the RECORD.
--
-- ══════════════════════════════════════════════════════════════════════════════════════
-- EVERY SHARE LINK GETS A SHORT ALIAS, AND CLIENTS GET A MINT DOOR (owner ruling,
-- 2026-08-29: "auto-shorten every share link").
--
-- The platform short-link primitive is aidream migration 0557 (platform.short_links;
-- SoR common-docs/systems/platform/short-links/STATE.md). This migration wires the
-- sharing system and the clients onto it:
--
--   A. `platform.share_links.short_token` — every share link minted from now on ALSO
--      gets a short alias `/r/<token>` targeting its own `/s/<share-token>` URL, and
--      the 172 live active links are backfilled. 🚨 THE ALIAS MOVES NO SECURITY:
--      the short link redirects to the /s/ page, and revoked/expired/exhausted shares
--      still get that page's honest refusal — the 64-hex share token remains the one
--      authorization. Alias expiry = the share's expiry + 7 days grace, or 100 years
--      for a permanent-until-revoked share (expiry is a statement, not a gate — the
--      /s/ resolution is the gate).
--
--   B. `public.shorten_app_url` — the AUTHENTICATED mint door (declared client door,
--      §6d-4). Any signed-in member of an organization can shorten a same-app path
--      under that org. This is what makes the shortener a five-minute add in any
--      client: @ai-matrx/kit/short-link's `mintShortLink()` and the
--      `CopyShortLinkButton` (kit 0.6.0) call this door — no bespoke logic in any app.
--      It grants nothing: the stored value is a PATH, CHECK-constrained same-app.
-- ══════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── A1. The alias column ─────────────────────────────────────────────────────────────
alter table platform.share_links add column if not exists short_token text;
comment on column platform.share_links.short_token is
  'Token of this link''s short alias in platform.short_links (/r/<token> -> /s/<token>). '
  'A URL alias ONLY — carries no authorization; NULL when the alias could not be minted '
  '(the full /s/ URL is always valid).';
create index if not exists share_links_short_token_idx on platform.share_links (short_token);

-- ── A2. ONE mint body for both the create path and the backfill ─────────────────────
create or replace function platform._mint_share_short_alias(p_share_id uuid)
returns text
language plpgsql
security definer
set search_path to 'platform', 'public'
as $function$
declare
  v_share platform.share_links%rowtype;
  v_tok   text;
begin
  select * into v_share from platform.share_links where id = p_share_id;
  if not found or v_share.organization_id is null then
    -- NO NULL ORG: a short link is never minted without its org; the share keeps
    -- its full /s/ URL, which always works.
    return null;
  end if;
  if v_share.short_token is not null then
    return v_share.short_token;
  end if;
  v_tok := platform.create_short_link(
    '/s/' || v_share.token,
    v_share.organization_id,
    coalesce(v_share.expires_at + interval '7 days', now() + interval '100 years'),
    'sharing',
    jsonb_build_object('share_link_id', v_share.id));
  update platform.share_links set short_token = v_tok where id = v_share.id;
  return v_tok;
exception when others then
  -- A failed alias must never fail the share: the /s/ URL is complete on its own.
  raise warning 'share short-alias mint failed for %: %', p_share_id, sqlerrm;
  return null;
end
$function$;
revoke all on function platform._mint_share_short_alias(uuid) from public;

-- ── A3. create_share_link mints the alias and returns it ────────────────────────────
-- Body is the live definition + the alias mint and the short_token in the answer.
create or replace function public.create_share_link(
  p_resource_type text, p_resource_id uuid, p_permission_level text default 'viewer',
  p_expires_at timestamptz default null, p_max_uses integer default null,
  p_label text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE v_uid uuid := auth.uid(); v_resolved record; v_token text; v_id uuid; v_org uuid;
        v_shareable boolean; v_short text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF COALESCE(p_permission_level,'viewer') NOT IN ('viewer','editor','admin') THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid permission level'); END IF;
  BEGIN SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;
  SELECT COALESCE(is_link_shareable, false) INTO v_shareable FROM platform.shareable_resource_registry WHERE resource_type = v_resolved.resource_type;
  IF NOT v_shareable THEN RETURN jsonb_build_object('success', false, 'error', 'Public link sharing is not enabled for this item type'); END IF;
  IF NOT public.is_resource_owner(v_resolved.resource_type, p_resource_id) THEN RETURN jsonb_build_object('success', false, 'error', 'Only the owner can create a share link'); END IF;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  BEGIN EXECUTE format('SELECT organization_id FROM %I.%I WHERE %I = $1', v_resolved.schema_name, v_resolved.table_name, v_resolved.id_column) INTO v_org USING p_resource_id;
  EXCEPTION WHEN OTHERS THEN v_org := NULL; END;
  INSERT INTO platform.share_links (resource_type, resource_id, token, permission_level, created_by, organization_id, expires_at, max_uses, label)
  VALUES (v_resolved.resource_type, p_resource_id, v_token, COALESCE(p_permission_level,'viewer')::permission_level, v_uid, v_org, p_expires_at, p_max_uses, p_label)
  RETURNING id INTO v_id;
  -- Auto-shorten every share link (owner ruling 2026-08-29). NULL when it cannot
  -- mint — the /s/ URL is always complete on its own.
  v_short := platform._mint_share_short_alias(v_id);
  RETURN jsonb_build_object('success', true, 'token', v_token, 'id', v_id,
                            'resource_type', v_resolved.resource_type,
                            'short_token', v_short);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $function$;

-- ── A4. list_share_links returns the alias (return-type change needs drop) ──────────
drop function if exists public.list_share_links(text, uuid);
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
values
  ('public','list_share_links','p_resource_type text, p_resource_id uuid','short-links (share alias)',
   'Owner-only listing of a resource''s share links; re-declared because the alias rollout recreates it with short_token in the answer.'),
  ('public','create_share_link','p_resource_type text, p_resource_id uuid, p_permission_level text, p_expires_at timestamp with time zone, p_max_uses integer, p_label text','short-links (share alias)',
   'Owner-only share-link mint; re-declared alongside the alias rollout (now also mints the /r short alias).')
on conflict do nothing;

create function public.list_share_links(p_resource_type text, p_resource_id uuid)
returns table(id uuid, token text, short_token text, permission_level text, label text,
              expires_at timestamptz, max_uses integer, use_count integer,
              is_active boolean, created_at timestamptz, last_used_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE v_resolved record;
BEGIN
  BEGIN SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN; END;
  IF NOT public.is_resource_owner(v_resolved.resource_type, p_resource_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT l.id, l.token, l.short_token, l.permission_level::text, l.label, l.expires_at,
         l.max_uses, l.use_count, l.is_active, l.created_at, l.last_used_at
  FROM platform.share_links l
  WHERE l.resource_type = v_resolved.resource_type AND l.resource_id = p_resource_id
  ORDER BY l.created_at DESC;
END; $function$;
revoke all on function public.list_share_links(text, uuid) from public;
grant execute on function public.list_share_links(text, uuid) to authenticated, service_role;
revoke all on function public.create_share_link(text, uuid, text, timestamptz, integer, text) from public;
grant execute on function public.create_share_link(text, uuid, text, timestamptz, integer, text) to authenticated, service_role;

-- ── A5. Backfill the live links (172 active at write time, 0 with NULL org) ─────────
do $$
declare r record; n integer := 0;
begin
  for r in select id from platform.share_links where is_active and short_token is null loop
    if platform._mint_share_short_alias(r.id) is not null then n := n + 1; end if;
  end loop;
  raise notice 'share short-alias backfill minted % aliases', n;
end $$;

-- ── B. The AUTHENTICATED mint door — what makes the kit a five-minute add ───────────
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
values ('public','shorten_app_url','p_path text, p_organization_id uuid, p_expires_at timestamp with time zone','short-links (client mint)',
  'Signed-in members shorten a same-app path under their org; called by @ai-matrx/kit/short-link mintShortLink()/CopyShortLinkButton. Grants nothing — the stored value is a CHECK-constrained same-app PATH and the target route''s own auth gates.')
on conflict do nothing;

create or replace function public.shorten_app_url(
  p_path text, p_organization_id uuid, p_expires_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'platform', 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_tok text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;
  if p_organization_id is null or not iam.is_org_member(v_uid, p_organization_id) then
    return jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  end if;
  if p_path is null or left(p_path, 1) <> '/' or left(p_path, 2) = '//' then
    return jsonb_build_object('ok', false, 'error', 'Only a same-app path (starting with a single "/") can be shortened');
  end if;
  begin
    v_tok := platform.create_short_link(
      p_path, p_organization_id,
      coalesce(p_expires_at, now() + interval '365 days'),
      'client:' || coalesce(nullif(btrim(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-client-info'), ''), 'app'),
      jsonb_build_object('minted_by', v_uid));
  exception when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
  return jsonb_build_object('ok', true, 'token', v_tok);
end
$function$;
revoke all on function public.shorten_app_url(text, uuid, timestamptz) from public;
grant execute on function public.shorten_app_url(text, uuid, timestamptz) to authenticated, service_role;

-- Supabase's ALTER DEFAULT PRIVILEGES hands anon EXECUTE to every newly-created
-- public function; `revoke ... from public` does not strip that role-specific
-- default. Both functions refuse a NULL auth.uid() internally, but the grant is
-- still wrong — minting and listing are signed-in operations.
revoke execute on function public.list_share_links(text, uuid) from anon;
revoke execute on function public.shorten_app_url(text, uuid, timestamptz) from anon;

comment on function public.shorten_app_url(text, uuid, timestamptz) is
  'The client mint door for platform short links: signed-in org members shorten a '
  'same-app path (default expiry 365 days). Grants nothing — see '
  'common-docs/systems/platform/short-links/STATE.md.';

commit;
