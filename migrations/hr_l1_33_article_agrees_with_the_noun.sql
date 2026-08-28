-- hr_l1_33_article_agrees_with_the_noun.sql
--
-- `hr.wf_request`'s no-possible-approver refusal substitutes the flow key into its
-- sentence, and hard-coded the article as "a %s". The moment the noun began with a
-- vowel it read:
--     "Nobody in this organization can approve a address change yet."
--
-- This is not a log line. It is the sentence a person reads when their own edit will not
-- go through — surfaced verbatim by hr_self_update and rendered in the product — and
-- broken grammar there reads as carelessness about their request.
--
-- Proven live, both articles, through the real door:
--   mailing_address  → "...can approve an address change yet."
--   legal_last_name  → "...can approve a profile edit yet."
--
-- Applied live 2026-08-27 and ledgered.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('hr.wf_request(text,text,uuid,uuid,jsonb,uuid,boolean,text)'::regprocedure);
  if position('THE ARTICLE AGREES WITH THE NOUN' in v_def) > 0 then
    raise notice 'hr_l1_33: already applied'; return;
  end if;

  v_new := replace(v_def,
$a1$      'detail', format('Nobody in this organization can approve a %s yet. Grant the authority first, then submit again.',
                       replace(replace(p_flow_key, '_', ' '), ' request', '')),$a1$,
$r1$      -- 🚨 THE ARTICLE AGREES WITH THE NOUN. The flow key is substituted into this
      -- sentence, so a hard-coded "a %s" produced "a address change" the moment the noun
      -- began with a vowel. This string is not a log line — it is the sentence a person
      -- reads when their own edit will not go through, and broken grammar there reads as
      -- carelessness about their request.
      'detail', format('Nobody in this organization can approve %s yet. Grant the authority first, then submit again.',
                       (select case when noun ~* '^[aeiou]' then 'an ' else 'a ' end || noun
                          from (select replace(replace(p_flow_key, '_', ' '), ' request', '') as noun) q)),$r1$);

  if v_new = v_def then raise exception 'hr_l1_33: message anchor not found'; end if;
  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_request';
  if v_src !~ 'THE ARTICLE AGREES WITH THE NOUN' then
    raise exception 'hr_l1_33: did not land'; end if;
  if v_src ~ 'can approve a %s' then
    raise exception 'hr_l1_33: hard-coded article survived'; end if;
end $verify$;
