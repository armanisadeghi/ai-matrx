-- chair-step: the inverse of share_the_picker_says_who_is_already_in.sql. Drops the four-argument custom.share_people and its door row. It does NOT put the three-argument one back, because that one's whole defect was a column it could never fill; rule 27 runs this and then re-applies the forward file.
drop function if exists custom.share_people(uuid, uuid, text, integer);
delete from platform.client_callable_door d
 where d.schema_name = 'custom' and d.function_name = 'share_people';
