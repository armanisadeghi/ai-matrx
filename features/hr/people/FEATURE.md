# FEATURE.md — HR People (routes 10–14)

**Status:** `active` · **Tier:** 1 · **Last updated:** `2026-08-28`
**Spec:** [SPEC-EMPLOYEES](../../../../common-docs/projects/hr-domain/specs/SPEC-EMPLOYEES.md) §2.2,
§2.3, §4.1–§4.3, §5, §6, §7.4 ·
[SPEC-UI-IA](../../../../common-docs/projects/hr-domain/specs/SPEC-UI-IA.md) §3.2, §4, §5.1, §5.2.

The employee directory, the org chart, the create/link/convert form, and the twelve-tab employee
profile — the most-opened screen set in the HR module.

## Entry points

| Route                                              | Component                 | File                            |
| -------------------------------------------------- | ------------------------- | ------------------------------- |
| 10 `/hr/people`                                    | `HrDirectory`             | `directory/HrDirectory.tsx`     |
| 11 `/hr/people/org-chart`                          | `HrOrgChart`              | `org-chart/HrOrgChart.tsx`      |
| 12 `/hr/people/new`                                | `HrNewEmployee`           | `new/HrNewEmployee.tsx`         |
| 13 `/hr/people/[employeeId]`                       | `EmployeeProfileRedirect` | `profile/EmployeeProfile.tsx`   |
| 14 `/hr/people/[employeeId]/[tab]` · `/c/[tabKey]` | `EmployeeProfile`         | `profile/EmployeeProfile.tsx`   |
| 15/16 relations · 17 verifications                 | a sibling lane's          | `relations/` · `verifications/` |

Section shell (the route-tab bar) is `HrPeopleShell.tsx`, mounted by
`app/(core)/hr/people/layout.tsx`.

## The rules this feature lives or dies by

1. **A field the viewer cannot access is ABSENT FROM THE DOM.** Not disabled, not masked, not
   `••••`. A tab with no accessible field is not in the tab bar; a section with none renders no
   heading; layout must not leak, because a gap where compensation would be is a disclosure.
   Enforced by `SensitiveField` / `useVisibleFields` (shape of the API, not reviewer memory) plus
   the server sending only the keys a viewer may see. **Scattered `{canSee && …}` is a review
   failure.**
2. **`profile.tabs` IS the tab bar.** Rendered verbatim. Never intersected with a client-side guess,
   never filtered, never added to.
3. **Status is DERIVED from the employment spells as of a date, never stored.** The directory row
   and the profile header both resolve through `hr.employee_directory_status(employee_id, on)`
   (the header prefers `hr.employment_as_of(...).status` and falls back to it for the leavers and
   prehires that resolver correctly answers nothing for). There is no `hr.employee.directory_status`
   column any more: it was `DEFAULT 'active'` with no writer past creation, so every terminated
   person read "Active" and was counted in headcount (**D4**, migration `hr_l1_60`).
4. **One query, real pagination over the full result set.** No capped fetch, no "showing first 100".
   Facet options come from the server (`hr_structure_list`, `hr_org_chart`), never from loaded rows.
5. **A refusal is DATA.** `supabase.rpc()` does not throw on `{granted:false}` / `{ok:false}`. Empty,
   filtered-empty, and refused are three different screens.
6. **Table ⇄ cards is a per-user preference** (`useListViewPrefs`), platform default **cards**
   (Arman's Q2 ruling). Contractors are marked **quietly, as a fact** — one small neutral chip,
   never a lesser status (Arman's Q3 ruling); the marketplace of record shows only in the Job tab.
7. **Capability-gated actions are ABSENT**, never disabled.
8. **Malformed IDs 404 before any read — on EVERY dynamic HR route, not just this lane's.** Each
   `app/(core)/hr/**/[id]/page.tsx` validates with `isFullUuid` before mounting its client reader,
   so invalid route text never reaches a door as a Postgres `22P02`. And when one does slip
   through, the transport says so as a READ: `22P02` on a read is "the address is not a valid
   record id", never "could not be saved… a defect in the form", which is what a mistyped URL
   used to produce on a screen with no form on it (**D11**).

## Internal contracts

- `shared/useHrRequest.ts` — the ONE read hook. Keeps `data` / `denied` / `error` distinguishable,
  and derives loading from the stored request key so no read writes state synchronously in an
  effect. The request is a JSON STRING because a URL-derived filter object changes identity every
  render, which would make an effect fetch forever.
- `shared/useHrStructure.ts` — departments, locations, job titles, for every picker and facet.
- `new/writeAck.ts` — normalizes the WRITE doors' `{ok:false, reason, field, door}` dialect, which
  `callHr` currently mis-reads as success (**D271**). **Delete this file when D271 is fixed.**
- `org-chart/layout.ts` — pure, tested (`__tests__/layout.test.ts`, 13 cases). Two guarantees: a
  reporting cycle can never loop the layout, and sibling order is a function of the PEOPLE so a
  persisting node keeps its slot across an as-of change with no remembered state.
- `doors/HrPersonDoor.tsx` — the four openers for a person. A hand-roll only because `hr_employee`
  has no entity-registry token and no peek kind (**D274**); collapse it to `EntityRef` when they
  land.
- Verification consent is an **identity fact**, resolved by employment-to-login linkage rather
  than current-date employment. `hr_my_verification_consents` is the subject-only read door;
  `hr_verification_consent` is the only decision door, and no HR override may grant consent.

## Known gaps (each a registered promise in `lib/coming-soon/registry.ts`)

| Gap                                         | Why                                                                                                         | Id                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Compensation components, emergency contacts | no per-employee read door (**D273**)                                                                        | `hr.people.compensation-history`, `hr.people.emergency-contacts` |
| Directory file export                       | must be AUDITED; no `hr_directory_export` door, so an unaudited CSV of everyone is deliberately not shipped | `hr.people.directory-export`                                     |
| Org-chart NL query                          | mandate `hr.employees.org_chart_query` unregistered — box renders honestly disabled                         | `hr.people.org-chart-query`                                      |
| Chart PDF/PNG                               | CSV ships first and carries the as-of date                                                                  | `hr.people.chart-image-export`                                   |
| Custom fields                               | platform tier-1 kit is lane L14's; read-only marked adapter meanwhile                                       | `hr.people.custom-fields`                                        |
| Documents · Notes                           | files association / `platform.comments` for an employee not wired                                           | `hr.people.documents`, `hr.people.notes`                         |
| Hosted tabs                                 | Leave, Time, Performance, Training lanes own the bodies                                                     | `hr.people.tab-*`                                                |
| Offboarding · corrective action             | RPCs live; the forms belong to sibling lanes                                                                | `hr.people.start-offboarding`, `hr.people.corrective-action`     |

## Change Log

- `2026-08-30` — A restricted note names its author. `hr._project_row` resolved a display name
  only from `subject_employment_id` / `employment_id`, and `hr.restricted_note` names its person
  `author_employment_id`, so every note on a case rendered unsigned; the projection now has an
  author branch beside its subject one (`author_name`, hr_l3_120a), through the same
  `hr._subject_display_name` door — a name the viewer may not see stays ABSENT, never a uuid.
- `2026-08-29` — Directory status is derived from the employment spells as of today, by one
  shared server function; the `hr.employee.directory_status` column — which had no writer past
  creation, so every terminated person read "Active" and was counted in headcount — is dropped,
  and headcount now resolves from `hr.employment` as route 1 always required (D4).
- `2026-08-29` — A read that fails on a malformed record id says so as a read; the SQLSTATE moved
  behind the "Error reference" disclosure, and the nine dynamic HR routes that were never
  uuid-guarded now are (D11).
- `2026-08-28` — Employee-profile routes reject malformed UUIDs before mounting the client reader,
  preventing database `22P02` failures from typed or automated bad URLs.
- `2026-08-28` — Verification consent now fails closed to everyone except the linked subject,
  including pre-start hires; compensation requests notify that subject and expose a self-scoped
  consent inbox door.
- `2026-08-27` — Hire and effective-dated position-change forms now capture the authored
  standard workweek used to price leave, without inventing a 40-hour default.
- `2026-08-27` — A person's own profile exposes the server-governed directory privacy switch and
  refreshes from stored truth after each self-service write.
- `2026-08-26` — Org-chart dotted-line and person doors retain 44px touch targets below desktop.
- `2026-08-26` — Historical org-chart counts no longer open contradictory current-team lists;
  tablet/mobile chart controls, profile tabs, and new-employee fields meet the touch and label
  contracts.
- `2026-08-26` — Profiles now treat a missing confidential row as `not_collected`; the audited
  private door is called only when that optional row exists.
- `2026-08-26` — Built routes 10–14 (HRB-013, lane L1). Filed D271–D274.
