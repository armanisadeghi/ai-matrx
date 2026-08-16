-- P6 Voice: preserve floating af15 slot snapshots when chat's insert trigger
-- materializes the current initial_agent_version_id.
--
-- The preceding immutable migration compared the conversation version to the
-- frozen slot version with null equality. A floating slot intentionally has no
-- version pin, while trg_cx_conversation_resolve_agent_version fills the chat
-- row's current version. The definition id is the exact identity for a
-- floating snapshot; a pinned snapshot still requires its exact version.

do $$
declare
  v_definition text;
  v_corrected text;
begin
  select pg_get_functiondef(
    'communication.issue_voice_agent_session_reference(text,uuid,timestamp with time zone,uuid,uuid,bigint,uuid,text,uuid,uuid,text,jsonb,text)'::regprocedure
  ) into strict v_definition;
  v_corrected := replace(
    v_definition,
    'and conversation.initial_agent_version_id is not distinct from p_agent_version_id',
    'and (p_agent_version_id is null or conversation.initial_agent_version_id = p_agent_version_id)'
  );
  if v_corrected = v_definition then
    raise exception 'Expected issue Voice session reference version predicate was not found';
  end if;
  execute v_corrected;

  select pg_get_functiondef(
    'communication.consume_voice_agent_session_reference(text,text,text,text,text)'::regprocedure
  ) into strict v_definition;
  v_corrected := replace(
    v_definition,
    $old$and conversation.initial_agent_version_id is not distinct from
        nullif(v_issued.metadata ->> 'agent_version_id', '')::uuid$old$,
    $new$and (
        v_issued.metadata ->> 'agent_version_id' is null
        or conversation.initial_agent_version_id =
          (v_issued.metadata ->> 'agent_version_id')::uuid
      )$new$
  );
  if v_corrected = v_definition then
    raise exception 'Expected consume Voice session reference version predicate was not found';
  end if;
  execute v_corrected;
end;
$$;

revoke all on function communication.issue_voice_agent_session_reference(
  text, uuid, timestamptz, uuid, uuid, bigint, uuid, text, uuid, uuid, text, jsonb, text
) from public, anon, authenticated;
revoke all on function communication.consume_voice_agent_session_reference(
  text, text, text, text, text
) from public, anon, authenticated;

grant execute on function communication.issue_voice_agent_session_reference(
  text, uuid, timestamptz, uuid, uuid, bigint, uuid, text, uuid, uuid, text, jsonb, text
) to service_role;
grant execute on function communication.consume_voice_agent_session_reference(
  text, text, text, text, text
) to service_role;
