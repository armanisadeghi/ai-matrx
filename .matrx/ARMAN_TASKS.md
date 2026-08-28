# Arman Tasks — Matrx Frontend

_Last updated: 2026-08-25_

> Secrets, accounts, CDN, OS-only steps. Agents **ask you** when blocked here.
> Code work → `.matrx/AGENT_TASKS.md`. Discoveries → `FOUND_DEFECTS.md`.

---

## Active

- **Apply the pending guard-hardening section of the definer-grant fix (one SQL run).** The 2026-08-28
  production outage (42501 `permission denied for function has_access` on reads platform-wide) is
  already FIXED live — door registry, grandfather repair, and grants are applied and verified. One
  belt-and-suspenders piece remains: replacing `platform.enforce_definer_client_grants` so its
  grandfather/door matching is search_path-independent for FUTURE functions (the agent sandbox's
  permission gate refused replacing a security-enforcement function). Guided step: open the SQL
  editor at https://supabase.com/dashboard/project/brsgrqvjdzwihsvnfqkf/sql/new, paste the entire
  contents of `migrations/definer_guard_search_path_grandfather_fix_2026_08_28.sql` (idempotent —
  the already-applied sections no-op), click **Run**, and confirm it reports success with no red
  error. Report back: "definer guard section E applied" (2026-08-28).

## Pending Arman review

_(none)_

## Future

_(none)_

## Done

- Main Supabase restart released the signal-immune backend; the committed GSC coverage index was rebuilt online and live-proven in 1.122s on the 9.24M-row site, with all 12 exact timeout rows resolved (2026-08-25).
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
