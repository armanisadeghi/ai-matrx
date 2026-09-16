-- expect: branch=refuse:header-target-unknown production=refuse:header-target-unknown
-- target: staging
--
-- A target this runner does not know is refused while the header is READ, never coerced.
--
create table if not exists custom.zz_x (id bigint primary key);
