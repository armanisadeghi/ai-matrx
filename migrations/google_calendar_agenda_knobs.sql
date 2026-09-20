-- google_calendar_agenda_knobs — the two rows the Agenda reads (PLAN §7,
-- google-native; lane U-W2).
--
-- WHY KNOBS AND NOT CONSTANTS (Law 6, `common-docs/policies/limits-are-knobs-
-- agents-set-them.md`): "how far ahead do I look" and "how old is too old to
-- reuse" are postures, not facts. A clinic's front desk lives in today and
-- tomorrow; an agency's account lead plans three weeks out. Neither is wrong,
-- so neither is ours to decide.
--
-- Starting values, and why:
--   google.calendar.agenda_days = 7 (1..31)
--     PLAN §4.6 names it. The ceiling is the PROVIDER bound, not taste: the
--     server's own window is `days: int = Field(default=7, ge=1, le=31)` on
--     `CalendarRefreshRequest` (`aidream/api/routers/google_sync.py`), so a
--     value above 31 would be a setting the screen offers and the refresh
--     refuses. The knob's max is the same 31 for exactly that reason.
--   google.refresh.on_open_min_age_seconds = 300
--     PLAN §7 ("Airtable 5-minute sync floor"). It bounds "refresh on open when
--     stale" for EVERY Google record, not only the agenda — the Docs record
--     already carries the same 300 as its own stand-in default
--     (`features/google-workspace/documents/record.ts`), which is what a knob
--     row replaces. Below ~60s a person arrowing through records spends a
--     Google call per keystroke, which is why the minimum is 30 and not 0.
--
-- Both overridable by organization AND by user: an agenda is a personal
-- surface (the rows are `visibility personal`), so the person whose day it is
-- gets the last word. `override_direction` stays `any` — a tighter or looser
-- window are both legitimate.
--
-- Readers (both through the ONE effective-value read,
-- `lib/scoped-config/effectiveKnobs.ts` → `useEffectiveKnob`):
--   features/google-workspace/calendar/useAgenda.ts
--   features/google-workspace/calendar/record.ts (the defaults that apply until
--   this file is applied; each one announces itself in the surface's own
--   freshness line rather than pretending a row answered).
--
-- Idempotent (ON CONFLICT DO UPDATE on the metadata, never on `value`, so an
-- administrator's change in /administration/users/limits survives
-- re-application). Reversible: DELETE the two rows; the readers fall back to
-- the documented defaults and say so.
--
-- NOT APPLIED by the session that wrote it (U-W2 has no DB write authority):
--   pnpm db:apply migrations/google_calendar_agenda_knobs.sql
-- Ledger: public._schema_migrations (source 'matrx-frontend').

INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  min_value, max_value, label, description, set_by, basis, review_due,
  overridable_by, override_direction
) VALUES
(
  'google.calendar', 'agenda_days',
  '7'::jsonb, '7'::jsonb, 'integer', 'days',
  1, 31,
  'Agenda — how many days ahead to show',
  'How far ahead your Google agenda looks. Today and tomorrow always have their own groups; everything beyond them is grouped by day up to this many days out.',
  'agent',
  'PLAN §4.6 names 7 days with a maximum of 31. The maximum is the provider bound, not a preference: the server refuses a refresh window outside 1–31 days (CalendarRefreshRequest.days, ge=1 le=31), so a larger value would be a setting the refresh could not honour.',
  DATE '2026-10-31',
  ARRAY['organization', 'user'], 'any'
),
(
  'google.refresh', 'on_open_min_age_seconds',
  '300'::jsonb, '300'::jsonb, 'integer', 'seconds',
  30, 86400,
  'Google records — refresh on open when older than',
  'How old a Google record''s last refresh may be before opening it pulls fresh data from Google. Lower means fresher data and more calls to Google; higher means faster opens on data we already hold. Refresh on demand is always available and never waits for this.',
  'agent',
  'PLAN §7, default 300 — the 5-minute sync floor Airtable uses for its own external syncs. The minimum is 30 rather than 0 because a value near zero means one Google call per record opened, which is what arrowing through a list does; it is a spend ceiling, so it is a row an administrator owns.',
  DATE '2026-10-31',
  ARRAY['organization', 'user'], 'any'
)
ON CONFLICT (feature, key) DO UPDATE SET
  default_value      = EXCLUDED.default_value,
  value_type         = EXCLUDED.value_type,
  unit               = EXCLUDED.unit,
  min_value          = EXCLUDED.min_value,
  max_value          = EXCLUDED.max_value,
  label              = EXCLUDED.label,
  description        = EXCLUDED.description,
  basis              = EXCLUDED.basis,
  review_due         = EXCLUDED.review_due,
  overridable_by     = EXCLUDED.overridable_by,
  override_direction = EXCLUDED.override_direction,
  updated_at         = now();
