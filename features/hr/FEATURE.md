# FEATURE.md — `hr`

**Status:** `scaffolded`
**Tier:** `1`
**Last updated:** `2026-08-26`

> **Scope of this file.** HR is being built by several lanes at once. This document
> covers the **shell + shared primitives layer (L1)** — the chrome every `/hr/*`
> page stands in and the three primitives every pillar imports. Pillar lanes
> (people, time, hiring, settings, tasks, exports…) own their own sections below
> and their own sub-`FEATURE.md` files beside their code.
>
> **The specs are the authority, not this file.** Behaviour rulings live in
> `../../../common-docs/projects/hr-domain/specs/` — `SPEC-UI-IA.md` (routes, nav,
> sensitivity rendering) and `SPEC-EMPLOYEES.md` (universal states, effective-dated
> editing) govern everything described here.

---

## Purpose

The HR module: one employer's people, time, hiring, documents and settings, for an
organization that has switched HR on. **HR is strictly single-employer** — an
`hr.employee` belongs to exactly one employer of record, and merging two employers'
headcount, timesheets or pay data into one view is a compliance defect, not a
feature. There is no cross-employer HR view, in v1 or later.

---

## Entry points

**Routes**
- `app/(core)/hr/layout.tsx` — mounts `<HrProvider>` (ONE `hr_my_context`
  resolution for the whole tree) behind a Suspense boundary. Adds no wrapper
  element and no clipping: `HrShell` is `h-full` and its height chain must reach
  `.shell-main` unbroken.
- `app/(core)/hr/page.tsx` — route 1, the HR home. **Owned by SPEC-DOMAIN-WIDE §1
  (L9)**, not by L1. L1 built only the universal states, the activation/first-hire
  doors, and an interim "Where to start" list of the doors this person holds. The
  `HrHomeGrid` card grid, per-persona composition and queue cards are L9's; the
  `TODO(L9…)` in that file names the swap.
- Section routes mount `HrShell` or `HrSubShell` from their own `layout.tsx`.

**Shell + primitives** (`features/hr/shared/`)
- `HrShell.tsx` — `HrShell({children, title, description, actions, subNav})`. The
  HR context bar (employer name + switcher), the capability-driven persona nav, and
  the breadcrumb — all injected into the shell header via `RouteHeader`; the body is
  `h-full overflow-hidden` around ONE bounded scroll area.
- `HrSubShell.tsx` — `HrSubShell({tabs, children, title, description, actions})`
  plus `HrRouteTab` and `resolveActiveHrTab`. The `administration/users` route-tab
  pattern: flat array, real routes, `usePathname()` + `useTransition()`, `Loader2`
  while pending.
- `HrStates.tsx` — `HrLoading` · `HrError` · `HrNoAccess` · `HrEmployerPicker` ·
  `HrModuleOff` · `HrEmptyOrg` · `HrPageState` (+ `hrErrorSentence`,
  `HrLoadingVariant`).
- `EffectiveDatedForm.tsx` — `useEffectiveDating` · `EffectiveDateField` ·
  `EffectiveDatedForm` (+ `useHrFutureDatedLimit`, `hrToday`, `hrFormatDay`,
  `EffectiveDatingMode`, `EffectiveDatingValue`, `HR_FUTURE_DATED_MAX_DAYS_KEY`).
- `PendingChangesPanel.tsx` — `PendingChangesPanel` · `PendingChip`.
- Already shipped by the data lane: `useHrContext` · `useHrPersona` ·
  `useVisibleFields` · `SensitiveField` · `hr-nav` · `HrProvider` · `service.ts` ·
  `types.ts` · `routes.ts` · `constants.ts`.

**Assists**
- `features/hr/hr-assists-producer.ts` — `produceHrAssists()` +
  `HR_ASSIST_SURFACES`. Deterministic, capped at three chips, every chip carrying
  the fix as its action. None opens a chat.

**Services** — `features/hr/service.ts`, one typed function per `public.hr_*` RPC.

**Redux** — none. HR reads through RPCs; there is no HR slice.

---

## Data model

The `hr` schema is **not exposed to PostgREST** (verified live 2026-08-26):
`supabase.from("hr.employee")` and `supabase.schema("hr")` do not work from a
browser and never will. Every read and write is a `public.hr_*` SECURITY DEFINER
RPC — still React → Supabase direct, no Next.js hop and no Python hop.

A refusal is **data**, not an exception: `HrResult<T>` flattens both server refusal
dialects (envelope and raised `42501`) and every surface renders the refusal in
place. See `types.ts` for the full contract.

---

## The laws this layer exists to enforce

1. **Switching employers is a full context change.** The SAME route with a new
   `?org=`, built only by `hrSwitchEmployerHref`. Never a merge, never a filter
   across orgs.
2. **Nav, tab and action visibility are CAPABILITY-driven, never role-string
   driven.** `useHrPersona().can(…)`; the persona picks the label and the
   self-scoped destination, never the access decision.
3. **Absent, not disabled.** No greyed nav item, no greyed tab, no masked field, no
   disabled enable-button. `HrRouteTab.visible === false` means the tab is not
   rendered at all.
4. **Every page runs the universal states before its own** — through `HrPageState`,
   in one order, so no page re-implements the sequence.
5. **Effective dating is asked, never guessed.** The date is first and labelled
   *Effective*; a future date flips the verb to *Schedule change*; the
   correction-vs-amendment question is asked in the three exact sentences from
   `HR_CHANGE_INTENTS`, and only when the date is in the past.
6. **No dead ends.** Every identity the UI names opens. Tabs are `<Link href>` so
   cmd/ctrl-click still opens a new browser tab.

---

## Technical calls made in this lane (new unknowns, recorded per the brief)

| Call | Why |
|---|---|
| `HrShell` gained an optional `subNav` slot | `HrSubShell`'s tab bar must be static above the scroll area. Nesting a second scroll container inside `HrShell`'s would break the bounded-height chain, and giving `HrSubShell` its own shell would fork the chrome. Only `HrSubShell` should pass it. |
| `EffectiveDateField` takes `onModeChange` and `consequenceLine` | The contract's prop list left the body open. Splitting date-change from mode-change keeps `useEffectiveDating` the only owner of the "past ⇒ ask" rule; the consequence line is passed in so the field never re-derives it. |
| No `365` anywhere in code | `hr.employees.future_dated_change_max_days` is read from `hr_knob_index`. If the knob is missing, the form NAMES the key in a visible line and applies no ceiling — a silent default is how a knob becomes a constant. |
| `PendingChangesPanel` shows the new value, never a "was" | SPEC-EMPLOYEES §6.2 asks for "from what to what", but `hr_pending_changes` returns only the future row (verified 2026-08-26). A client-side guess at the prior value would be a fabricated audit statement. **Widening the RPC is the server lane's call.** |
| `HrEmptyOrg` renders a door, not the wizard | `features/hr/settings/activation/HrActivationWizard.tsx` does not exist yet (checked 2026-08-26), and a `next/dynamic` import of a missing module is a build error. The door links to `/hr/settings/employer`. **When the wizard lands, replace the `<Link>` with ONE `next/dynamic` edge behind the same `canActivate` condition** — one boundary, at the edge, conditionally rendered. |
| Cancel takes a required reason via `TextInputDialog` | `hr_pending_change_cancel` requires `p_reason`; browser prompts are banned. The dialog states, before the click, that nothing in the history is erased and that the cancellation is itself recorded. |
| Assist surface names are string constants | The `matrx-user/hr*` surface **manifests** do not exist yet under `features/surfaces/manifests/`. `HR_ASSIST_SURFACES` holds the §3 names so there is one spelling to point at the manifests when that lane lands. |
| This lane declares **no** `agentRole` and binds no mandate | HR runs no fixed AI worker on these surfaces yet, and inventing one to satisfy disclosure is forbidden. Assists chips are the platform's noticing lane, not agent disclosure — disclosure adds no visible page content, ever. |

---

## Testing

`pnpm type-check` is the only type gate (a green build proves nothing).
`pnpm check:scroll-chain` covers this layer's bounded-height chains; `HrShell` also
consumes the runtime `useClippedContentGuard`, because the static guard cannot see a
wrapper added in another lane's file.

---

## Change log

- **2026-08-26** — L1 shell + primitives layer built: `HrShell`, `HrSubShell`,
  `HrStates` (four universal states + `HrPageState`), `EffectiveDatedForm`,
  `PendingChangesPanel`, `hr-assists-producer`, `app/(core)/hr/{layout,page}.tsx`.
  `/hr` home left to L9 with a named TODO.
