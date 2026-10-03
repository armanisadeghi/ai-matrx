-- chair-step: it REPLACES the body of one lane-9 scope door, custom.context_tags_set (signature, SECURITY DEFINER, search_path and grants unchanged). Before anything is written, every id in the set must be a scope the caller may tag: an id that is null, that no scope carries (an invented id, or a Value that exists only in the record store), or that belongs to an organization the caller is not a member of refuses the WHOLE call in one plain sentence (42501, the ids in DETAIL), and nothing is written. Until now public.set_entity_scopes built its edges with `FROM unnest(ids) JOIN context.scopes`, so an unknown id was dropped and the door answered ok:true. Archived scopes stay taggable (a re-stated set carries the entity's existing tags, and a reference survives archive). No new door, no grant, no change to the chair's record doors or the access ladder.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.context_tags_set(text, uuid, uuid[]) 7771727e7263bbbf5d437398bdd1bc596e90945e11de5cfd1dd77556c311ad33
-- lock: custom
--
-- Inverse: migrations/inverse/scopesw2w_a_tag_set_refuses_a_scope_it_cannot_tag_down.sql.
--
-- THE USE CASE. Cedar Ridge Physical Therapy files its "post-op ACL return-to-sport protocol review"
-- project under Practice Area: Sports rehab and Department: Outpatient Orthopedics. A client of the tag
-- door (REST v1 or the MCP by name; the web tags through public.assoc_set_targets today) sends the set with one id that is not a scope it can
-- tag — a Value made only in the store, a typo'd id, another firm's Matter. Before this file the door
-- answered ok:true and the project was quietly filed under one scope fewer than the person chose;
-- now nothing is written and the person is told.
-- Guard: scripts/campaign-tests/scopesw2w_a_tag_set_refuses_a_scope_it_cannot_tag_red_green.sql.

CREATE OR REPLACE FUNCTION custom.context_tags_set(p_entity_type text, p_entity_id uuid, p_scope_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_out jsonb;
  v_org uuid;
  v_ids uuid[] := coalesce(p_scope_ids, '{}'::uuid[]);
  v_bad jsonb;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): NOTHING FAILS SILENTLY. Every id must be a scope of an
  -- organization the caller belongs to, or the whole set is refused before anything is written. One
  -- sentence for a null id, an invented id, a store-only Value and another organization's scope, so the
  -- refusal tells no one which ids exist (the 0749 rule). An anonymous call is left to
  -- set_entity_scopes, which refuses it in its own words. Archived scopes pass, as before.
  if auth.uid() is not null then
    select jsonb_agg(x.id order by x.ord) into v_bad
      from unnest(v_ids) with ordinality x(id, ord)
     where x.id is null
        or not exists (select 1
                         from context.scopes s
                         join iam.organization_member om
                           on om.organization_id = s.organization_id and om.user_id = auth.uid()
                        where s.id = x.id);
    if v_bad is not null then
      raise exception 'One of those scopes is not one you can tag with. Nothing was saved.'
        using errcode = '42501',
              detail = jsonb_build_object('scope_ids', v_bad)::text,
              hint = 'Each id must be a scope of an organization you belong to.';
    end if;
  end if;

  v_out := to_jsonb(public.set_entity_scopes(p_entity_type, p_entity_id, v_ids));
  -- set_entity_scopes has decided (editor on the record, a member of every scope's organization); the one
  -- ladder then answers for this door by its own name for each organization a tag belongs to.
  for v_org in select distinct s.organization_id from context.scopes s where s.id = any(v_ids) loop
    perform custom.assert_client_may_reach(v_org, 'custom.context_tags_set');
  end loop;
  return jsonb_build_object('ok', true, 'row', v_out);
end;
$function$;
