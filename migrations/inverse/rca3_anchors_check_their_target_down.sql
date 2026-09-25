-- chair-step: RC-A3 inverse of rca3_anchors_check_their_target — puts back the structure-only edge validator (no target check, a second passage replaces the first) and drops the target check and the unattached comment-trigger body.
-- based-on: platform._associations_validate_text_anchor() a671a01cf340677cd7ac80396bf10c94a48cf621bb1b3ba9f9824cf08a2d235e
-- ground-standing-ok: b, c — (b) inverses run newest first: this file runs before
-- rca3_text_anchor_and_annotates_down.sql, which drops the trigger and then the validator it calls, so the
-- restored body and platform.text_anchor_problem leave together; (c) platform._comments_validate_text_anchor is
-- created by the up file for a trigger the window file attaches — until then NO trigger runs it, so dropping it
-- here puts back exactly the state before the up (the window file's own inverse detaches its trigger first).

set local lock_timeout = '5s';

CREATE OR REPLACE FUNCTION platform._associations_validate_text_anchor()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_problem text := platform.text_anchor_problem(new.payload);
begin
  if v_problem is not null then
    raise exception 'platform.associations: this % -> % edge carries an invalid text_anchor: %', new.source_type, new.target_type, v_problem
      using errcode = '23514',
            hint = 'Send a text_anchor built from the target''s canonical body at one content_version: Unicode code-point start/end, the exact quote, up to 64 code points of prefix and suffix. A whole-document link carries no payload.';
  end if;
  return new;
end;
$function$

;

drop function platform._comments_validate_text_anchor();
drop function platform.text_anchor_target_problem(text, uuid, jsonb);
