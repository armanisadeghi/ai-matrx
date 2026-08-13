-- web.create_site idempotency regression test.
-- Run against Matrx Main; every fixture is rolled back.

begin;

create temporary table web_create_site_fixture on commit drop as
select m.container_id as organization_id, m.user_id
from iam.memberships m
where m.container_type = 'organization'
  and m.deleted_at is null
  and m.status = 'active'
  and iam.has_org_access_for(m.user_id, m.container_id)
limit 1;

grant select on web_create_site_fixture to authenticated;

do $fixture$
begin
  if not exists (select 1 from web_create_site_fixture) then
    raise exception 'create_site test requires one active organization member';
  end if;
end;
$fixture$;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select user_id from web_create_site_fixture),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $regression$
declare
  v_org_id uuid := (select organization_id from web_create_site_fixture);
  v_domain text := 'create-site-idempotency-' || gen_random_uuid()::text || '.invalid';
  v_url text;
  v_first web.site;
  v_second web.site;
begin
  v_url := 'https://' || v_domain || '/';

  v_first := web.create_site(v_org_id, 'Idempotency fixture', v_url, v_domain);
  v_second := web.create_site(v_org_id, 'Ignored repeat name', v_url, v_domain);

  if v_first.id is distinct from v_second.id then
    raise exception 'repeat create returned different sites: % vs %',
      v_first.id, v_second.id;
  end if;

  if (
    select count(*)
    from web.site s
    where s.organization_id = v_org_id
      and s.domain = v_domain
      and s.deleted_at is null
  ) <> 1 then
    raise exception 'repeat create did not converge on one live site';
  end if;

  if (
    select count(*)
    from web.property p
    where p.site_id = v_first.id
      and p.deleted_at is null
  ) <> 1 then
    raise exception 'repeat create did not preserve one website property';
  end if;
end;
$regression$;

rollback;
