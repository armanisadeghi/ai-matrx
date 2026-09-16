-- expect: branch=accept production=refuse:header-flag-disagree
-- target: branch
--
-- A rehearsal-only file. `migrations/rehearsal/` exists because a refusal in the runner was not
-- enough on its own, but the refusal is still here.
--
create table if not exists custom.zz_rehearsal (id bigint primary key);
