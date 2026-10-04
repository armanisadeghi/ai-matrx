-- A short customer-scoped lease serializes Stripe checkout creation across
-- app instances. Stripe idempotency alone only protects identical requests.
create or replace function billing.claim_checkout(p_customer text, p_livemode boolean, p_token uuid)
returns boolean language plpgsql set search_path = '' as $$
declare v_count integer;
begin
  update billing.customer set metadata = coalesce(metadata, '{}'::jsonb) ||
    jsonb_build_object('checkout_lease', jsonb_build_object('token', p_token, 'until', now() + interval '5 minutes'))
  where stripe_customer_id = p_customer and livemode = p_livemode
    and (metadata->'checkout_lease'->>'until' is null or
      (metadata->'checkout_lease'->>'until')::timestamptz < now());
  get diagnostics v_count = row_count;
  return v_count = 1;
end; $$;
create or replace function billing.release_checkout(p_customer text, p_livemode boolean, p_token uuid)
returns void language sql set search_path = '' as $$
  update billing.customer set metadata = metadata - 'checkout_lease'
  where stripe_customer_id = p_customer and livemode = p_livemode
    and metadata->'checkout_lease'->>'token' = p_token::text;
$$;
revoke all on function billing.claim_checkout(text, boolean, uuid) from public, anon, authenticated;
revoke all on function billing.release_checkout(text, boolean, uuid) from public, anon, authenticated;
grant execute on function billing.claim_checkout(text, boolean, uuid) to service_role;
grant execute on function billing.release_checkout(text, boolean, uuid) to service_role;
notify pgrst, 'reload schema';
-- chair-step: Limit new checkout-serialization functions to the existing Stripe service writer; no existing function grants change.
