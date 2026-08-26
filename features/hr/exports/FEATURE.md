# FEATURE.md — `hr/exports`

**Status:** `scaffolded` (built against the SPEC-CONTRACTS §6.3 stub; no HR router exists in aidream yet)
**Tier:** `2`
**Last updated:** `2026-08-26`

---

## Purpose

Getting hours and earnings **out** of AI Matrx and into a payroll system, as a file. A payroll
administrator picks a format, checks what the file would contain, builds it, and then records what
their payroll provider did with it. Lane **L13** of the HR program (register item **HRB-025**).

The export is **one-way — hours and earnings out, never a paycheck back**. We do not process
payroll, compute tax, or touch direct deposit.

---

## Entry points

**Routes**
- `app/(core)/hr/time/periods/` — SPEC-UI-IA **route 32**: pay periods per pay group + org-wide
  export history. **Mounted by L13, owned by L3** (readiness U-5 — see *Ownership* below).
- `app/(core)/hr/time/periods/[periodId]/` — SPEC-UI-IA **route 33**: one period, its export run
  panel and its export history.

**Hooks**
- `useExportFormats(mockCase?)` — E-18 registry.
- `useExportHistory(payPeriodId, opts)` — the RPC history read; also resolves the employer.
- `useExportRun({onSettled})` — follows a 202 through the runtime spine.
- `useIntentKeys()` — one idempotency key per user intent, reused across retries.

**Services**
- `features/hr/exports/service.ts` — the ONE door: nine frozen HTTP operations + the history RPC.

**API endpoints** (all frozen; operationIds exact)
- `GET /hr/exports/formats` `hr_exports_formats_list` (E-18)
- `POST /hr/exports/payroll/preview` `hr_exports_payroll_preview` (E-19, sync 200)
- `POST /hr/exports/payroll` `hr_exports_payroll_create` (E-20, async 202)
- `POST /hr/exports/timesheet` `hr_exports_timesheet_create` (E-21, 202)
- `GET /hr/exports/{export_id}` `hr_exports_get` (E-22)
- `GET /hr/exports/{export_id}/artifact` `hr_exports_artifact_get` (E-23, URL envelope)
- `POST /hr/exports/{export_id}/acknowledge` `hr_exports_acknowledge` (E-24)
- `POST /hr/exports/{export_id}/fail` `hr_exports_fail` (E-25)
- `POST /hr/exports/{export_id}/supersede` `hr_exports_supersede` (E-26, 202)

The provider-seam family (`hr_providers_*`) is deliberately **not consumed** this pass: the seam
has no live provider, so there is no provider UI to build.

**Redux slice(s)** — none. This feature holds no global state.

---

## Ownership — routes 32/33 straddle two lanes

Readiness **U-5** resolves routes 32/33 as *"L3's mount of L13's component."* L3 built the
pay-period half (`features/hr/time/periods/`) but never created the route files, so neither half
was reachable. **L13 created both route files so its export half is reachable; L3 owns them.**

- L3 replaces everything **above** `<ExportRunPanel>` in `PayPeriodRouteBody.tsx`, and the period
  section in `PayPeriodsRouteBody.tsx`. Nothing below is theirs to touch; nothing above is L13's.
- `PeriodStatePanel` / `PeriodTransitionBar` / `BoundaryWeeksPanel` / `PostLockAdjustments` exist
  and are **not** mounted by L13 on purpose: they take a viewer `role` and a reopen permission, and
  a lane that does not own the permission model must not guess one to make a page look finished.

---

## Data model

**Database**
- 🚨 **`hr` is NOT exposed to PostgREST.** `.schema("hr")` answers PGRST106 from a browser. The
  history list is therefore **not a table read** — it goes through the `SECURITY DEFINER` reader
  `public.hr_payroll_export_list(p_organization_id, p_pay_period_id, p_limit)`, which returns
  `{"granted": true, "exports": [...]}` or `{"granted": false, "reason", "capability"}`.
- `hr.payroll_export` / `hr.payroll_export_line` — append-only; the server's, not read directly.

**Key types** (`features/hr/exports/types.ts`)
- Every HTTP shape is **derived** from `types/python-generated/hr-contracts.api-types.ts`. A
  hand-typed interface here would absorb contract drift and destroy the §6.3 step-4 drift detector.
- `PayrollExportHistoryRow` is the ONE hand-written shape, because the RPC's generated signature
  returns bare `Json`. Marked and dated; replace it when the RPC gains a typed return.

---

## Key flows

**1. Preview → generate** (`ExportRunPanel`)
Pick a format from the E-18 registry → `previewPayrollExport` (E-19, sync, **creates no row** — so
looking leaves no record) → the panel renders `line_count`, `total_hours`, `total_amount`,
`by_earning_code[]`, `employments_included`, `warnings[]`, `blocking[]` → if `blocking[]` is
non-empty the build button is **disabled and every reason is listed** → otherwise
`createPayrollExport` (E-20) answers 202 → `useExportRun` follows the runtime spine → on terminal,
the history re-reads.

**2. Recording what payroll did** (`ExportRunList` row menu)
`sent|generated → acknowledged` (E-24, needs the provider's own reference) ·
`generated|sent → failed` (E-25, the reason is stored and shown on the row) ·
`generated|failed → superseded` (E-26, mints version n+1).

**3. Getting the file** (`ExportArtifactDownload`)
Row → `getExportArtifact` (E-23) returns the URL envelope → bytes are streamed through
`downloadFile(file_id)` and saved from a same-origin `blob:` URL.

---

## Invariants & gotchas

- 🚨 **An `acknowledged` export can never be superseded, regenerated or re-sent.** Once payroll has
  taken the file, a replacement means the same hours are in payroll twice and people are paid
  twice. The surface states this **before** the click: the supersede entry is present, disabled,
  and its label carries the reason and the correction path (an adjustment in the *next* export).
  Never a silently missing button; never an enabled one that 409s.
- 🚨 **`granted:false` is a NAMED REFUSAL, never an empty list.** Rendering a denial as "no exports
  yet" tells a payroll administrator their access is fine when it is not.
- 🚨 **No client computes money or hours.** Every figure is a decimal string, displayed verbatim.
  Sorting uses a zero-padded **string** key — never `Number()`. Binary floating point cannot hold
  `241880.12`.
- 🚨 **A field the viewer cannot access is ABSENT from the DOM** (SPEC-UI-IA §4.2). The money
  column is built only when `"total_amount" in row`. A present-but-null key is a *different fact*
  ("this format carries no amounts") and renders as `—`, never `0`.
- 🚨 **The employer comes from `useHrContext`, never the Redux active org.** HR resolves `?org=`
  first and is strictly single-employer; the Redux selection would merge two employers' pay data.
- 🚨 **No HR URL is hand-assembled.** `hrPayPeriodHref` / `hrPayPeriodsHref` (`features/hr/routes.ts`)
  carry `?org=`.
- 🚨 **`X-Idempotency-Key` is minted per user INTENT and reused across retries** (`useIntentKeys`).
  A fresh key on retry is not weaker idempotency — it is none.
- **The domain key is `payperiod:<id>:v1` and that spelling is frozen.** A second *generate* for
  the same period therefore **replays** the first rather than building a second file; regenerating
  is *supersede*. That asymmetry is what stops a period being exported twice. Note the consequence:
  generating `generic_csv` and then `adp_csv` for the same period would replay the first — see
  *Debt* below.
- **`/hr/exports/{id}/artifact` returns a URL envelope, never bytes.** Only `file_id` and `sha256`
  are safe to persist; the URLs expire (`_durable_only`).
- **Cross-origin `a.download` is silently ignored**, so a signed S3 URL saves as a bare UUID with
  no extension. Bytes are streamed through the file service and saved from a `blob:` URL so the
  `Content-Disposition` filename survives. The signed link is still offered, labelled "open in a
  new tab" — the truthful description of what it does.
- **Mock mode swaps the HR transport only.** The runtime spine and the file service are live paths
  with no fixtures, so `useExportRun` reports `not_observable` rather than polling a server that
  is not there.

---

## Related features

- Depends on: `features/hr/time/periods` (L3 — period reads, `StateBadge`), `features/hr/shared`
  (L1 — `useHrContext`), `features/files` (byte download), `features/assists` (`AssistStrip`),
  `components/official/matrx-data-table`, `components/official/item`.
- Cross-links: `features/hr/time/FEATURE.md`, `lib/api/hr-contract-client.ts`.
- Spec: `common-docs/projects/hr-domain/specs/SPEC-CONTRACTS.md` §3.5 / §4 ·
  `SPEC-UI-IA.md` rows 32–33 · `readiness/R-L12-L13-L14-READINESS.md` §2, T13-1…T13-5.

---

## Doctrine compliance

**Primitives reused**
- Types: everything derived from `types/python-generated/hr-contracts.api-types.ts`; `PayPeriodRow`
  and `PayPeriodState` from `features/hr/time/api/types.ts`.
- Components: `MatrxDataTable`, `ItemMenu`, `Alert`, `Badge`, `Button`, `Dialog`,
  `TextInputDialog`, `AssistStrip`, `CopyButton`, L3's `PayPeriodsTable` / `StateBadge`.
- Hooks: `useHrContext` (L1), `usePayPeriods` / `usePayPeriod` (L3).
- Services: `hrApiGet`/`hrApiPost`/`hrBuildPath`, `apiGet`/`buildPath`, `parseHttpErrorBody`,
  `downloadFile`, `announceComingSoon`, `applyOrganizationContextHeader`.

**Primitives introduced**
- `useIntentKeys()` (`hooks/useIntentKey.ts`) — Why new: no existing helper mints a key per
  *(verb, subject, payload)* intent. Considered extending: `features/hr/time/api/idempotencyKey.ts`.
  Rejected because: that mints the **domain** key for a punch from a frozen composition
  (`device:employment:kind:minute`); this is the **transport** header for an export action, a
  different key with different identity rules.
- `RequestOptions.organizationId` (`lib/python-client.ts`) — Why new: the fail-closed org kernel was
  wired only into `callApi`, so every `/hr/*` call went out without the header its contract
  declares required. Considered extending: routing HR through `callApi`. Rejected because: HR is
  typed against the §6.3 stub, and widening `callApi`'s path union to paths the server does not
  serve would destroy the drift detector.

---

## Current work / migration state

**Built against the stub. No HR router exists in aidream** (verified 2026-08-26). Cutover is
per-family (SPEC-CONTRACTS §6.3 step 4): when the export handlers land, the stub entries are
deleted, `/schema/all` takes over, and a shape that changed makes this feature go RED. **That red
build is the contract-drift detector** — fix `types.ts` to match, never narrow the generated type.

**Debt left deliberately**
1. 🚨 **A second set of export COMPONENTS exists, uncommitted, at `features/hr/time/exports/`**
   (`ExportPanel`, `ExportRunList`, `ExportFormatPicker`, `ExportPreviewPanel`,
   `ExportPreconditionNotice`, `RunVerdictNotice`). Verified 2026-08-26: it *consumes* this
   feature's `service.ts` and `types.ts` — so the data layer is not duplicated — but it is a
   second presentation of the same nine operations, and **nothing imports it**; the mounted
   components are the ones in this directory. Two renderings of one thing is a defect even while
   one is unwired. It is another session's in-flight work, so L13 did not touch it: it needs a
   coordinator ruling on which set survives, and the loser deleted rather than left dormant.
2. **`payrollExportDomainKey` ignores the format.** Per §1.4's frozen spelling, generating
   `generic_csv` then `adp_csv` for one period replays the first export. Following the spec
   literally was the right call for a frozen contract; whether the spec intends this is a
   question for the lane lead.
3. **`X-Idempotency-Key` is sent on acknowledge and fail** even though the generated types declare
   it required only on the three async operations. §1.4 says *every* mutating POST; an extra header
   is harmless and matches the stated rule. Flagged in case the contract is the accurate half.
4. **No `app/(core)/hr/layout.tsx` exists**, so `HrProvider` is never mounted and every HR page
   runs `useHrContext`'s standalone resolver — one context resolution per surface instead of one
   per route tree. L1's to close.
5. **`useExportRun` cannot read the run's result.** `OperationView` carries no `result` member, so
   the export payload is not reachable from the poll; the surface re-reads the durable history
   instead. Correct, but it means a terminal run cannot highlight *which* export it produced.

---

## Change log

- `2026-08-26` — lane-l13-export: initial build. Nine frozen operations, the history RPC, the run
  panel and run list, the four named preconditions, the three state dialogs, the artifact
  envelope, routes 32/33 mounted. Closed the `X-Organization-Id` gap in `hr-contract-client`.
  Re-established against L1's HR module shell and L3's period components mid-build.
