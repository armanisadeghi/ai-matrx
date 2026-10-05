-- FTS-2b item 2 — NO STANDARD-TABLE SENTENCE NAMES A RECORD BY A MACHINE WORD.
-- RED while any registry row's label is its own type word or blank (entity_table then prints the table name:
-- party -> "Party"), or while the noun the store prints for a CRM record is not the CRM's own word "Contact".
-- GREEN after lane7fts2b_a_a_crm_record_is_called_a_contact.sql.
\set ON_ERROR_STOP on
\set suite 'fts2b_a_crm_record_is_called_a_contact_red_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
do $g$
declare v text; w text;
begin
  select string_agg(token || '=' || coalesce(label, '<blank>'), ', ' order by token) into v
    from platform.entity_types
   where is_active and (nullif(btrim(label), '') is null or lower(label) = lower(type));
  if v is not null then
    raise exception 'RED: registry rows labelled by their type word or blank (sentences print the table name): %', v;
  end if;
  select label into w from custom.entity_table('party');
  if w is distinct from 'Contact' then
    raise exception 'RED: the store calls a CRM record "%", not "Contact"', w;
  end if;
  raise notice 'GREEN: every registry label is a person-facing noun; a CRM record is a Contact';
end $g$;
