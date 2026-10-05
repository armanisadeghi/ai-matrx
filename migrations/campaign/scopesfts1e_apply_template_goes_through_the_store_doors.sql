-- chair-step: public.apply_template applies a template through the store's doors (custom.context_template_apply → custom.context_type_write / custom.context_item_write) instead of inserting old scope_types / context_items rows and leaving the follow trigger to carry them; its checks, sentences and answer shape are kept (public.apply_template_by_key reaches it unchanged). Same effect, rolled back on live, admin in an organization with no scope types, three templates (clinical_research_lab with nested types, accounting_firm, law_firm): answers identical; every scope type (labels, icon, slug, place, parent) and every field (key, label, description, kind, a reference field's target type) identical. One difference: each field now takes the template's own place (the old inserts left every field at one place, so they listed alphabetically). Guard scripts/campaign-tests/scopesfts1e_apply_template_goes_through_the_store_doors_red_green.sql RED (A2 alphabetical) then GREEN.
-- lane: FINISH-THE-SWITCH (FTS-1e, scopes finish, item 3)
-- based-on: public.apply_template(uuid, uuid) 031d78aaf69751651cdf6cf53ac6f4e9cb824c7cef9dc3529378bc7e8c1662fd
-- lock: custom
--
-- Inverse: migrations/inverse/scopesfts1e_apply_template_goes_through_the_store_doors_down.sql.
--
-- THE USE CASE. A new clinical research lab applies the "clinical_research_lab" template and gets Studies, Sites,
-- Subjects and Team Members, each field in the template's order.

CREATE OR REPLACE FUNCTION public.apply_template(p_template_id uuid, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_res jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;

  if not exists (select 1 from context.templates t where t.id = p_template_id and t.is_active = true) then
    perform platform.refuse_not_found(format('active template %s not found', p_template_id));
  end if;

  -- THROUGH THE STORE'S DOORS (FTS-1e): the template is applied by custom.context_template_apply (every scope type
  -- and field through custom.context_type_write / custom.context_item_write; a reference field points at a scope of
  -- its own type, as before). The answer keeps this function's own shape.
  v_res := custom.context_template_apply(p_org_id, p_template_id);
  return jsonb_build_object(
    'template_id', p_template_id, 'organization_id', p_org_id,
    'scope_types_created', coalesce((select jsonb_agg(jsonb_build_object('id', t -> 'id', 'label_singular', t -> 'label_singular',
                                                                         'label_plural', t -> 'label_plural') order by o)
                                       from jsonb_array_elements(v_res -> 'scope_types_created') with ordinality x(t, o)), '[]'::jsonb),
    'context_items_count', coalesce((v_res ->> 'context_items_count')::int, 0));
end;
$function$;
