-- A signer who has signed (or declined) keeps their page: reopening the link lands on the honest
-- finished state and the Download works. _act_load refused every non-completed envelope once the
-- signer could no longer act ("You have already signed this document"), so the finish page's
-- Download (load -> download) and a reopened link both died. _act_download already allows it.
-- based-on: esign._act_load(jsonb) c5d4cd3bd42ef5403ac71702fb5048dd1cbab5bf92a78198c002736f76eeb0f5
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('esign._act_load(jsonb)'::regprocedure);
  n := replace(d, 'if not (v_can ->> ''can_act'')::boolean and e.status <> ''completed'' then',
                  'if not (v_can ->> ''can_act'')::boolean and e.status <> ''completed''
     and s.status not in (''signed'',''declined'',''acknowledged'') then');
  if n = d then raise exception 'esign._act_load changed shape: the signed-signer gate was not found'; end if;
  execute n;
end
$m$;
