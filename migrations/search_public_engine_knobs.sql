-- Matrx Search — the knobs the public search endpoint refuses to run without.
--
-- `search.public_providers` is the provider allow-list and the two rate knobs
-- are the per-user ceilings; aidream's `services/search_kinds/access.py` reads
-- all three. A missing knob RAISES by design (there is no constant to fall back
-- on), so without these rows /search returns 500 on every query — which is why
-- the seed is a recorded migration and not a one-off insert.
--
-- Applied live 2026-08-23 via the Supabase MCP; this file is the record.
-- Idempotent: re-running changes nothing an admin has since tuned.

INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  min_value, max_value, label, description, set_by, basis, review_due
) VALUES
('search', 'public_providers', '"brave"'::jsonb, '"brave"'::jsonb, 'string', NULL, NULL, NULL,
 'Providers Matrx Search may run',
 'Comma-separated provider names the public /search endpoint will accept. A provider not on this list is refused with a 400 rather than run.',
 'agent',
 'Brave only. The Google path is fully built and translates cleanly, but it runs on the SerpAPI plan rank tracking spends from (250 searches/month) — a public search box on that allowance would drain a paying customer feature to serve strangers. Turning Google on is this knob, not a deploy, the day the allowance can carry it or Google gets its own plan.',
 '2026-10-23'),
('search', 'rate_limit_per_minute', '20'::jsonb, '20'::jsonb, 'integer', 'searches', 1, 600,
 'Searches per person per minute',
 'Per-user ceiling over a rolling 60 seconds on the public search endpoint. Exceeding it returns 429 with a Retry-After.',
 'agent',
 'A person searching hard runs a handful of queries a minute; 20 is several times that, so no real use ever touches it, while a script looping the endpoint hits it within seconds. Counters are per server process, so the effective platform ceiling is this value times the running task count — sized as an abuse backstop, not a billing meter. Lower it if provider spend spikes; raise it if a genuine power user reports being stopped.',
 '2026-10-23'),
('search', 'rate_limit_per_hour', '300'::jsonb, '300'::jsonb, 'integer', 'searches', 1, 20000,
 'Searches per person per hour',
 'Per-user ceiling over a rolling 60 minutes on the public search endpoint — the slow-drip backstop the per-minute limit cannot see.',
 'agent',
 'Five searches a minute sustained for a full hour. A person researching all afternoon stays far under it; a bot pacing itself just under the per-minute limit is stopped by it. Same per-process caveat as the minute window.',
 '2026-10-23')
ON CONFLICT (feature, key) DO NOTHING;
