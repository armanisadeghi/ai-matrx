-- scfg_50b_regrant_knob_index_door.sql
-- ============================================================================
-- scfg_03 granted the SECURITY DEFINER door before inserting its
-- platform.client_callable_door declaration. The DDL guard correctly revoked
-- that premature client grant. The declaration now exists, so re-issue the
-- grant and fail the migration unless the complete client-door contract holds.
-- ============================================================================

grant execute on function platform.knob_index(uuid, text, uuid, boolean)
  to authenticated;

do $verify$
begin
  if not exists (
    select 1
      from platform.client_callable_door
     where schema_name = 'platform'
       and function_name = 'knob_index'
       and identity_args =
         'p_organization_id uuid, p_feature_prefix text, p_user_id uuid, p_overridden_only boolean'
  ) then
    raise exception 'scfg_50b: platform.knob_index is not registered as a client-callable door';
  end if;

  if not has_function_privilege(
    'authenticated',
    'platform.knob_index(uuid,text,uuid,boolean)',
    'EXECUTE'
  ) then
    raise exception 'scfg_50b: authenticated still cannot execute platform.knob_index';
  end if;
end
$verify$;
