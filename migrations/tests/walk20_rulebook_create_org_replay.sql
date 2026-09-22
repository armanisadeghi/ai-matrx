-- Run on East inside a transaction and roll back: no persistent fixtures.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local role authenticated;
do $test$
declare
  -- Explicit admin test organizations, never a default-organization fallback.
  org_a uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  org_b uuid := '7cd12da2-2213-4378-8fba-a9e2dc4ea657';
  token uuid := gen_random_uuid();
  slug text := 'rulebook-integration-' || gen_random_uuid()::text;
  first_row jsonb;
  replay jsonb;
  duplicate jsonb;
begin
  assert auth.uid() = '87a6e699-3622-4869-8843-d0867456c0dd'::uuid;
  assert iam.has_org_access(org_a) and iam.has_org_access(org_b);
  first_row := public.rulebook_create(org_a, 'Integration replay proof', slug,
    p_metadata => jsonb_build_object('client_token', token));
  replay := public.rulebook_create(org_a, 'Integration replay proof', slug,
    p_metadata => jsonb_build_object('client_token', token));
  assert first_row->>'id' = replay->>'id', 'Same intent minted two rows';
  assert (first_row->>'created')::boolean and not (replay->>'created')::boolean;
  duplicate := public.rulebook_create(org_a, 'Integration replay proof', slug);
  assert duplicate->>'id' <> first_row->>'id';
  assert duplicate->>'slug' <> first_row->>'slug';
  assert (duplicate->>'name_already_in_use')::boolean;
  begin
    perform public.rulebook_create(org_b, 'Integration replay proof', slug,
      p_metadata => jsonb_build_object('client_token', token));
    raise exception 'Cross-organization token replay returned another organization row';
  exception when invalid_parameter_value then
    assert sqlerrm like '%create token belongs to a different organization%';
  end;
  raise notice 'PASS: same-intent replay, duplicate slug resolution, duplicate-name disclosure, cross-organization replay refusal';
end;
$test$;
rollback;
