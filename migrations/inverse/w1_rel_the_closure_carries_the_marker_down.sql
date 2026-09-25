-- based-on: platform.trg_reachability_on_association() 06ce8a5bc6df6c0dd2ab995c5ae44bcb798e13422994476f31d28db312d8e355
--
-- (Read off the branch AFTER the up file applied - an inverse declares the body it is about
-- to overwrite, which is its own up file's, not the one that preceded it. The hash its prose
-- names, 5a7aa32f..., is the body this file RESTORES, which is a different thing.)
-- chair-step: the inverse of W1-REL file 5 - it restores `platform.trg_reachability_on_association()`
-- to the body its `-- based-on:` line names, byte for byte
-- (5a7aa32fa89b44cf0970a58ef317119ccfbece395db8beebd46536e9b16b46b0), removing the block that
-- carries the campaign marker down to `platform.reachability`. Replacing a LIVE trigger body on
-- `platform.associations` is never an unattended production step, so this file is header-less on
-- purpose (§4.9): a file naming production in a `-- target:` header PLUS `-- chair-step:` is
-- refused by both runners as `chair-step-names-production`, and these same bytes rehearse on the
-- branch with `--target branch`, which is how rule 27's "the inverse was RUN on the branch" is met.
--
-- THE PROOF THIS INVERSE WORKED is not that it ran: it is that
-- `sha256(pg_get_functiondef('platform.trg_reachability_on_association'::regproc))` equals the
-- hash above afterwards. A restore that does not reproduce that hash has restored something else.
--
-- IT LEAVES `platform.reachability.origin` ALONE, and leaves the rows already stamped stamped.
-- The column is file 1's and comes off with file 1's inverse; a row that really was written by
-- this campaign does not stop having been, and un-stamping it here would make THE REFRESH delete
-- a graph this campaign still owns.

set lock_timeout = '2s';
set statement_timeout = '300s';

CREATE OR REPLACE FUNCTION platform.trg_reachability_on_association()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP IN ('DELETE','UPDATE') THEN
    PERFORM platform.reachability_touch(OLD.source_type, OLD.source_id,
                                        OLD.target_type, OLD.target_id, OLD.label);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM platform.reachability_touch(NEW.source_type, NEW.source_id,
                                        NEW.target_type, NEW.target_id, NEW.label);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;
