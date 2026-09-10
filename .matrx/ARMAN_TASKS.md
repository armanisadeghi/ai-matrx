# Arman Tasks — Matrx Frontend

_Last updated: 2026-08-25_

> Secrets, accounts, CDN, OS-only steps. Agents **ask you** when blocked here.
> Code work → `.matrx/AGENT_TASKS.md`. Discoveries → `FOUND_DEFECTS.md`.

---

## Active

_(none)_

## Pending Arman review

- **Masterwork module home — do you want it back, and where? (2026-09-10)**
  **One decision, one sentence either way.** `features/masterwork/home/`
  (`MasterworkHomePage.tsx`, `HowItsImprovingPanel.tsx`, `service.ts` — 1,022
  lines) is built, compiling and archive-lawful, and **nothing renders it.**
  - **Why nothing renders it:** your own commit `00602a2916` (2026-08-21) made
    `/masterwork` bounce signed-in Experts to `/masterwork/all` — *"'/masterwork'
    is the marketing page (authed bounce to /all on the canonical list
    template)"*. That is your call and no agent may reverse it, which is why
    this is a question and not a fix.
  - **What is unreachable because of it:** `/masterwork/all` is a generic
    Rulebook entity list. It has **none** of the home's review KPI strip,
    per-Masterwork release state + quality trend, recent runs, Approach start
    tiles, or the "How it's improving" Hindsight panel.
  - **What already happened:** an agent DELETED the directory on 2026-09-10 for
    being unreferenced; an independent review caught it as a breach of
    `common-docs/policies/unfinished-work-alarm.md` § The ban (only you may name
    something dead, in writing), and it was restored the same day. The files
    now carry a loud do-not-delete header pointing here.
  - **The choice:** (a) put it back at `/masterwork` for signed-in Experts —
    the one-line revert of `00602a2916`'s bounce; (b) give it its own route and
    a nav entry; (c) fold its five panels into `/masterwork/all`; or (d) say the
    word and it goes for good.
  - **Recommendation: (a).** It is the smallest change, it is what the code was
    written for, and `/masterwork/all` stays exactly where it is for the list.
  - Live now: `/masterwork` (the bounce) and `/masterwork/admin` (the map row
    that records this).

## Future

_(none)_

## Done

- Definer-guard section E applied and live-verified after Arman cleared the permission block:
  `platform.enforce_definer_client_grants` now matches grandfather/door rows through
  `platform.normalize_identity_args`, closing the search_path rendering class for future
  functions too; the guided SQL-editor step is no longer needed (2026-08-29).
  **Superseded the same day — do not read this as the live body:** `hr_l3_109_fix_grandfather_match_and_restore`
  landed after it and matches on argument-type **OIDs** (`g.argtypes = p.proargtypes::text`), not
  through `normalize_identity_args`, which the live function no longer calls. `hr_l3_110` then made
  every revoke announce itself. Read the live body, never a migration file (2026-08-29).
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
