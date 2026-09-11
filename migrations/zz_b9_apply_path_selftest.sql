-- B-9 forcing test (GREEN): whole file applies, ledger records what executed.
create schema if not exists zz_b9_selftest;
create table zz_b9_selftest.landed (id int primary key, note text);
insert into zz_b9_selftest.landed (id, note) values (1, 'first statement');
comment on table zz_b9_selftest.landed is 'trailing statement — the class of statement that was dropped on the hand-apply path';
-- drift
