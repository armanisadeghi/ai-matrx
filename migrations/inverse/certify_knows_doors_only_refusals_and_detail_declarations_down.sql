-- chair-step: rule-27 rehearsal inverse of certify_knows_doors_only_refusals_and_detail_declarations.sql — restores iam.verify_canonical's prior body (the certifier again reports DOORS-ONLY refusals as legacy/unexpected and stops checking a detail's declaration) and drops iam.doors_only_refusals / iam.is_doors_only_refusal. Certifier only: no policy, grant or access changes.
-- based-on: iam.verify_canonical(text, text, text, text) 3a3e4964e02efb001c52815b5de80c7f67a26f896b50484c1c584fc2feb50f45
--
-- Exact textual inverse: every replacement the up file made is swapped back for its anchor (the same
-- DO block with the two columns exchanged, applied in reverse order), each asserted to occur exactly once.

set local lock_timeout = '2s';

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
    ) as t(ord, repl, anchor)
    order by ord desc
  loop
    v_def := pg_get_functiondef('iam.verify_canonical(text,text,text,text)'::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> 1 then
      raise exception 'certify inverse %: anchor occurs % time(s) in iam.verify_canonical, expected exactly 1 — nothing was changed', r.ord, v_n;
    end if;
    execute replace(v_def, r.anchor, r.repl);
  end loop;
end
$patch$;

drop function iam.doors_only_refusals(regclass);
drop function iam.is_doors_only_refusal(boolean, oid[], "char", text, text, text);
