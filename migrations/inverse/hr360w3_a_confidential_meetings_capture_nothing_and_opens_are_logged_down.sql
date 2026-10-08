-- chair-step: HR-360 wave 3 inverse — drops what hr360w3_a added: the meet_meetings capture trigger and its two functions, the audited open door and its door row, and the meet.confidential_capture knob row. Replaces no body.
drop trigger if exists _meet_confidential_capture on communication.meet_meetings;
drop function if exists communication._meet_confidential_capture();
drop function if exists communication.meet_carries_confidential_record(jsonb);
delete from platform.client_callable_door where schema_name = 'iam' and function_name = 'open_confidential_audited';
drop function if exists iam.open_confidential_audited(text, uuid, text);
delete from platform.knob_override where feature = 'meet' and key = 'confidential_capture';
delete from platform.feature_knob where feature = 'meet' and key = 'confidential_capture';
