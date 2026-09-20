-- chair-step: it puts back the census 14 body that named ITSELF, because its own text has
-- to contain the sentence it looks for.
--
-- THE INVERSE of migrations/campaign/leakt10_the_refusal_census_does_not_name_itself.sql.

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
   order by 1;
$function$;
