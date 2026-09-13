-- dd169_grandfather_batch1_anonymous_report_open_not_declared.sql
--
-- Correction to `dd169_grandfather_batch1_volatile_doors.sql`, made because the
-- guard disagreed with it and the guard was right to.
--
-- That file DECLARED `public.anonymous_report_open` as an ANONYMOUS door on the
-- strength of its design — HR's anonymous incident reporting, where the reporter
-- is anonymous on purpose. `pnpm check:impl-doors:strict` then went RED on D6:
-- the body names a table that carries a `visibility` column and shows no gate
-- from the platform's access vocabulary. In substance the read is a per-IP COUNT
-- for rate limiting and returns no rows from that table — but a declared door is
-- a claim, and the claim we could actually back is weaker than the one we made:
-- NO anonymous caller for this function exists in matrx-frontend, aidream,
-- matrx-extend or matrx-local today. Its only caller anywhere is its own proof
-- script, `scripts/hr/hrb011_proof.py`, which connects as `postgres`.
--
-- So the honest decision is the same one the other 147 got: `anon` and PUBLIC
-- lose EXECUTE, `authenticated` keeps it, and the door row says it is a
-- SIGNED-IN door. When the HR anonymous-report surface actually ships a
-- signed-out caller, it declares its anonymous door then — with the visibility
-- gate D6 asks for, not a baseline raised to let this one through.

delete from platform.client_callable_door
 where schema_name = 'public' and function_name = 'anonymous_report_open'
   and declared_by = 'DD-169 / B-63';

insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
values ('public', 'anonymous_report_open', 'p_organization_id uuid, p_ip inet', 'DD-169 / B-63',
        'SIGNED-IN door (authenticated only; anon revoked by this migration). Designed for an anonymous reporter, but no signed-out caller exists in any of the four repos yet — only scripts/hr/hrb011_proof.py, which connects as postgres. Declaring an anonymous door here would be a claim nothing backs, and D6 refuses it: the body names a visibility-bearing table with no access-vocabulary gate. The anonymous surface declares its own door, gated, when it ships.')
on conflict do nothing;

revoke execute on function public.anonymous_report_open(uuid, inet) from public, anon;

do $$
begin
  if has_function_privilege('anon', 'public.anonymous_report_open(uuid,inet)'::regprocedure, 'EXECUTE') then
    raise exception 'dd169: anon still holds EXECUTE on public.anonymous_report_open';
  end if;
  if not has_function_privilege('authenticated', 'public.anonymous_report_open(uuid,inet)'::regprocedure, 'EXECUTE') then
    raise exception 'dd169: authenticated lost EXECUTE on public.anonymous_report_open';
  end if;
end $$;
