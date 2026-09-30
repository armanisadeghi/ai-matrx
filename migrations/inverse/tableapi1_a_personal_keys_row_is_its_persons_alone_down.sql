-- chair-step: inverse of tableapi1_a_personal_keys_row_is_its_persons_alone.sql — drops the restrictive SELECT policy; personal-key rows become readable by members of their default organization again (never the secret or its hash).
-- window-class: DROP POLICY on iam.api_keys takes ACCESS EXCLUSIVE plus the 23-relation supautils set (measured 86 ms on the clone, 2026-09-30, lane NIGHT-WINDOW-0930); apply only with Arman watching
--
-- inverse of tableapi1_a_personal_keys_row_is_its_persons_alone.sql

set local lock_timeout = '3s';

drop policy if exists api_keys_personal_rows_are_their_owners on iam.api_keys;
