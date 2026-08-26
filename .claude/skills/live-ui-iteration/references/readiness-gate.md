# Live surface readiness gate

This is the pre-handoff gate for `live-ui-iteration`. It does not replace `surface-check`; it states the evidence required before saying the whole focused surface is ready.

## Requested behavior

- Reproduce the original issue or requested state before the fix when safely possible.
- Exercise the exact changed interaction against real data after the fix.
- Verify persistence, refresh, reconnect, and feedback behavior when the change touches them.
- Confirm the requested change is visible on localhost before continuing the broader pass.

## Surface contract

- The resolved surface identity, manifest, route/overlay mapping, readiness, DB mirror, values, groups, inheritance, roles, and write targets pass applicable Surface Check sections.
- Every piece of useful loaded state is honestly declared and emitted at trigger time.
- Surface Context Admin has no missing Always values or unexplained undeclared runtime keys.
- A representative bound-agent run proves mapped context arrives when the surface launches agents.

## Canonical context menu

- One canonical v3 menu owns each pane; row context delegates through the pane menu.
- Editable and read-only regions use the correct wrappers.
- Surface name, live scope, `contentSource`, `entity`, and real `extraSections` actions are present where applicable.
- Desktop right-click and mobile long-press expose equivalent capabilities.
- Copy and Download as Markdown act on whole content without a selection and on selected text with a selection.
- Console shows no `INERT MENU` or `VALUE MAPPING GAP` diagnostics.
- Menu items are labels only — no subtext except a `disabled` item's reason (THE DENSITY LAW). `pnpm check:context-menu --population=density` is clean.
- Any identity with a builder in `features/context-menu-v3/SECTIONS.md` uses that builder rather than a local copy.

## Visual and responsive proof

- Desktop: 1280×800, top edge visible, real primary workflow exercised.
- Mobile: 375×812 after reload, no horizontal overflow, trapped scroll, clipped controls, hover-only actions, or targets below 44pt.
- Light and dark themes on the touched states.
- No duplicated page title, faux body hero, generic intro prose, nested chrome, or low-information space blocking the work area.
- Loading, empty, error, disabled, and long-running states are truthful wherever the surface can enter them.

## Runtime health

- No hydration, render, unhandled rejection, or unexpected console errors on a normal load and the changed path.
- Error Inspector is clean for the exercised flow.
- Focused static checks and `pnpm type-check` pass for this work; unrelated concurrent failures are isolated with exact evidence.
- Feature docs, admin map, surface ledger, and queue state are updated where their owning rules require it.

Any missing eyes-on item is a failed certification, not a deferred success. Keep working unless the user explicitly narrowed or stopped the task.
