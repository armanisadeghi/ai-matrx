# FEATURE.md — `hr/time/overtime`

**Status:** `scaffolded` — the surfaces are built; **no SQL RPC in this lane exists yet**
**Tier:** `2` · **Lane:** L3 / register item **HRB-015** (D24a) · **Last updated:** `2026-08-26`
**Behaviour spec:** `../../../../../common-docs/projects/hr-domain/specs/SPEC-TIME.md` §4.4–§4.6

## What this is

SPEC-UI-IA routes **31a** (`/hr/time/overtime`) and **31b** (`/hr/time/overtime/[requestId]`): the
overtime pre-approval queue, the real-time approaching-OT watchlist, and one request's decision
panel.

---

## 🚨 THE LAW THIS FEATURE OBEYS BEFORE ANY PRODUCT CONSIDERATION

> ## UNAPPROVED OVERTIME IS STILL PAID.

Hours worked are hours owed. The FLSA pays hours suffered or permitted to be worked, approved or
not. **Nothing here — no state, label, badge, filter, sort or column — may gate, delay, reduce or
condition payment on an approval.**

Pre-approval is a **management** control over whether overtime is *incurred*. It is never a payroll
control over whether it is *paid*. `hr.overtime_preapproval` never gates an `hr.work_interval` row,
and any implementation in which a missing pre-approval suppresses, withholds or zeroes an OT line is
**a wage violation and a defect**.

What that means in the code:

- `worked-unapproved` renders as **"Worked without approval — paid, flagged for review"** — the word
  *paid* is in the chip itself, not in a tooltip, because a tooltip is not read while somebody scans
  forty rows.
- The words *unpaid*, *withheld*, *pending*, *on hold* and *zeroed* appear nowhere in
  `overtimeVocabulary.ts`. The headless proof asserts that, so a future edit that reintroduces one
  goes red.
- `DENIAL_DOES_NOT_WITHHOLD_PAY` is rendered to the manager **at decision time, every time**,
  including on the deny path. A manager who believes a denial withholds pay will use denial as a
  punishment and be wrong in a way that becomes a wage claim. **Deleting that sentence to tidy the
  panel is the most expensive edit anybody could make to this lane.**
- The paid-flag tone is **amber, never red**: red beside an hours figure reads as *"something is
  wrong with the money"*, and there is nothing wrong with the money.

---

## The other laws

1. **THE WORKFLOW ENGINE IS THE ONLY APPROVAL ENGINE** (§0 law 5). Decisions go through
   `hr_wf_decide`. No approvals table, no approver column, no approver picker, no second inbox.
2. **NOTHING AUTO-DECIDES.** No action by the deadline **escalates** — it never auto-approves and
   never auto-denies. `NO_DECISION_ESCALATES` says so on both viewers.
3. **CONFLICT RE-CHECK AT EVERY DECISION**, not just at submit. `WF_CONFLICT` shows the approver
   exactly what changed and **never silently rejects**.
4. **APPROVE WITH A CAP IS FIRST-CLASS.** The cap is what later intervals are matched against;
   overtime beyond it is **still paid** and lands in the flagged lane like any unapproved overtime.
5. **EXEMPT EMPLOYEES NEVER ENTER THIS LANE.** Refused at validate with the reason named — this is
   not a permission problem and must not be worded as one.
6. **THE WRITE-UP DOOR IS OFFERED, NEVER AUTOMATIC**, and four rules bind it (`WriteUpDoor.tsx`):
   no pattern or count ever creates a corrective action; **without employee-relations authority the
   door is ABSENT, not disabled** (a greyed button is itself a disclosure about the person on
   screen); the link is one-way evidence; and where the employee has an open disagreement covering
   those hours the door shows it and requires acknowledgement first.
7. **EVERY ALERT CARRIES THE PRE-APPROVAL DOOR** — *an alert that only informs is half a feature*.
8. **NO ALERT EVER APPEARS ON THE KIOSK.** A shared tablet is not a personal notification surface.
9. **DAILY THRESHOLDS ARE NOT OPTIONAL.** In California an 8-hour day triggers overtime regardless
   of the weekly total; a watchlist showing only the weekly number is silently wrong for the
   jurisdiction that matters most. Every threshold comes from E-55, never from a constant.
10. **E-55 IS ALWAYS A PROJECTION AND IS LABELLED ONE.** The authoritative answer is the closed
    workweek. A projection stored as evidence is how a wage claim gets an answer we cannot defend.
11. **`viewer` IS DERIVED FROM THE CALLER'S RELATIONSHIP TO THE SUBJECT, NEVER FROM THE URL.** A
    query parameter would let anyone open the manager's view of someone else's overtime; the server
    would refuse the *write*, but the disclosure has already happened on screen.

## Files

| File | What it is |
|---|---|
| `overtimeVocabulary.ts` | Every word this lane may use, and the sentences that must survive every edit. **Pure.** |
| `api/overtimeReads.ts` | The two transports: the RPC lane (rows, create, `hr_wf_decide`) and E-55. |
| `hooks/useOvertimeQueue.ts` | Fetch-and-hold for the queue, one request, and the evaluation. |
| `components/OvertimeQueueTable.tsx` | Route 31a's `MatrxDataTable`. |
| `components/ApproachingWatchlist.tsx` | The §4.5 watchlist, each row carrying the pre-approval door. |
| `components/OvertimeRequestPanel.tsx` | Route 31b — **one component, `viewer` swapped**. |
| `components/WriteUpDoor.tsx` | §4.6's four rules. |
| `components/OvertimeStateChip.tsx` | The chip whose label carries the word *paid*. |

## Verification

The headless proof at `../periods/__checks__/non-browser-contracts.ts` asserts the payment-word ban,
the two paid labels, the decision-time sentence, the no-auto-decide sentence, and that the
evaluator's `exceeded_without_approval` case keeps the hours intact.

## Change log

- **2026-08-26** — Built routes 31a/31b (D24a). The `hr.overtime_preapproval` DDL exists
  (`migrations/hr_06_time_attendance.sql` §7.12); the three RPCs this lane calls do not yet.
