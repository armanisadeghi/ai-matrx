-- chair-step: inverse of accesssetup_b — drops the access-setup functions, the validating trigger and the iam.record_seat_set door (its platform.client_callable_door row first). Run the accesssetup_c and accesssetup_d inverses first: hr.review_* resolvers and the hr_review setup row depend on nothing here, but the setup row is only validated through these functions.
-- lane: access-setup
-- lock: iam

delete from platform.client_callable_door where schema_name = 'iam' and function_name = 'record_seat_set';
drop function if exists iam.record_seat_set(text, uuid, text, uuid, text, text);
drop trigger if exists access_setup_validate on iam.access_setup;
drop function if exists iam._access_setup_validate();
drop function if exists iam.access_setup_check(text);
drop function if exists iam._access_setup_problems(text, jsonb);
drop function if exists iam.redact_by_parts(text, uuid, uuid, jsonb);
drop function if exists iam.records_where_seated(uuid, text, uuid);
drop function if exists iam.seat_holders(text, uuid);
drop function if exists iam.parts_for(uuid, text, uuid);
drop function if exists iam.may_act(uuid, text, uuid, text);
drop function if exists iam.part_level(uuid, text, uuid, text, text, uuid);
drop function if exists iam._cells_for(uuid, text, uuid, text);
drop function if exists iam.seats_of(uuid, text, uuid);
drop function if exists iam._seat_table(text, uuid);
drop function if exists iam._access_setup_stage_reached(jsonb, text[]);
drop function if exists iam._access_setup_stages(jsonb, uuid);
drop function if exists iam._access_setup_facts(jsonb, text, uuid);
drop function if exists iam._access_setup_call_uuid(text, uuid);
drop function if exists iam._access_setup_head_org(text, uuid);
drop function if exists iam._access_setup_of(text);
grant select on iam.record_seat_change to authenticated;
