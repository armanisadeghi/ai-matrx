-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- RULE 30'S GO-SIGNAL CAPTURE GETS A PRODUCER, AND A PLACE TO PUT ITS ROWS.
--
-- ATTACK-6 finding 6. Rule 30 says "the go signal captures every §6.6 object's live
-- definition as SQL, and every OFF-path diff runs against THAT capture" — never against a
-- moving `origin/main`, because both repos take ~400 commits a day and a `git diff` cannot
-- compare a database function body at all. But the capture had no producer, no format and
-- no enumerable object list, while `V8-PROD` fact ④, §6.9 item 9, §6b.4 and the OFF-path
-- diff clause in six lanes' exits all rest on it. That is ATTACK-5 finding 5's own shape —
-- a mechanism named everywhere and existing nowhere — created by the fix for finding 2.
--
-- The producer is `pnpm db:capture-go-signal` (scripts/gate-corpus/capture-go-signal.ts).
-- The chair runs it once, at the go signal; every lane READS these rows and diffs its
-- OFF-path answer against them. One row per captured object, the definition stored as the
-- SQL the server itself prints (`pg_get_functiondef` / `pg_get_constraintdef` /
-- `pg_get_triggerdef` / an ordered column list), so a diff is a text comparison anyone can
-- reproduce.
--
-- Additive: a new table in the campaign's own `campaign_watch` schema, which no live code
-- reads. Its inverse is migrations/inverse/custom_campaign_go_signal_capture_down.sql and
-- refuses while any capture row exists — the capture is evidence, and evidence is not
-- tidied away by an abort checklist.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create schema if not exists campaign_watch;

create table if not exists campaign_watch.go_signal_capture (
  captured_at   timestamptz not null default now(),
  run_id        text        not null,
  knob          text        not null,
  object_kind   text        not null,
  object_id     text        not null,
  definition    text        not null,
  source_db     text        not null,
  primary key (run_id, object_id)
);

create index if not exists ix_go_signal_capture_object
  on campaign_watch.go_signal_capture (object_id, captured_at desc);

comment on table campaign_watch.go_signal_capture is
  'Rule 30 go-signal capture: every BUILD-BOOK 6.6 object''s live production definition as SQL, taken once at the go signal. Every OFF-path diff in this campaign runs against these rows, never against a git ref. Written only by scripts/gate-corpus/capture-go-signal.ts.';
