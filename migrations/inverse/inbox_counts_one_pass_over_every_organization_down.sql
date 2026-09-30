-- INVERSE of migrations/inbox_counts_one_pass_over_every_organization.sql (lane INBOX-COUNTS-SET-BASED).
-- Puts back custom.inbox_counts' per-organization loop over custom._inbox_items, byte for byte the
-- body it replaced (same signature, so the grants and the client_callable_door row are untouched).
-- chair-step: restores the per-organization custom.inbox_counts loop the set-based body replaced.
-- based-on: custom.inbox_counts(uuid) 15e030ca3b02375b6debee69c31f4b0fb96245280aca9bc63d176f1ba54ca170

CREATE OR REPLACE FUNCTION custom.inbox_counts(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(organization_id uuid, organization_name text, waiting integer, snoozed integer, cleared integer, overdue integer, oldest_waiting_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
  o    uuid;
begin
  -- THE BADGE'S NUMBER IS THE INBOX'S NUMBER: the same predicate, counted. Null counts every
  -- organization this person belongs to, because what waits on a person is the person's, not the
  -- selected organization's (ACCESS-IS-PERSONAL). An organization with nothing is not listed.
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.inbox_counts');
  end if;
  if v_me is null then
    return;
  end if;
  for o in
    select p_organization_id where p_organization_id is not null
    union
    select m.organization_id from iam.organization_member m
      join iam.organizations g on g.id = m.organization_id and g.archived_at is null
     where p_organization_id is null and m.user_id = v_me
  loop
    return query
      select o,
             (select g.name::text from iam.organizations g where g.id = o),
             (count(*) filter (where x.inbox_state = 'waiting'))::integer,
             (count(*) filter (where x.inbox_state = 'snoozed'))::integer,
             (count(*) filter (where x.inbox_state = 'cleared'))::integer,
             (count(*) filter (where x.inbox_state = 'waiting' and x.due_state = 'overdue'))::integer,
             min(x.at) filter (where x.inbox_state = 'waiting')
        from custom._inbox_items(o, v_me, false) x
      having p_organization_id is not null
          or count(*) filter (where x.inbox_state in ('waiting', 'snoozed')) > 0;
  end loop;
end
$function$;
