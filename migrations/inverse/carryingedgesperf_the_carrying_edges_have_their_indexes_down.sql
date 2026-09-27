-- chair-step: the inverse of migrations/campaign/carryingedgesperf_the_carrying_edges_have_their_indexes.sql (lane CARRYING-EDGES-PERF) — drops the two partial indexes it built, concurrently. Nothing of anybody's data is touched. Run it only AFTER the inverse of the sibling body file (the body it serves works without them, only slower).

drop index concurrently if exists platform.idx_assoc_org_pair_live;
drop index concurrently if exists platform.idx_assoc_org_role_live;
