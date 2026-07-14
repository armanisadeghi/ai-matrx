-- edu_guardian_link_revoke_anon_execute.sql
--
-- Security hardening follow-up to edu_guardian_link.sql: Postgres grants EXECUTE
-- to PUBLIC on newly created functions by default. The original migration only
-- explicitly revoked this for the two internal helpers (guardian_find_user_by_email,
-- guardian_assert_access); every other guardian_* RPC was left EXECUTE-granted to
-- PUBLIC (and therefore `anon`) by the Postgres default. None of these are
-- exploitable today (auth.uid() is NULL for anon, so every path either raises or
-- returns false/empty), but least-privilege requires anon have no reachability at
-- all into a family of RPCs that read/write another user's data. Idempotent.

revoke execute on function public.guardian_can_view(uuid)                     from public, anon;
revoke execute on function public.guardian_has_active_link(uuid)              from public, anon;
revoke execute on function public.guardian_grant(text, text)                  from public, anon;
revoke execute on function public.guardian_request_student(text, text)        from public, anon;
revoke execute on function public.guardian_respond(uuid, boolean)             from public, anon;
revoke execute on function public.guardian_unlink(uuid, uuid)                 from public, anon;
revoke execute on function public.guardian_list_links()                       from public, anon;
revoke execute on function public.guardian_student_mastery(uuid)              from public, anon;
revoke execute on function public.guardian_student_attempts(uuid, timestamptz) from public, anon;
revoke execute on function public.guardian_student_sessions(uuid)             from public, anon;
revoke execute on function public.guardian_student_streak(uuid)               from public, anon;
revoke execute on function public.guardian_student_gain(uuid)                 from public, anon;
revoke execute on function public.guardian_student_card_topics(uuid, uuid[])  from public, anon;

-- Re-affirm the intended grants (authenticated only) so this file is self-contained.
grant execute on function public.guardian_can_view(uuid)                    to authenticated;
grant execute on function public.guardian_grant(text, text)                 to authenticated;
grant execute on function public.guardian_request_student(text, text)       to authenticated;
grant execute on function public.guardian_respond(uuid, boolean)            to authenticated;
grant execute on function public.guardian_unlink(uuid, uuid)                to authenticated;
grant execute on function public.guardian_list_links()                      to authenticated;
grant execute on function public.guardian_student_mastery(uuid)             to authenticated;
grant execute on function public.guardian_student_attempts(uuid, timestamptz) to authenticated;
grant execute on function public.guardian_student_sessions(uuid)            to authenticated;
grant execute on function public.guardian_student_streak(uuid)              to authenticated;
grant execute on function public.guardian_student_gain(uuid)                to authenticated;
grant execute on function public.guardian_student_card_topics(uuid, uuid[]) to authenticated;
