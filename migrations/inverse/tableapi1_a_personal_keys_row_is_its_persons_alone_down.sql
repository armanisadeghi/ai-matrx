-- chair-step: inverse of tableapi1_a_personal_keys_row_is_its_persons_alone.sql — drops the restrictive SELECT policy; personal-key rows become readable by members of their default organization again (never the secret or its hash).
--
-- inverse of tableapi1_a_personal_keys_row_is_its_persons_alone.sql

set local lock_timeout = '3s';

drop policy if exists api_keys_personal_rows_are_their_owners on iam.api_keys;
