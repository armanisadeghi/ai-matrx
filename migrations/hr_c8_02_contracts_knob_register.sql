-- hr_c8_02_contracts_knob_register
--
-- HRB-012 (C8). Seeds SPEC-CONTRACTS §8's `hr.contracts` knob register — the transport-behaviour
-- knobs the 60-endpoint catalog resolves. Freeze precondition 10 tests that every seeded `hr.*`
-- knob's `feature` is on R-CORE-READINESS B1's closed list of seventeen slugs; `contracts` is on
-- that list, and this migration re-asserts the property after inserting rather than trusting it.
--
-- WHY THIS LANDS WITH THE FREEZE RATHER THAN WITH THE ENGINE LANES: §8 is this spec's own section,
-- and the platform law is that every ceiling is a knob an admin can change with an agent-chosen
-- starting value and a dated review — never a constant. An unseeded register means each lane
-- hardcodes its own timeout and batch bound, which is exactly the defect the law exists to stop.
-- The endpoints these govern do not exist yet; the knobs are read by the engine when it is built.
--
-- Values, ranges, rungs and bases are §8's table verbatim. Review dates are 90 days out.
--
-- 🚨 ONE KNOB OF THE THIRTEEN IS NOT SEEDED, AND IT IS NAMED RATHER THAN DROPPED:
--   `hr.contracts.provider_retry_policy` is a jsonb object
--   (`{"attempts":3,"backoff":"exponential","base_seconds":5}`) and
--   `platform.feature_knob.value_type` admits only number|integer|boolean|string|enum under a live
--   CHECK. This is the SAME blocker HRB-004 hit on `hr.employees.self_service_field_policy` and
--   routed to the knob-store owner; widening the CHECK has 438 tokens downstream and is not a
--   build lane's call. Until it is widened, the retry policy is resolved by the provider seam from
--   its three scalar parts, which ARE seeded below, so nothing is blocked and nothing is
--   hardcoded — the composite shape is what is deferred, not the behaviour.
--
-- Idempotent.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, review_due)
values
  ('hr.contracts', 'idempotency_retention_hours',
   '72'::jsonb, '72'::jsonb, 'integer', 'hours', 24, 720,
   'Idempotency claim retention',
   'How long an X-Idempotency-Key claim is retained before a replay stops being recognised.',
   'agent',
   'Long enough that a client retrying after an outage still replays rather than double-writes; short enough that the store stays small.',
   current_date + 90),

  ('hr.contracts', 'recompute_batch_max_employments',
   '2000'::jsonb, '2000'::jsonb, 'integer', 'employments', 100, 20000,
   'Recompute batch ceiling',
   'Above this an E-11 recompute run is split into multiple runs.',
   'agent',
   'A single unbounded batch is how a job becomes unkillable.',
   current_date + 90),

  ('hr.contracts', 'export_preview_max_lines',
   '50000'::jsonb, '50000'::jsonb, 'integer', 'lines', 1000, 500000,
   'Export preview line ceiling',
   'Largest payroll preview E-19 will compute synchronously.',
   'agent',
   'Preview is synchronous; this is what keeps it so.',
   current_date + 90),

  ('hr.contracts', 'webhook_skew_seconds',
   '300'::jsonb, '300'::jsonb, 'integer', 'seconds', 60, 900,
   'Inbound webhook clock skew',
   'Replay-window bound on the HMAC-signed inbound provider edge (E-31).',
   'agent',
   'Replay-window bound on the HMAC-signed inbound edge: wide enough for real clock drift, narrow enough that a captured request expires.',
   current_date + 90),

  ('hr.contracts', 'webhook_max_body_bytes',
   '1048576'::jsonb, '1048576'::jsonb, 'integer', 'bytes', 65536, 10485760,
   'Inbound webhook body ceiling',
   'Largest body E-31 will read before refusing.',
   'agent',
   'The HMAC is computed over the raw body, so an unbounded body is an unbounded hash. 1 MiB covers every provider payload we have seen.',
   current_date + 90),

  ('hr.contracts', 'provider_dispatch_timeout_seconds',
   '30'::jsonb, '30'::jsonb, 'integer', 'seconds', 5, 120,
   'Provider dispatch timeout',
   'How long the seam waits on the black box before returning 424 and offering the manual path.',
   'agent',
   'Past this the seam returns 424 hr_provider_unavailable and the manual path is offered, which is D12''s whole point: an org can always record the result itself.',
   current_date + 90),

  ('hr.contracts', 'provider_retry_attempts',
   '3'::jsonb, '3'::jsonb, 'integer', 'attempts', 1, 10,
   'Provider retry attempts',
   'Scalar part 1 of §8''s provider_retry_policy, seeded separately because the composite jsonb form has no home in value_type yet.',
   'agent',
   'Three attempts covers a transient provider blip without turning a hard outage into a long tail of retries.',
   current_date + 90),

  ('hr.contracts', 'provider_retry_backoff',
   '"exponential"'::jsonb, '"exponential"'::jsonb, 'enum', null, null, null,
   'Provider retry backoff',
   'Scalar part 2 of §8''s provider_retry_policy.',
   'agent',
   'Exponential is the only backoff that does not amplify a provider outage into a self-inflicted one.',
   current_date + 90),

  ('hr.contracts', 'provider_retry_base_seconds',
   '5'::jsonb, '5'::jsonb, 'integer', 'seconds', 1, 60,
   'Provider retry base delay',
   'Scalar part 3 of §8''s provider_retry_policy.',
   'agent',
   'The first backoff step. Five seconds is longer than any provider''s own internal retry and shorter than a person waiting on a screen would notice as stuck.',
   current_date + 90),

  ('hr.contracts', 'rule_resolution_cache_ttl_seconds',
   '300'::jsonb, '300'::jsonb, 'integer', 'seconds', 0, 3600,
   'Rule resolution cache TTL',
   'Cache lifetime for a rule resolution. The cache key is (jurisdiction_key, as_of, classes, facts-hash) ONLY.',
   'agent',
   'Never cached across dates (SPEC-JURISDICTION §7.5) — a resolution is as-of a date and reusing it for another date is the single most dangerous cache bug this domain can have. Zero disables the cache.',
   current_date + 90),

  ('hr.contracts', 'calc_prospective_snapshot_retention_days',
   '30'::jsonb, '30'::jsonb, 'integer', 'days', 1, 365,
   'Prospective snapshot retention',
   'How long a prospective (non-evidence) calculation snapshot is kept.',
   'agent',
   'Prospective snapshots are pruned; EVIDENCE snapshots never are. Thirty days covers a full pay cycle of what-ifs.',
   current_date + 90),

  ('hr.contracts', 'export_artifact_signed_url_ttl_seconds',
   '900'::jsonb, '900'::jsonb, 'integer', 'seconds', 60, 86400,
   'Export artifact URL TTL',
   'Lifetime of the signed URL E-23 returns. file_id is the identity; the URL expires.',
   'agent',
   'Long enough to start a download on a slow connection, short enough that a URL pasted into a chat stops working.',
   current_date + 90),

  ('hr.contracts', 'autofill_max_shifts_per_run',
   '500'::jsonb, '500'::jsonb, 'integer', 'shifts', 10, 5000,
   'Autofill shift ceiling',
   'Largest number of open shifts E-16 will fill in one run.',
   'agent',
   'Bounds the optimizer''s search. A larger schedule is split rather than run unbounded.',
   current_date + 90),

  ('hr.contracts', 'sync_endpoint_timeout_seconds',
   '25'::jsonb, '25'::jsonb, 'integer', 'seconds', 5, 60,
   'Synchronous endpoint timeout',
   'Server-side deadline for a sync HR endpoint. Does NOT apply to worker runs (§1.5b).',
   'agent',
   'Below the client''s own timeout so the client sees OUR error envelope, not its own generic network failure.',
   current_date + 90),

  ('hr.contracts', 'mock_mode_enabled',
   'false'::jsonb, 'false'::jsonb, 'boolean', null, null, null,
   'HR mock mode',
   'The server-side half of §6.3''s mock lane. The CLIENT half is the NEXT_PUBLIC_HR_MOCK build flag, which this knob does not and cannot control — see the note below.',
   'agent',
   'Platform-locked false in production. §6.3 names a build-time client flag (NEXT_PUBLIC_HR_MOCK) and §8 names this runtime knob; they are two different mechanisms for two different sides, and neither reads the other. Recorded as a spec delta in FREEZE.md rather than silently reconciled.',
   current_date + 90)

on conflict (feature, key) do update
  set default_value = excluded.default_value,
      value_type    = excluded.value_type,
      unit          = excluded.unit,
      min_value     = excluded.min_value,
      max_value     = excluded.max_value,
      label         = excluded.label,
      description   = excluded.description,
      basis         = excluded.basis,
      review_due    = excluded.review_due,
      updated_at    = now();

-- Freeze precondition 10, asserted rather than assumed: every `hr.*` knob slug must be on
-- R-CORE-READINESS B1's closed seventeen.
do $$
declare
  offenders text;
begin
  select string_agg(distinct feature, ', ')
    into offenders
    from platform.feature_knob
   where feature like 'hr.%'
     and split_part(feature, '.', 2) not in (
       'employees', 'time_and_attendance', 'scheduling', 'leave', 'hiring', 'onboarding',
       'training', 'documents_and_forms', 'access', 'approvals', 'records', 'relations',
       'workflow', 'jurisdiction_rules', 'contracts', 'sms', 'domain_wide');
  if offenders is not null then
    raise exception 'freeze precondition 10 VIOLATED — hr knob slug(s) outside the B1 seventeen: %', offenders;
  end if;
end $$;

-- And the register this migration owns actually landed.
do $$
declare
  n int;
begin
  select count(*) into n from platform.feature_knob where feature = 'hr.contracts';
  if n <> 15 then
    raise exception 'expected 15 hr.contracts knobs, found %', n;
  end if;
end $$;
