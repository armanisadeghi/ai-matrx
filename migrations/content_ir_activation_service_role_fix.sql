-- D166 — service-role exemption in the kind-activation gate never fired.
--
-- content_ir.guard_kind_is_active_write() is SECURITY DEFINER, so inside the
-- function current_user is the function OWNER (postgres), never 'service_role'
-- — the `current_user <> 'service_role'` exemption was dead code and every
-- service-key write to kind_definition.is_active was rejected
-- (scripts/shape/activate-kinds.ts --apply could no longer activate anything).
--
-- Fix (both halves):
--   1. guard_kind_is_active_write: detect service role via the PostgREST JWT
--      role claim (auth.jwt() ->> 'role'), which is request-scoped and
--      unaffected by SECURITY DEFINER, plus session_user for direct
--      (non-PostgREST) service_role connections.
--   2. set_kind_activation: accept the service role as an authorized actor —
--      it may act with auth.uid() null and no p_actor, and it bypasses the
--      owner/super-admin check (it IS the server). updated_by is only
--      overwritten when there is a real acting uid.
--
-- Idempotent: CREATE OR REPLACE only.

create or replace function content_ir.guard_kind_is_active_write()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
    if new.is_active is distinct from old.is_active
       and coalesce(current_setting('content_ir.activation_ok', true), '') <> '1'
       -- Service-role exemption. current_user is USELESS here: under
       -- SECURITY DEFINER it is the function owner, so it can never be
       -- 'service_role' (D166). The JWT role claim survives into the
       -- definer context; session_user covers direct connections.
       and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
       and session_user <> 'service_role'
    then
        raise exception
            'content_ir.kind_definition.is_active is gated — write it through content_ir.set_kind_activation (kind "%")',
            old.kind;
    end if;
    return new;
end;
$function$;

create or replace function content_ir.set_kind_activation(
    p_kind_definition_id uuid,
    p_active boolean,
    p_note text default null::text,
    p_actor uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
    d record;
    -- auth.uid() wins whenever present; p_actor only fills the server gap.
    v_uid uuid := coalesce(auth.uid(), p_actor);
    -- The service role is an authorized actor in its own right (D166): it may
    -- call with no auth.uid() and no p_actor. Detected via the JWT role claim
    -- (current_user is the definer owner here, never 'service_role').
    v_is_service boolean :=
        coalesce(auth.jwt() ->> 'role', '') = 'service_role'
        or session_user = 'service_role';
    v_verdict jsonb;
begin
    if v_uid is null and not v_is_service then
        raise exception 'set_kind_activation: no acting user (auth.uid() null and no p_actor)';
    end if;
    if p_active is null then
        raise exception
            'set_kind_activation: p_active must be true or false, not null';
    end if;

    select id, kind, created_by, is_active
      into d
      from content_ir.kind_definition
     where id = p_kind_definition_id;

    if d.id is null then
        raise exception 'set_kind_activation: kind definition % does not exist',
            p_kind_definition_id;
    end if;

    if not v_is_service
       and d.created_by is distinct from v_uid
       and not public.is_super_admin()
    then
        raise exception
            'set_kind_activation: not authorized for kind "%" — you must own the definition or be a super admin',
            d.kind;
    end if;

    if p_active is not true then
        perform set_config('content_ir.activation_ok', '1', true);
        update content_ir.kind_definition
           set is_active = false,
               updated_by = coalesce(v_uid, updated_by),
               metadata = case
                   when p_note is null then metadata
                   else jsonb_set(metadata, '{activation_note}', to_jsonb(p_note), true)
               end
         where id = d.id;

        return jsonb_build_object(
            'ok', true, 'kind', d.kind, 'kind_definition_id', d.id,
            'is_active', false, 'was_active', d.is_active, 'gated', false
        );
    end if;

    v_verdict := content_ir.evaluate_kind_activation(d.id);

    if not (v_verdict ->> 'would_activate')::boolean then
        raise exception
            'set_kind_activation: kind "%" failed the dual gate — %',
            d.kind,
            array_to_string(
                array(select jsonb_array_elements_text(v_verdict -> 'reasons')), ' | ');
    end if;

    perform set_config('content_ir.activation_ok', '1', true);
    update content_ir.kind_definition
       set is_active = true,
           updated_by = coalesce(v_uid, updated_by),
           metadata = case
               when p_note is null then metadata
               else jsonb_set(metadata, '{activation_note}', to_jsonb(p_note), true)
           end
     where id = d.id;

    return jsonb_build_object(
        'ok', true, 'kind', d.kind, 'kind_definition_id', d.id,
        'is_active', true, 'was_active', d.is_active, 'gated', true,
        'verdict', v_verdict
    );
end;
$function$;
