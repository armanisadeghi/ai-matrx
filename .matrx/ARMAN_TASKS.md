# Arman Tasks — Matrx Frontend

_Last updated: 2026-08-25_

> Secrets, accounts, CDN, OS-only steps. Agents **ask you** when blocked here.
> Code work → `.matrx/AGENT_TASKS.md`. Discoveries → `FOUND_DEFECTS.md`.

---

## Active

_(none)_

## Pending Arman review

### Restart the main Supabase database to release a signal-immune backend (P0)

**Date / source:** 2026-08-25 (rechecked 07:07Z) · `supabase-postgrest` 57014
class on `/marketing/search-console` · 12 exact unresolved system-error IDs:
`637011ab-d262-4362-bf1c-f4962498a1f0`,
`d117aa73-5ec4-479b-a06a-b3941380d564`,
`eee7383f-62fa-445b-9bea-0bc02f90d869`,
`20089577-260c-4c7a-bd00-f1171d5703c8`,
`0d144e10-a2e6-479c-9864-1682f9c00084`,
`b8438297-9b4c-4b36-8b0c-19121799277a`,
`ae905436-5580-4a05-b386-7f03ee0b0d1f`,
`253602e9-a1b0-4a33-8df1-6358c14a60ec`,
`5e784a1c-c05d-4b55-9175-c4838b1e0140`,
`ea74b865-bd3f-4256-b2f6-faaae5aefccf`,
`3424d68a-7cab-44a1-bd0a-d9e349552cd7`, and
`c4a20f16-498f-491d-a592-5cc50faeaf80`.

**Impact:** `seo.gsc_ingestion_health` still times out for the large production
site because `idx_seo_sperf_gsc_health_coverage` remains invalid. The committed
online index repair (`7c33e08751`, split safely by `35282decdf`) cannot finish.

**Verified root cause:** the live concurrent index builder is stuck in
`waiting for old snapshots`. Its last locker is a `postgres`/Supavisor backend
running an `_ip.row_versions` read in one transaction since
2026-08-24 23:13:18Z. Both `pg_cancel_backend` and PostgreSQL 17's timed
`pg_terminate_backend(pid, 5000)` were attempted; the timed termination returned
false and the backend remained active. A temporary one-statement `pg_cron`
drop job also hit lock timeout and was unscheduled, so no patrol job remains.
The 2026-08-25 07:07Z patrol recheck found the same transaction still active,
the index still `indisvalid=false`, and no index builder currently progressing.
One bounded retry returned `pg_cancel_backend=true` but
`pg_terminate_backend(pid, 5000)=false`; the backend remained active.

**Decision / action required:** choose one external-authority recovery:

1. **Recommended:** restart the main Supabase database from the project
   dashboard during the earliest acceptable brief interruption; this releases
   the unkillable backend deterministically.
2. Open an urgent Supabase support case asking them to terminate the backend at
   the host level, avoiding a full database restart but extending the outage of
   Search Console health reads.
3. Defer intervention; the class remains open and every large-site health read
   can continue timing out. This is safe for stored data but not recommended.

**Exactly what Arman must do:** open the main Supabase project, restart its
database (option 1), and reply `restarted` with the completion time. Do not
change timeouts or run SQL.

**What the agent will do afterward:** verify the stale backend is gone, run the
already-committed `DROP INDEX CONCURRENTLY` / `CREATE INDEX CONCURRENTLY`
recovery as two separate one-statement jobs, remove those jobs, prove the index
valid and the live RPC fast for the affected site, confirm zero post-proof
recurrence, and return the exact IDs eligible for resolution.

## Future

_(none)_

## Done

- Independent audit removed ten stale, speculative, already-complete, or
  ordinary-engineering entries: npm publication, transcript nesting,
  other-machine setup, `EntityDoorControls`, chat visibility hardening,
  association-type PK speculation, Content IR backup cleanup/timing, COPPA,
  SMS setup, and the wrong-record patrol nomination (2026-08-25).
- Supabase MCP OAuth confirmed by a live project-list call; stale authorization ask removed (2026-08-25).
- Manual aidream deployment ask removed; the dedicated deploy agent owns the approved cadence (2026-08-25).
- Content IR candidates, `table`, inactive-root posture, and `media_block` crosswalk coverage reconciled; only enforcement timing and post-soak cleanup remain owner-timed (2026-08-25).
- Stale three-defect promotion ask removed: pending review is empty, D45-mobile is fixed, and the definer-grant guard shipped (2026-08-25).
- Gemini TTS B4 regression resolved and live-verified; see `FOUND_DEFECTS.md` D40.
