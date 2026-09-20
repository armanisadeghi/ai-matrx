-- STORE-T file 4, the inverse: both triggers dropped, their functions dropped, and the
-- field shape guard back to the six rule kinds it shipped.

drop trigger if exists custom_record_choice_words on custom.record;
drop trigger if exists zzzz_unique_rule_holds on custom.record;
drop function if exists custom._resolve_choice_words();
drop function if exists custom._unique_rule_holds();
