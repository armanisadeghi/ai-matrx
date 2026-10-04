-- Renew only a still-owned, unexpired lease. An old worker must never reclaim
-- an expired token while another request is opening checkout.
create function billing.renew_checkout(p_customer text, p_livemode boolean, p_token uuid)
returns boolean language plpgsql set search_path = '' as $$
declare v_count integer;
begin
  update billing.customer set metadata = jsonb_set(metadata, '{checkout_lease,until}', to_jsonb(now()+interval '5 minutes'))
    where stripe_customer_id=p_customer and livemode=p_livemode
      and metadata->'checkout_lease'->>'token'=p_token::text
      and (metadata->'checkout_lease'->>'until')::timestamptz > now();
  get diagnostics v_count = row_count;
  return v_count=1;
end; $$;
revoke all on function billing.renew_checkout(text,boolean,uuid) from public,anon,authenticated;
grant execute on function billing.renew_checkout(text,boolean,uuid) to service_role;
notify pgrst, 'reload schema';
-- chair-step: Restrict the new lease-renewal function to the existing billing service writer.
