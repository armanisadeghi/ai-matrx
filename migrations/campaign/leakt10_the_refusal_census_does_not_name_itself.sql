-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.refusals_claiming_a_level_never_asked() f14d1ce50d91943f0fda9c42c6e8ef21b7cfc14598051fdd97c2f94cd6ac9c79
--
-- LEAK-T10 — CENSUS 14 DOES NOT NAME ITSELF.
--
-- It looks for the sentence "You may read this record" in a body that never asks whether the
-- caller may, and its OWN body has to contain that sentence to look for it. Its first run on
-- the main database named exactly one function: itself. A census that cries wolf about itself
-- teaches the next reader to skim the list, which is how a census stops being read at all.

CREATE OR REPLACE FUNCTION custom.refusals_claiming_a_level_never_asked()
 RETURNS TABLE(function_name text, identity_args text, why text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- A REFUSAL NEVER TELLS SOMEBODY WHAT THEY DO HOLD UNLESS THE DOOR HAS JUST ESTABLISHED IT.
  --
  -- `custom.io_comment_write` refused a person who may not read a record at all with "You may
  -- READ this record but not comment on it." Every word after the first four was a claim about
  -- her, and the only thing the door had asked was whether she reached `commenter`. A sentence
  -- like that is worse than a vague one: it tells her she holds a level she does not, it tells
  -- her the record exists, and it sends her to ask for the wrong thing.
  --
  -- THE CODE, NOT THE PROSE: `--` comments are stripped first, so a comment quoting the old
  -- sentence can never fail this census and a comment promising the check can never pass it.
  select p.proname::text,
         pg_get_function_identity_arguments(p.oid),
         'refuses with a sentence that tells the caller they may READ this record, and the body '
         'never asks whether they may - so the claim is made about somebody the door knows '
         'nothing about'::text
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         ~ 'You may read this record'
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         !~ '''viewer''::public\.permission_level'
     -- THE CENSUS ITSELF. Its body has to CONTAIN the sentence it looks for, so on its first
     -- run it named itself — which is the oldest way a census dies: the reader learns to skim
     -- past one name and then past the next. Named here, once, for that reason.
     and p.proname <> 'refusals_claiming_a_level_never_asked'
   order by 1;
$function$

;
