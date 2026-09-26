-- certify_knows_doors_only_refusals_and_detail_declarations
-- based-on: iam.verify_canonical(text, text, text, text) d55c8fdf991e5e05d7bbe7a0010a99e27ebf27bd80a61a1413ef754a6c318898
--
-- THE CERTIFIER ONLY. No policy, grant, table, kernel or door changes: nobody gains or loses a read
-- or a write. This teaches iam.verify_canonical two facts it was arguing with.
--
-- 1. THE DOORS-ONLY REFUSALS ARE CANONICAL. The DOORS-ONLY lane (chair ruling, VERIFIER-8 HIGH-3,
--    2026-09-21) puts RESTRICTIVE `<table>_client_<insert|update|delete>_refused` policies on
--    `platform`/`iam` tables so no regeneration can re-open a client write. They are named bespoke on
--    purpose so iam.apply_rls preserves them (DD-147). The certifier then reported them as
--    `legacy/unexpected` (FAIL) and `bespoke_policy_present` (WARN) — so every doors-only table,
--    platform.comments included (after RC-A2f its ONLY remaining findings), can never certify,
--    and the certifier's own remedy ("supersede them") would delete a chair-ruled safety layer.
--    Same class DOORS-ONLY-4 fixed for platform_admin_select: the verifier learns what the ruling
--    emits. Accepted ONLY in the exact shape that can do nothing but refuse: RESTRICTIVE, the name
--    matching its command, roles within {anon, authenticated}, and the predicate literally `false`.
--    A permissive policy, a PUBLIC one, or one with any other predicate is still unexpected.
--
-- 2. A DETAIL'S REGISTRY AND ITS DECLARATION MUST AGREE (new check
--    `detail_declaration_matches_registry`). Since RC-A2e the kernel resolves a token as a detail
--    of its record whenever platform.detail_parent_columns declares it, WHATEVER its registered
--    rls_variant — and refuses every reader of a `detail` token with no declaration (fails closed).
--    Certification checked a table against the variant it is registered as, never whether that
--    variant is what the kernel actually does, so custom.io_comment (registered `entity`, resolved
--    as a detail of its record) certified green. Now:
--      * `detail` registered, no declaration      -> FAIL (the kernel refuses everyone: a lockout)
--      * declared, registered as anything else    -> WARN (the registry misdescribes the table)
--    WARN, not FAIL, for the second: it is a description defect with no runtime effect, and a FAIL
--    would count against the post-doctrine ratchet (audit.canonical_findings status = 'FAIL').
--
-- Proof: aidream db/tests/test_certify_doors_only_and_detail_declaration.py (rolled back; red
-- before this file, green after). Inverse: migrations/inverse/certify_knows_doors_only_refusals_and_detail_declarations_down.sql

set local lock_timeout = '2s';

create or replace function iam.is_doors_only_refusal(
  p_permissive boolean, p_roles oid[], p_cmd "char", p_name text, p_qual text, p_withcheck text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- The one shape a DOORS-ONLY refusal may take: it can do nothing but refuse a client write.
  -- RESTRICTIVE; roles within {anon, authenticated} (never PUBLIC, never empty); the name says the
  -- command it refuses; the predicate is literally `false`.
  select not p_permissive
     and cardinality(p_roles) > 0
     and not (0::oid = any (p_roles))
     and p_roles <@ array['anon'::regrole::oid, 'authenticated'::regrole::oid]
     and coalesce(
          (p_cmd = 'a' and p_name like '%\_client\_insert\_refused'
             and p_qual is null and p_withcheck = 'false')
       or (p_cmd = 'w' and p_name like '%\_client\_update\_refused'
             and p_qual = 'false' and (p_withcheck is null or p_withcheck = 'false'))
       or (p_cmd = 'd' and p_name like '%\_client\_delete\_refused'
             and p_qual = 'false' and p_withcheck is null), false);
$fn$;

create or replace function iam.doors_only_refusals(p_tbl regclass)
returns text[]
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  -- The DOORS-ONLY refusal policies on one table (iam.is_doors_only_refusal). Read by
  -- iam.verify_canonical so the certifier accepts exactly these and nothing looser.
  select coalesce(array_agg(p.polname::text order by p.polname), '{}'::text[])
    from pg_policy p
   where p.polrelid = p_tbl
     and iam.is_doors_only_refusal(p.polpermissive, p.polroles, p.polcmd, p.polname::text,
                                   pg_get_expr(p.polqual, p.polrelid),
                                   pg_get_expr(p.polwithcheck, p.polrelid));
$fn$;

comment on function iam.is_doors_only_refusal(boolean, oid[], "char", text, text, text) is
  'True only for a policy that can do nothing but refuse a client write (the DOORS-ONLY shape).';
comment on function iam.doors_only_refusals(regclass) is
  'DOORS-ONLY refusal policies on a table, exact shape only. Read by iam.verify_canonical.';

revoke execute on function iam.is_doors_only_refusal(boolean, oid[], "char", text, text, text) from public, anon, authenticated;
revoke execute on function iam.doors_only_refusals(regclass) from public, anon, authenticated;

do $patch$
declare
  v_def text;
  v_n int;
  r record;
begin
  for r in
    select * from (values
      (1,
       $a$v_unexpected:=ARRAY(SELECT unnest(COALESCE(v_polnames,'{}')) EXCEPT SELECT unnest(v_expected));$a$,
       $a$v_unexpected:=ARRAY(SELECT unnest(COALESCE(v_polnames,'{}')) EXCEPT SELECT unnest(v_expected));
  -- DOORS-ONLY refusals are the chair ruling's own output, in the one shape that can only refuse
  -- (iam.doors_only_refusals). The verifier learns what the ruling emits, as DOORS-ONLY-4 did.
  v_unexpected:=ARRAY(SELECT unnest(v_unexpected) EXCEPT SELECT unnest(iam.doors_only_refusals(v_tbl)));$a$),
      (2,
       $a$v_bespoke:=ARRAY(SELECT unnest(COALESCE(v_polnames,'{}')) EXCEPT SELECT unnest(iam.generated_policy_names()));$a$,
       $a$v_bespoke:=ARRAY(SELECT unnest(COALESCE(v_polnames,'{}')) EXCEPT SELECT unnest(iam.generated_policy_names())
                     EXCEPT SELECT unnest(iam.doors_only_refusals(v_tbl)));$a$),
      (3,
       $a$  v_shareable := EXISTS(SELECT 1 FROM platform.shareable_resource_registry WHERE resource_type=p_token AND is_active);$a$,
       $a$  -- A DETAIL'S REGISTRY AND ITS DECLARATION MUST AGREE. The kernel resolves a token declared in
  -- platform.detail_parent_columns as a detail of its record whatever its registered variant, and
  -- refuses every reader of a `detail` token with no declaration. Certify what the kernel does.
  DECLARE
    v_decl text[] := platform.detail_parent_columns(p_token);
  BEGIN
    check_name:='detail_declaration_matches_registry';
    IF v_reg_variant = 'detail' AND v_decl IS NULL THEN
      status:='FAIL';
      detail:=format('%s is registered detail but platform.detail_parent_columns does not declare how it names its record, so the kernel refuses every reader. Add it to platform.detail_parent_columns.', p_token);
    ELSIF v_decl IS NOT NULL AND v_reg_variant IS DISTINCT FROM 'detail' THEN
      status:='WARN';
      detail:=format('%s is registered %s but the kernel resolves it as a detail of its record (platform.detail_parent_columns). The registry misdescribes the table: re-register it as detail or retire it.', p_token, coalesce(v_reg_variant, 'unregistered'));
    ELSIF v_decl IS NULL THEN
      status:='SKIP'; detail:='not a detail';
    ELSE
      status:='PASS'; detail:=NULL;
    END IF;
    RETURN NEXT;
  END;
  v_shareable := EXISTS(SELECT 1 FROM platform.shareable_resource_registry WHERE resource_type=p_token AND is_active);$a$)
    ) as t(ord, anchor, repl)
    order by ord
  loop
    v_def := pg_get_functiondef('iam.verify_canonical(text,text,text,text)'::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> 1 then
      raise exception 'certify patch %: anchor occurs % time(s) in iam.verify_canonical, expected exactly 1 — nothing was changed', r.ord, v_n;
    end if;
    execute replace(v_def, r.anchor, r.repl);
  end loop;
end
$patch$;
