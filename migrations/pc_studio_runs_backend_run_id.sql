-- The backend mints its own podcast run_id (echoed in the early podcast_run
-- event) and checkpoints generation under it. Storing it lets the client resume
-- an interrupted run via POST /podcast/resume/{backend_run_id} — so a long run
-- survives navigation / a dropped connection instead of being lost.
alter table public.pc_studio_runs
  add column if not exists backend_run_id text;
