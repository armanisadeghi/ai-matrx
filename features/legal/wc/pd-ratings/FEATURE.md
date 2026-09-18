# FEATURE.md — California Workers' Compensation utilities and PD ratings

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-17`

## Purpose

This feature provides California workers' compensation permanent-disability
rating workflows and supporting utility calculators. The Present Value utility
calculates the value today of future weekly payments without persisting a case.

## Entry points

**Routes**

- `app/(core)/legal/ca-wc/utilities/present-value/page.tsx` — Present Value
  utility calculator.
- `app/(core)/legal/ca-wc/pd-ratings-calculator/` — saved-case and rating
  workspace entry points.

**Components**

- `PresentValueCalculator.tsx` — local input state, calculation, and agent
  surface runtime emission.
- `CalculatorShell.tsx` — shared two-column calculator layout.
- `ResultDisplay.tsx` / `EmptyResult.tsx` — result and empty states.

## Key flows

1. The Present Value route renders `PresentValueCalculator` with initial values
   of 500 weekly dollars, 100 weeks, and a 2% annual rate.
2. Each input updates local state; `presentValue` recalculates the displayed
   result and supporting discount statistics without network or persistence.
3. The calculator emits the current inputs and results through
   `matrx-user/legal-ca-wc` and exposes the canonical context menu on both the
   editable inputs and presentational result pane.

## Invariants & gotchas

- The calculation remains client-local and must not create or update a saved
  claim.
- A result is shown only when weekly payment and week count are both positive;
  the agent scope uses `utility_calculation_ready` to represent that state.
- The CA WC manifest is shared by the full vertical. Its readiness remains
  `partial` in practice until the sibling utility calculators also emit their
  declared values and the surface is live-certified.
- Present Value keeps native numeric fields (`type=number`, min/max/step). The
  canonical menu captures a non-selectable numeric field as one whole value and
  returns its edit through controlled state; invalid replacements use native
  number-input sanitization so the displayed field and result agree.

## Related features

- `features/surfaces/manifests/legal-ca-wc.manifest.ts` — runtime value
  contract for the CA WC vertical.
- `features/context-menu-v3/` — canonical surface context menu.

## Doctrine compliance

**Primitives reused**

- Components: `CalculatorShell`, `ResultDisplay`, `EmptyResult`, and the
  canonical `EditableContextMenu` / `NonEditableContextMenu` wrappers.
- Surface runtime: `SurfaceRuntimeProvider` and
  `createLegalCaWcScope`.

**Primitives introduced**

- None. The implementation extends the existing CA WC surface contract.

## Current work / migration state

Present Value is source-wired as an agent-aware utility. Weeks, Life
Expectancy, and AWC still need equivalent named values and runtime emitters.
Browser verification and independent surface certification remain pending.

## Change log

- `2026-09-17` — Luna: wired Present Value inputs/results into the CA WC
  surface runtime and canonical context menus.
- `2026-09-17` — Luna: repaired per-field controlled menu edits, Locate anchors,
  canonical labels, and route-dependent readiness metadata.
- `2026-09-17` — Numeric menu edits retain native number constraints; whole-field
  capture replaces the unsupported selection APIs for number inputs.
