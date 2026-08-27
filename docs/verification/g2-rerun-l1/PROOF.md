# G2 re-run — L1 (HRB-013) evidence

`NEXT_PUBLIC_HR_MOCK=0` throughout. Live DB `db.matrxserver.com`
(project `brsgrqvjdzwihsvnfqkf`), dev server `http://localhost:3001`.

> **On screenshots.** The in-app browser returns screenshots inline to the agent
> session; it exposes no path for them, and no file lands on disk. Rather than
> cite files that do not exist, every claim below is recorded as the **verbatim
> DOM text** of the page at that moment, which is greppable and re-runnable. The
> URLs and identifiers are real and the verifier can reproduce each step.

---

## Item 1 — an employee login can now be created through the product

The constraint the coordinator called out as outranking the whole bug list. It is
closed end to end, in the product, with no SQL console step in the path.

**Server:** `hr_employee_invite` / `hr_invite_accept` (migration
`hr_l1_16_employee_login_invite.sql`), delegating to the platform's own
`iam.inv_create` / `inv_accept` — not a parallel invitation system.

**Client (this wave):**

- `features/hr/people/profile/PlatformAccessSection.tsx` — the issue control,
  mounted on the Personal tab.
- `app/(core)/invitations/employee/accept/[token]/{page,layout}.tsx` — the accept
  page at the path `hr_employee_invite` returns.
- `inviteHrEmployeeLogin` / `acceptHrEmployeeInvite` in `features/hr/service.ts`.

### 1a. HR admin issues the invite from the employee record

`/hr/people/556eab49-f8ef-4ece-a4dc-2806b3abbca9/personal?org=zzz-throwaway-surface-test-org`
signed in as the admin. Before clicking:

```
Platform access

This person does not sign in to AI Matrx. Inviting them lets them see their own
record, their pay stubs and their schedule — it does not change anything about
their employment, and they are not required to accept.

[ dana.ruiz@example.test ]  (Invite to sign in)

Leave the address blank to use their work email. They will only get a login once
they accept it themselves.
```

After clicking **Invite to sign in** — toast `Invitation issued to dana.ruiz@example.test`:

```
Platform access

Invitation issued to dana.ruiz@example.test — it stops working after Sep 3, 2026.

The invite email is sent where email is configured. The link below is the same one
it carries — the person needs an account with this email address to use it.

http://localhost:3001/invitations/employee/accept/3d53f447-a061-4e87-96f6-0282adb18649   (Copy)

This link is single-use and is as good as the invitation itself. Send it to Dana
Ruiz and to nobody else.
```

**The reported constraint, honestly:** local mail cannot deliver (signup 500s on
"Error sending confirmation email"), so the door returns the token to the issuing
admin and the UI presents it as the admin-visible activation link — the
spec-supported alternative the coordinator named. This is a deliberate difference
from the platform's other invite surfaces, which never expose a token because they
assume mail arrives. The link is single-use, expiring, and reaches only a caller
who has already passed the `identity.write` gate.

### 1b. The person accepts and lands signed in, linked

Opened the link as Dana (session established through the product's own
`/auth/confirm` magic-link route — the real email path, with the link fetched
directly since mail cannot deliver):

```
Your employee record is waiting

Accepting links this account — dana.ruiz@example.test — to your employee record,
so you can see your own details, pay and schedule. It links the account you are
signed in as right now, so if that is not you, sign out first.

(Accept and open my record)
```

Clicked. The link landed, verified on the wire as the admin:

```
login_user_id: f83af954-1fd1-46d5-bfc1-54cb27d98666
dana.ruiz@example.test auth id: f83af954-1fd1-46d5-bfc1-54cb27d98666
MATCH: True
```

And Dana's own `/hr/me?org=zzz-throwaway-surface-test-org`, signed in as herself:

```
Dana Ruiz
Legal name
Dana Ruiz            ← she is `self`, so the gated key IS sent
0 direct reports
EMP-00002
Platform account     ← the header door, present only now that a login exists
Personal | Job & reporting | Compensation | Time off | Time & schedule |
Training | Performance | Emergency contacts | Documents
…
Platform access

This person signs in to AI Matrx. Their account is linked to this record, which
is what gives them their own HR access.
```

**Test fixture, declared:** Dana's `auth.users` row was created through the admin
API because local signup cannot send a confirmation mail. Everything after that —
issuing, accepting, linking, signing in — is the product path.

### 1c. A defect this test found: the accept door dropped the employer

Migration **`hr_l1_19_accept_door_carries_the_employer.sql`** (applied + ledgered).

Accepting succeeded but the server's `door` was a bare `/hr/me`, and the first
thing the new employee saw was:

> HR isn't turned on for this organization
> You can turn it on in this organization's settings.

— true of an organization she has nothing to do with. Signing up creates a
personal workspace, so on acceptance she had two employers:

```
4a82ec98…  dana.ruiz's Workspace   module_enabled = false  persona = null
2643e470…  Write Target Sandbox    module_enabled = true   persona = employee
active: None
```

`hr_my_context` correctly refuses to guess between two candidates — the picker is
§1's specified answer. The defect was that `hr_invite_accept` computed `v_org`,
returned it in the envelope, and then left it off the door it told the caller to
walk through. Fixed; verified live in `prosrc`:

```
'grants_rederived', true,
-- 🚨 THE DOOR CARRIES THE EMPLOYER. …
'door', '/hr/me?org=' || v_org::text);
```

`hr_my_context` is deliberately unchanged.

---

## Item 2 — `hr_employment_set_pay_group` has callers

Migration `hr_l1_13_employment_pay_group.sql`; wired in the hire and employment
forms (`features/hr/people/profile/tabs/JobTab.tsx`, `PayGroupCard.tsx`) with
`setHrEmploymentPayGroup` in `features/hr/service.ts`. Sandbox pay group
`6f029464-bfce-45a4-b306-d8cc237886bc` ("Sandbox Biweekly") is attached to three
employments.

The control states the truth the door reports rather than a hopeful one: moving
somebody between pay groups is **not** retroactive — `existing_periods_recut` is
read from the envelope, never assumed.

---

## Item 3 — the org-chart "1 report" door: already fixed, not fixed twice

**Confirmed already repaired by the review-pass agent** (queue row `e0e3820d`),
commit `2020c2aae8 fix(hr): repair people touch and history affordances`. Per the
coordinator's instruction, skipped.

`features/hr/people/org-chart/HrOrgChart.tsx`:

```tsx
reportsHref={
  isAsOfView
    ? null
    : hrPeopleHref({ org: orgRef, managerEmployeeId: employeeId })
}
```

The reasoning holds up: `hrPeopleHref` has **no** `asOf` option, and the directory
is the one sanctioned consumer of `current_*` — a today-list that cannot answer
as-of. So on a historical chart the count renders as **text, not a link**, instead
of opening a directory that would honestly say "0 people". Both branches still
render the count; only the false door is withdrawn.

---

## Two §1.3 violations the first real employee login exposed

Having a non-admin identity for the first time paid for itself within minutes.

**`hr_l1_17_peer_tab_absence.sql`** — the profile offered a `peer` the **Job** tab,
whose door (`hr_employment_history`) refuses `peer` outright. §1.3: "A tab whose
every field is inaccessible is not in the tab bar." An empty Job tab also leaks —
it tells a colleague a job record exists and that somebody else can read it.
Personal stays, because what a peer gets there is the directory tier they can
already read.

**`hr_l1_18_absent_not_null.sql`** — opening a colleague's profile rendered:

```
Dana Ruiz
Legal name
Not provided
```

Dana's legal name *is* Dana Ruiz. `ProfileHeader.tsx` asserted the right intent
("THE LEGAL NAME IS ABSENT, NOT BLANK"), but the server built the key as
`'legal_name', case when v_kind in ('self','hr_admin') then … end`, and
**`jsonb_build_object` keeps a key whose value is NULL**. `SensitiveField` found
the key and rendered "Not provided" — a false statement about somebody's record,
and exactly the masked-field shape §1.3 forbids.

`jsonb_strip_nulls` would be the wrong fix: most nulls here are honest (`pronouns`
null means unset, and "Not provided" is right). **The distinction is permission,
not null-ness**, so only the two gated keys are merged in conditionally. Verified
both directions on the wire:

```
as Marisol (peer):  legal_name key present: False | login_user_id key present: False
                    pronouns key present (must stay): True -> value: None
as admin:           legal_name: 'Dana Ruiz' | key present: True
```

`features/hr/types.ts` now types both keys as **optional**, because absent and null
are different answers and typing them the same invited the bug that shipped.

---

## Migrations applied and ledgered this wave

| File | What |
|---|---|
| `hr_l1_16_employee_login_invite.sql` | `hr_employee_invite` / `hr_invite_accept` over `iam.inv_create`/`inv_accept` |
| `hr_l1_17_peer_tab_absence.sql` | Job tab absent for `peer` |
| `hr_l1_18_absent_not_null.sql` | gated keys merged, not conditionally valued |
| `hr_l1_19_accept_door_carries_the_employer.sql` | the accept door carries `?org=` |

All four verified present in `public._schema_migrations`. Every one re-asserts
F1's class (`hr.stable_doors_that_write()` returns zero) and the anon rule.

## Checks

- `pnpm type-check`: **0 errors in `features/hr/**`, `app/(core)/hr/**`, and
  `app/(core)/invitations/employee/**`.**
- The repo-wide count is not zero, and none of it is this lane's: `types/database.types.ts`
  declares `export type Json = unknown`, which predates this session's window and
  fails `providers/`, `scripts/` and `utils/supabase/`. Flagged, not touched —
  it is not L1's file.
