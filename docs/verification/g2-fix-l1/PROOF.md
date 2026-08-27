# HRB-013 (L1) — G2 reopen, fix evidence

**Fixed by:** lane-l1-employees. **Date:** 2026-08-26.
**Environment:** live DB `db.matrxserver.com`; preview `localhost:3001`; **`NEXT_PUBLIC_HR_MOCK=0`**
(verified in `.env.local` before every check below, and left at `0`).

> Every check below was run through **PostgREST** — `POST /rest/v1/rpc/<fn>` with a real user's
> access token from the password grant, `Content-Profile: public`. That transport is the point:
> **F1 was invisible to this lane precisely because its own probes ran through the Supabase MCP's
> `execute_sql`, which is not read-only.** A door tested only through a read-write session is
> untested for the one property PostgREST imposes.

## F1 — every employee profile page was dead (`25006`)

`public.hr_employee_profile` was `STABLE` and audits every read (§1.3). PostgREST runs `STABLE`
functions in a **read-only transaction**, so the mandatory audit INSERT aborted the call.

**Before:** *"This employee record could not be loaded. cannot execute INSERT in a read-only
transaction … 25006"* — for everybody, admin included.

**After** (`POST /rest/v1/rpc/hr_employee_profile`, employee `556eab49-…`):

```
granted: True | viewer: hr_admin | tabs: 11 | name: Dana Ruiz | audited: True
```

`audited: True` is the load-bearing part — `private_audit_id` is non-null, so the audit row that
used to abort the transaction is now written inside it.

**Browser:** `/hr/people/556eab49-…?org=zzz-throwaway-surface-test-org` renders the full profile —
header (Dana Ruiz, legal name, 0 direct reports, `EMP-00002`, CRM-record door), all eleven tabs,
the Personal tab with real values, and the §1.3 line *"Opening this tab is recorded in this
person's access log."* SSN shows *"Not collected — Last four digits. The full number is behind an
audited request."*

**Fixed as a class, not an instance.** Expanding the call graph transitively found **three**
non-volatile doors that can reach one of the four audit writers, not one:

| Door | Reaches | Owner |
|---|---|---|
| `public.hr_employee_profile` | `hr._record_access_audit` (depth 1) | L1 — the reported one |
| `public.hr_structure_list` | an audit writer (depth 3) | L1 |
| `public.hr_wf_instance` | `hr._governance_refusal` (depth 3) | **L10** |

`hr_wf_instance` is the one nobody would have found by testing: it succeeds when the caller has
standing and `25006`s **only on its refusal branch**. All three are `VOLATILE`.
`hr.stable_doors_that_write()` now re-derives that graph on demand and returns **0 rows**.

## F2 — no employee could be created (`22P02`)

`v_legs := v_legs || 'name_trgm'` — PL/pgSQL resolves the untyped literal against the array on the
left, so the string parses as an **array literal**. Eight occurrences; fired whenever any probe
field was present, i.e. always. The scan gates the write, so all four entry routes were blocked.

**After** (`POST /rest/v1/rpc/hr_duplicate_scan`):

```
ok: True | legs_run: ['name_trgm', 'work_email'] | skipped: ['personal_email', 'ssn_hmac']
```

`name_trgm` — the exact leg that raised — runs. The two skipped legs are honest absences (no
personal email supplied; the SSN HMAC can only be computed by aidream, SPEC-ACCESS §4.5).

**End to end** (`POST /rest/v1/rpc/hr_employee_create`) — the person the verifier could not create:

```json
{"ok": true, "employee_id": "b96d96ba-5e17-46ba-ae35-7b1afc444208",
 "employee_number": "EMP-00003", "employment_id": "4f0b65e8-3e6d-4f54-81d3-7fbfb279af8b",
 "position_assignment_id": "5d37d966-1e1e-4ebc-8ca1-656d77294693",
 "compensation_id": "4fe400f9-cd41-4caf-9374-cd43f5f0dd9c",
 "party_id": "febe7f2c-615d-4fcd-9f5f-e2b86b0e79f4",
 "directory_status": "prehire", "is_prehire": true,
 "door": "/hr/people/b96d96ba-…/job"}
```

Marisol Okonkwo (goes-by `G2R-Marisol`), Operations Specialist, Sandbox HQ, hired 2026-09-15 at
$27.50/hr — one employee, one employment, one position, one compensation row, in one transaction.

A refusal on the same door still names its field, checked deliberately by omitting the location:
`{"ok": false, "reason": "validation", "field": "location_id", "detail": "A position needs a location."}`

## F5 — HR could not be switched on, and the CTA pointed at an empty card

`public.hr_org_summary` had never shipped, so `OrgHrPeopleSection` rendered `null` in every org and
`/hr`'s "Turn on HR" pointed at a card the verifier measured as **zero links, zero buttons**. And
nothing anywhere wrote `settings->hr->module_enabled`, while the activation wizard sits behind it.

**After**, on the exact org the verifier used (Castellano & Reyes, `7cd12da2-…`, HR off):

```json
// hr_org_summary — the read that never existed
{"organization_id":"7cd12da2-…","module_enabled":false,"is_activated":false,
 "headcount":0,"prehire_count":0,"pending_approvals":0,"can_enable":true}

// hr_module_set_enabled — the writer that never existed
{"ok":true,"module_enabled":true,"is_activated":false,
 "records_retained":true,"next":"activation_wizard"}
```

`can_enable: true` is what makes the card render the enable door instead of nothing; the writer is
what makes that door do something. **HR is now switched on for Castellano & Reyes through the
product's own RPC** — the state the verifier needs to re-run T-L1-1 from zero. Switching off
retains every record (`records_retained: true`): §1.3's absent-not-disabled applies to modules.

## Also fixed, in this lane's own file and reported by the verifier

`liveKioskDeviceAdminSource` threw away the server's named refusal. There are **two** refusal
shapes — this lane's flat `{ok:false, reason, detail}` and the kiosk family's nested
`{ok:false, error:{code, message}}` — and reading only one replaced
`hr_kiosk_location_required`'s actionable sentence with *"We could not generate a pairing code."*
Both shapes are read now (SPEC-ACCESS §4.2's denial-names-what-was-missing rule).

## Not this lane's, reported rather than touched

- **Report F4** — `PairingCodePanel.tsx:45` hardcodes `locationId: null` and the dialog has no
  location picker. L3's file; L3 has since landed a fix (`59464b402c`).
- **Report F6** — the blocked clock discards the server's sentence and door. L3's.
- `public.hr_wf_instance` was flipped `VOLATILE` here because its refusal branch was broken and the
  fix is one word. **HRB-022: yours, noted, no action needed.**

## Migrations

`hr_l1_12_g2_reopen_fixes` — applied live and ledgered in `public._schema_migrations`
(`matrx-frontend/migrations/hr_l1_12_g2_reopen_fixes.sql`).

## Not claimed

None of the R-L1 acceptance targets is claimed here. This file evidences that four **defects** are
gone, not that any target passes. **The independent verifier re-runs; only its pass closes the
reopen** (D15 §7.4).

## F3 — pay groups and org structure had no create control

Fixed by a sub-agent (`97316744c8`); verified here in the browser at
`/hr/settings/pay-groups?org=zzz-throwaway-surface-test-org`:

- a header action **"+ New pay group"**, and — the part that was missing — the **empty state now
  carries its own "+ New pay group" button**. The verifier's finding was that the empty state
  *"offers nothing to click"*; it now offers the thing it is explaining.
- clicking it opens the create form inline, pre-filled (Every two weeks, today, Sunday 12:00 AM)
  and carrying §2.4 route 70's rule in bold: **"Existing workweeks are not re-cut."**

That agent also caught a wrong claim in the verification report itself. The report says the write
"exists and works — `upsertHrStructure`, `kind: "pay_group"`". It does not:
`hr_structure_upsert` accepts `department | location | job_title` only and answers
`22023 pay_group is not a structure kind`. Pay groups go through `public.hr_pay_group_upsert`.
The panel now calls the right one.

## 🚨 F3's other half — nothing could be ATTACHED to a pay group

Found while proving F3. The verifier's recorded consequence of F3 is the one that matters:
*"both live employments carry `pay_group_id = NULL` … this is the single defect that makes P-8
permanent."* Shipping the create control fixes half of it — creating a pay group and attaching
nobody to it changes nothing.

**No `public.hr_*` RPC wrote `pay_group_id` at all.** `hr_employee_create` accepts it at hire and
`hr_structure_list` reads it; nothing else in `public` mentions the column. So every person hired
before a pay group existed — which was everyone, because the group could not be created — could
never be attached to one through the product.

`public.hr_employment_set_pay_group` (migration `hr_l1_13_employment_pay_group`) is that writer:
narrow, audited, and refusing a pay group belonging to a different employer of record, because a
pay group hangs off `hr.employer_profile` and attaching across employers would cut somebody's
periods against another company's calendar. The move is **not retroactive** and the envelope says
so (`existing_periods_recut: false`) — the same rule route 70 states for the workweek boundary.

**Live result — the G2 vertical now has its first step:**

```
pay group: 6f029464-bfce-45a4-b306-d8cc237886bc  "Sandbox Biweekly"  biweekly
  Dana Ruiz             → attached  (existing_periods_recut: false)
  G2R-Marisol Okonkwo   → attached
  Armani Sadeghi        → attached
```

## Note on browser evidence

The preview pane was being driven concurrently by another agent throughout this work and hid
between actions, so some steps were proven through PostgREST rather than by click. Every such step
says so above, and the transport used is the same one the browser uses. The screenshots that were
captured — the rendered profile (F1), the pay-groups create affordances and the open create form
(F3) — are the ones where the affordance itself was the thing under test.

## 🚨 The fix for F5 was itself broken, and clicking the button is what found it

`hr_module_set_enabled` shipped, returned `{"ok": true, "module_enabled": true}`, and **wrote
nothing**. `/hr?org=castellano-reyes` still said *"HR isn't turned on for this organization"* and
`iam.organizations.settings #> '{hr}'` was still NULL.

Not RLS, not permissions:

```sql
jsonb_set('{}'::jsonb, array['hr','module_enabled'], 'true', true)  →  {}
```

**`create_missing` creates only the LAST element of a path.** When any PARENT is absent,
`jsonb_set` returns the document unchanged — no error, no warning, and the UPDATE genuinely ran,
so nothing downstream could tell. Every organization whose `settings` had no `hr` key — i.e. every
org that had never used HR, i.e. exactly the ones the function exists for — was unwritable.

**The second victim was worse and nobody had clicked it yet.** `hr_knob_set` writes
`array['hr', v_slug, p_key]` the same way, so an org's **first** knob override silently did nothing
while route 67 reported the key as overridden. The *second* override on the same slug would have
worked — a bug that fixes itself after one confusing failure and leaves no trace.

Both now build the path with `||` (which creates parents) **and read the value back**, refusing
with `write_did_not_land` if it is not what was asked for. That read-back, not the operator, is
what makes the class impossible: this is the same law `hr._wf_apply` already states — *"an apply
that did not happen is NEVER recorded as happened"* — and both functions had been building their
success envelope from their INPUT.

Migration `hr_l1_14_jsonb_set_cannot_create_parents`, with a planted known-bad probe: it writes
through an org that has no `hr` settings key, asserts the value landed, and restores the original
document.

**Live, end to end, in the browser:**

```
iam.organizations.settings->'hr'  →  {"module_enabled": true}
hr._l1_module_enabled(…)          →  true
```

`/hr?org=castellano-reyes` now renders **"Set up HR for this employer — Tell us who the employer of
record is, where people work, and who runs HR. It takes three steps and you can change all of it
later."** with a **Set up HR** button. The circular dead end is closed: module off → enable →
activation wizard.
