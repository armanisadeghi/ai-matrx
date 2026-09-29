-- Half of storereadperf4_memo.sql (phase :phase). Every door is asked from each seat, once per
-- statement; only digests are kept. Nothing is written.
\set seat admin
\set seat_id :admin_id
\ir storereadperf4_memo_seat.sql
\set seat member
\set seat_id :member_id
\ir storereadperf4_memo_seat.sql
