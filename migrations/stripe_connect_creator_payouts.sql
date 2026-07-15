-- stripe_connect_creator_payouts.sql
--
-- Convergence C — real money movement for creators. Turns the edu_class_purchase
-- STUB into a Stripe Connect (Express) marketplace: a student buys a paid class
-- via Stripe Checkout with an application_fee (platform cut) + a transfer to the
-- creator's Connect account; the webhook (service_role) confers the enrolment.
--
-- Split model: platform 20% / creator 80% (config in lib/stripe/connect.ts; the
-- application_fee_amount is computed there and passed to Stripe — the DB only
-- records what happened).
--
-- Protected-resources posture (billing.* deny-by-default): the two new tables get
-- RLS with NO authenticated write path. Writes happen ONLY through the webhook /
-- server routes via the service_role admin client. The paid GATE is WEBHOOK-ONLY:
-- edu_class_confer_purchase / _revoke_purchase are EXECUTE-granted to service_role
-- alone (revoked from anon+authenticated), so a client can NEVER self-grant paid
-- access — the exact bypass the security review flagged on the stub.
--
-- Idempotent (safe to re-run).

-- ─── billing.connect_account ────────────────────────────────────────────────────
-- One row per creator who connected a Stripe Express account. charges_enabled is
-- the "can receive payouts" gate; details_submitted drives the "finish onboarding"
-- prompt. Kept fresh by the account.updated webhook + the status route.
create table if not exists billing.connect_account (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  stripe_account_id  text not null unique,
  charges_enabled    boolean not null default false,
  payouts_enabled    boolean not null default false,
  details_submitted  boolean not null default false,
  country            text,
  default_currency   text,
  onboarded_at       timestamptz,   -- first time charges_enabled flipped true
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table billing.connect_account enable row level security;
-- No permissive policy → deny-by-default for anon/authenticated. service_role
-- (admin client) bypasses RLS; reads for the owner go through creator_connect_status().

-- ─── billing.class_purchase ─────────────────────────────────────────────────────
-- The paid-class sales ledger + the refund/chargeback lookup key. A pending row is
-- inserted at checkout-session creation; the webhook flips it to paid + records the
-- payment_intent (so a later refund/dispute can find it and revoke access).
create table if not exists billing.class_purchase (
  id                          uuid primary key default gen_random_uuid(),
  buyer_user_id               uuid not null references auth.users(id) on delete cascade,
  class_id                    uuid not null,   -- the class scope id (context.scopes)
  creator_user_id             uuid not null references auth.users(id) on delete cascade,
  organization_id             uuid,
  stripe_checkout_session_id  text not null unique,
  stripe_payment_intent_id    text unique,
  stripe_account_id           text,            -- the creator's Connect account
  amount_total                integer not null,        -- cents charged to the buyer
  application_fee_amount       integer not null,        -- cents kept by the platform
  creator_amount              integer not null,        -- cents transferred to creator
  currency                    text not null default 'usd',
  status                      text not null default 'pending'
                                check (status in ('pending','paid','refunded','disputed')),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  paid_at                     timestamptz,
  refunded_at                 timestamptz
);
alter table billing.class_purchase enable row level security;
create index if not exists class_purchase_creator_idx on billing.class_purchase (creator_user_id, created_at desc);
create index if not exists class_purchase_buyer_idx   on billing.class_purchase (buyer_user_id, created_at desc);
create index if not exists class_purchase_pi_idx      on billing.class_purchase (stripe_payment_intent_id);

-- ─── The WEBHOOK-ONLY paid gate: confer / revoke enrolment ───────────────────────
-- edu_class_confer_purchase — the real replacement for the purchase stub. Confers a
-- FULL 'active' enrolment (paying IS enrolling) on the class roster (iam.memberships).
-- SECURITY DEFINER + service_role-only EXECUTE ⇒ the ONLY caller is the Stripe
-- webhook via the admin client. Idempotent (re-running on a Stripe retry is a no-op
-- upsert). Never checks owner/role — the payment IS the authorization.
create or replace function public.edu_class_confer_purchase(p_class uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_scope context.scopes; v_row iam.memberships;
begin
  if p_user is null then raise exception 'p_user is required' using errcode = '22023'; end if;
  v_scope := public._edu_class(p_class);
  select * into v_row from iam.memberships
   where container_type = 'scope' and container_id = v_scope.id
     and user_id = p_user and deleted_at is null
   order by (status = 'active') desc limit 1;
  if v_row.id is not null then
    update iam.memberships
       set status = 'active',
           role = case when role = 'owner' then 'owner' else 'member' end,
           updated_at = now(), updated_by = p_user,
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('grant_source', 'stripe_purchase')
     where id = v_row.id;
  else
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by, metadata)
    values (v_scope.organization_id, 'scope', v_scope.id, p_user, 'member', 'active', p_user,
            jsonb_build_object('grant_source', 'stripe_purchase'));
  end if;
  return jsonb_build_object('status', 'enrolled', 'user_id', p_user, 'class_id', v_scope.id);
end; $$;
revoke all on function public.edu_class_confer_purchase(uuid, uuid) from public, anon, authenticated;
grant execute on function public.edu_class_confer_purchase(uuid, uuid) to service_role;

-- edu_class_revoke_purchase — a refund/chargeback pulls access. Soft-removes the
-- buyer's membership (deleted_at); RLS helpers require deleted_at is null, so access
-- vanishes the instant this runs. Never touches an owner row. service_role-only.
create or replace function public.edu_class_revoke_purchase(p_class uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_scope context.scopes; v_row iam.memberships;
begin
  v_scope := public._edu_class(p_class);
  select * into v_row from iam.memberships
   where container_type = 'scope' and container_id = v_scope.id
     and user_id = p_user and deleted_at is null and role <> 'owner'
   limit 1;
  if v_row.id is null then return jsonb_build_object('status', 'not_member', 'user_id', p_user); end if;
  update iam.memberships
     set deleted_at = now(), updated_at = now(), updated_by = p_user,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('revoke_source', 'stripe_refund')
   where id = v_row.id;
  return jsonb_build_object('status', 'revoked', 'user_id', p_user);
end; $$;
revoke all on function public.edu_class_revoke_purchase(uuid, uuid) from public, anon, authenticated;
grant execute on function public.edu_class_revoke_purchase(uuid, uuid) to service_role;

-- Annihilate the old client-callable purchase STUB (the security review flagged it
-- as bypassable — a client could self-grant paid access). The real gate is the
-- webhook-only edu_class_confer_purchase above. No caller remains.
drop function if exists public.edu_class_purchase(uuid);

-- ─── Creator's own Connect status (authed read) ─────────────────────────────────
-- The dashboard reads its OWN Connect status through this definer RPC (billing.*
-- has no authenticated table read). Scopes strictly to auth.uid().
create or replace function public.creator_connect_status()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_uid uuid := (select auth.uid()); r billing.connect_account;
begin
  if v_uid is null then return null; end if;
  select * into r from billing.connect_account where user_id = v_uid;
  if r.user_id is null then return jsonb_build_object('connected', false); end if;
  return jsonb_build_object(
    'connected', true,
    'stripe_account_id', r.stripe_account_id,
    'charges_enabled', r.charges_enabled,
    'payouts_enabled', r.payouts_enabled,
    'details_submitted', r.details_submitted,
    'onboarded_at', r.onboarded_at,
    'country', r.country,
    'default_currency', r.default_currency
  );
end; $$;
revoke all on function public.creator_connect_status() from public, anon;
grant execute on function public.creator_connect_status() to authenticated;

-- ─── creator_public_page: single-source the class price + access mode ────────────
-- A featured class's access_mode + price now come LIVE from the class scope
-- settings (the owner sets them in the class form), not the stale value copied
-- into creator_featured. So the public /c/<handle> enroll CTA can never diverge
-- from what the owner actually set. price is returned in DOLLARS for display
-- (settings.price_cents / 100).
create or replace function public.creator_public_page(p_handle text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'users'
as $function$
declare
  v_handle text := lower(btrim(coalesce(p_handle, '')));
  p record;
  v_item jsonb;
  v_kind text;
  v_out jsonb;
  v_featured jsonb := '[]'::jsonb;
  v_enriched jsonb;
  v_scope context.scopes;
  v_mode text;
  v_cents int;
  v_price jsonb;
begin
  if v_handle = '' then return null; end if;

  select id, creator_handle, display_name, avatar_url, creator_tagline,
         creator_bio, creator_links, creator_featured, creator_published_at, updated_at
    into p
  from users.profiles
  where lower(creator_handle) = v_handle
    and creator_public = true
    and deleted_at is null
  limit 1;

  if p.id is null then return null; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p.creator_featured, '[]'::jsonb))
  loop
    v_kind := v_item->>'kind';
    if v_kind = 'youtube' then
      if coalesce(v_item->>'videoId', '') <> '' then
        v_featured := v_featured || jsonb_build_array(jsonb_build_object(
          'kind', 'youtube',
          'videoId', v_item->>'videoId',
          'title', v_item->>'title'
        ));
      end if;
    elsif v_kind = 'class' then
      if coalesce(v_item->>'classId', '') <> '' then
        -- Resolve the class scope's LIVE access mode + price (single source).
        v_mode := coalesce(v_item->>'accessMode', 'open');
        v_price := v_item->'price';
        begin
          select s.* into v_scope
          from context.scopes s
          join context.scope_types st on st.id = s.scope_type_id
          where s.id = (v_item->>'classId')::uuid and st.slug = 'class' and s.deleted_at is null;
          if v_scope.id is not null then
            v_mode := coalesce(nullif(v_scope.settings->>'access_mode', ''), 'open');
            v_cents := nullif(v_scope.settings->>'price_cents', '')::int;
            if v_cents is not null then
              v_price := to_jsonb(round(v_cents / 100.0, 2));
            else
              v_price := null;
            end if;
          end if;
        exception when others then
          -- fall back to the stored featured values on any resolve error
          null;
        end;
        v_featured := v_featured || jsonb_build_array(jsonb_build_object(
          'kind', 'class',
          'classId', v_item->>'classId',
          'title', coalesce(v_item->>'title', 'Class'),
          'description', v_item->>'description',
          'accessMode', v_mode,
          'price', v_price
        ));
      end if;
    elsif v_kind = 'resource' then
      v_enriched := public.creator_resolve_featured_resource(
        v_item->>'resourceType',
        (v_item->>'id')::uuid
      );
      if v_enriched is not null then
        v_featured := v_featured || jsonb_build_array(v_enriched);
      end if;
    end if;
  end loop;

  v_out := jsonb_build_object(
    'handle', p.creator_handle,
    'displayName', p.display_name,
    'avatarUrl', p.avatar_url,
    'tagline', p.creator_tagline,
    'bio', p.creator_bio,
    'links', coalesce(p.creator_links, '[]'::jsonb),
    'featured', v_featured,
    'publishedAt', p.creator_published_at,
    'updatedAt', p.updated_at
  );
  return v_out;
end;
$function$;
