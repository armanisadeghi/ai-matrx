-- chair-step: one GRANT, refused by the production allow-list by name. Everything else in
-- this file is one new function and one declaration row; it replaces no live body.
--
-- ENTITY-FIELDS 6 — A SCREEN CANNOT OFFER "ADD FIELD" HONESTLY WITHOUT ASKING.
--
-- The law: a control is ABSENT or honest, never dead and never wearing a false sentence. The
-- "Add field" control on a standard entity's page is an organization admin's, because the
-- column appears on that table for everybody. A screen has three ways to decide that, and two
-- of them are wrong: show it to everyone and let `custom.entity_field_declare` refuse (a
-- control that fails when pressed), or hide it for everyone (a capability nobody can find).
-- The third is to ask, which needs a door — so here is the door.
--
-- It answers the RIGHT and the reason in the store's own words, so the sentence a person reads
-- when the control is absent is the same sentence the door would have refused them with.
--
-- INVERSE: migrations/inverse/entityfields_the_add_control_is_absent_or_honest_down.sql

set lock_timeout = '3s';
set statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.entity_field_rights(p_organization_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
declare
  t      record;
  v_may  boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.entity_field_rights');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.entity_field_rights');
  select * into t from custom.entity_table(p_token);

  v_may := custom.query_is_store_owner() or iam.has_org_admin(p_organization_id);
  return jsonb_build_object(
    'token',       t.token,
    'label',       t.label,
    'may_declare', v_may,
    'reason',      case when v_may then null
                        else format('Adding a column to %s changes it for everybody in this organization, and that is an owner''s or an admin''s to do.', t.label)
                   end,
    -- Filling in the fields that are already there is not admin work, and a screen that
    -- hid the values along with the control would be hiding the wrong thing.
    'may_fill_in', true);
end
$function$;

COMMENT ON FUNCTION custom.entity_field_rights(uuid, text) IS
  'SCR-12: may this person add a custom field to this standard table, and if not, the sentence saying why. A screen asks this so the control is absent with a reason rather than dead when pressed.';

INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers)
VALUES ('custom','entity_field_rights','p_organization_id uuid, p_token text',
        ARRAY['uuid'::regtype,'text'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach (membership) before anything is read and NULL is refused there by name; the answer is then about that organization and nothing else. p_token is a platform.entity_types token and carries no entity id. It reads no business row and returns only a boolean and the refusal sentence that matches it.',
        'migrations/campaign/entityfields_the_add_control_is_absent_or_honest.sql', true)
ON CONFLICT (schema_name, function_name, identity_argtypes) DO NOTHING;

GRANT EXECUTE ON FUNCTION custom.entity_field_rights(uuid, text) TO authenticated;
