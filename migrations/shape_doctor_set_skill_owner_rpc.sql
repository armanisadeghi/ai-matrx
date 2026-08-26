-- shape_doctor_set_skill_owner: the Shape Doctor's RESOLUTION write path — the
-- admin surface at /administration/utilities/kind-registry/findings/duplicate-skill.
--
-- WHY A DECLARATION AND NOT A DELETION: R9 is ONE render_block skill per kind
-- per syntax, but the live violations are almost never rival skills for one
-- shape. They are CONTAINER kinds' skills demonstrating the ITEM kinds they
-- embed (kind_ner_canonicalization_result shows an ner_entity_ref inside its
-- payload). The container must keep showing its children, so the repair is to
-- name the owner, not to remove a row. This function writes that declaration
-- onto content_ir.kind_definition.metadata.skill_owner.<syntax>; the pure
-- doctor (features/content-ir/registry/shape-doctor.ts, kindSkillOwner) reads
-- it and the CLI check-shapes.ts sees it too, because both already gather
-- kind_definition.metadata.
--
-- WHY SECURITY DEFINER: companion to shape_doctor_gather, same reason — the
-- shape doctor is a privilege-complete census across every organization's
-- kinds, so a viewer-RLS write would silently refuse exactly the rows that
-- matter. Same super-admin gate; no new security layer.
--
-- NON-DESTRUCTIVE BY CONSTRUCTION: it never deletes, deactivates, or edits a
-- skill row. p_skill_id = null clears the declaration and the red returns.
-- FALSIFIABLE: the doctor honours the declaration only while the named skill
-- still teaches the kind; a stale declaration raises its own red.
--
-- Applied live via the Supabase MCP 2026-08-26. This file is the RECORD.

create or replace function public.shape_doctor_set_skill_owner(
  p_kind text,
  p_syntax text,
  p_skill_id text default null,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'content_ir'
as $function$
declare
  v_row content_ir.kind_definition%rowtype;
  v_previous text;
  v_owner jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden: Super Admin required' using errcode = '42501';
  end if;

  if p_syntax not in ('json', 'xml') then
    raise exception 'shape_doctor_set_skill_owner: syntax must be json or xml, got %', p_syntax;
  end if;

  select * into v_row
  from content_ir.kind_definition
  where kind = p_kind and deleted_at is null;

  if not found then
    raise exception 'shape_doctor_set_skill_owner: no live kind_definition for %', p_kind;
  end if;

  v_previous := coalesce(
    v_row.metadata #>> array['skill_owner', p_syntax, 'skill_id'],
    v_row.metadata #>> array['skill_owner', p_syntax]
  );

  v_owner := coalesce(v_row.metadata -> 'skill_owner', '{}'::jsonb);

  if p_skill_id is null or length(trim(p_skill_id)) = 0 then
    v_owner := v_owner - p_syntax;
  else
    v_owner := v_owner || jsonb_build_object(
      p_syntax,
      jsonb_strip_nulls(jsonb_build_object(
        'skill_id', trim(p_skill_id),
        'decided_by', auth.uid(),
        'decided_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'note', nullif(trim(coalesce(p_note, '')), ''),
        'previous', v_previous
      ))
    );
  end if;

  update content_ir.kind_definition
  set metadata = case
        when v_owner = '{}'::jsonb then coalesce(metadata, '{}'::jsonb) - 'skill_owner'
        else coalesce(metadata, '{}'::jsonb) || jsonb_build_object('skill_owner', v_owner)
      end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = v_row.id
  returning metadata -> 'skill_owner' into v_owner;

  return coalesce(v_owner, '{}'::jsonb);
end;
$function$;

revoke all on function public.shape_doctor_set_skill_owner(text, text, text, text) from public;
grant execute on function public.shape_doctor_set_skill_owner(text, text, text, text) to authenticated;
