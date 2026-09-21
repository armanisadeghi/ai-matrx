-- based-on: platform.emit_pending_assist(uuid, text, text, text, text, jsonb, text, text, uuid, text, timestamp with time zone, smallint, jsonb, real, text) c727a47316601145881ff6409ea6d651ddbc1c5d50baf5f7914c944dd200baf9
-- chair-step: The existing browser door must become SECURITY DEFINER because the new restrictive RLS policy correctly refuses its former SECURITY INVOKER write; the body remains auth.uid()-bound and the direct table refusal stays in force.
--
-- The direct PostgREST write refusal on platform.assists is deliberately
-- restrictive. It also applies to SECURITY INVOKER functions, which made the
-- canonical browser write door fail with 42501 after that policy landed.
--
-- The door derives the addressee and created_by from auth.uid(), refreshes
-- only that caller's own pending row, and has a locked search_path. Run those
-- checks as the table owner's SECURITY DEFINER door so the browser cannot
-- write the table directly but its sanctioned RPC continues to work.

ALTER FUNCTION platform.emit_pending_assist(
  uuid, text, text, text, text, jsonb, text, text, uuid, text,
  timestamptz, smallint, jsonb, real, text
) SECURITY DEFINER;

DO $$
BEGIN
  IF NOT (
    SELECT prosecdef
    FROM pg_proc
    WHERE oid = 'platform.emit_pending_assist(uuid,text,text,text,text,jsonb,text,text,uuid,text,timestamptz,smallint,jsonb,real,text)'::regprocedure
  ) THEN
    RAISE EXCEPTION 'emit_pending_assist must remain SECURITY DEFINER: direct platform.assists writes are refused by RLS';
  END IF;
END;
$$;
