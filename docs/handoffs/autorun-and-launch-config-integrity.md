---
status: active
updated: 2026-09-08
repos: [matrx-frontend]
scope: tail
feature: Agents
vision: []
---

# Launch-config integrity — the leftovers after the autoRun repair

**What this is:** `autoRun` is a user-interface control that decides whether the UI
pauses for the person before a request goes out — it never decides whether a run
happens. That was repaired, guarded and documented; this is the short list of
things left over from that work.
**Scope:** Tail
**Feature:** Agents
**Vision:** VISION MISSING — Arman's rule is quoted verbatim in the doc below, but
he has never written a vision doc for launch configuration.

## Resources

- **The doctrine, and the first thing to read:** [`features/agents/docs/AUTORUN_IS_A_UI_CONTROL.md`](../../features/agents/docs/AUTORUN_IS_A_UI_CONTROL.md) — what the flag means, why a headless mode ignores it, why `direct` is deliberately not headless, the `callerExecutes` escape hatch, and the precedence chain. Pointed at from `features/agents/FEATURE.md`.
- **Which value wins:** `features/surfaces/utils/binding-auto-run.ts` (`resolveEffectiveAutoRun` — caller literal → surface binding → seeded ui-state → `false`; plus `unresolvedRequiredVariables`, which refuses a stored `auto_run: true` whose mapping did not actually deliver). Added 2026-08-29 by the binding-inversion work, on top of the repair below.
- **Where it is enforced:** `features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts` Step 4 (overlay opens unconditionally) and Step 5 (the autoRun decision).
- **Which modes have no UI:** `HEADLESS_DISPLAY_MODES` in `features/agents/utils/run-ui-utils.ts` — `background` only.
- **Guards:** `pnpm check:autorun-headless` (in `check:release-gates`, both modes) + `features/agents/redux/execution-system/thunks/__tests__/autorun-is-a-ui-control.test.ts` (4 cases). Both verified green 2026-09-08.

## Remaining work

1. **Sweep the rest of the launch-config space for combinations that are never meaningful.** `autoRun` × headless is fixed; the same shape of defect is likely to exist elsewhere in `AgentExecutionConfig` — e.g. `showPreExecutionGate: true` or `showVariablePanel: true` on `displayMode: "background"`, or `allowChat: true` on a mode with no composer. Each is a UI control aimed at an absent UI. Treatment is already proven: ignore it at the root, `console.error` naming the call site, add a scanning guard to `check:release-gates`, pin the behaviour in a test. **Do not start this without decision #1 below** — inventing rules Arman has not ruled on is how this space got confusing in the first place.
2. **`direct`-mode instances never reach status `ready`, so `AgentRunner`'s own auto-run effect can never fire in `direct` mode.** Only the launch thunk's autoRun runs those. This is currently LOAD-BEARING — it is what stops `NewShapeClient` from double-firing (see its comment at `features/content-ir/studio/components/NewShapeClient.tsx` ~line 195). It is a trap, not a bug, until someone decides the state model should promote `direct` to `ready`. If you touch it, census every `direct` consumer first. Documented in the doctrine doc's troubleshooting list.
3. **A rename is deferred, deliberately.** `autoRun` reads like a run gate, which is the entire source of the recurring confusion, but the name reaches DB columns and shortcut bundles. Arman is holding it for a full argument revamp: *"for right now, let's keep it as it is."* Do not rename it opportunistically; the doctrine doc is the mitigation until that revamp happens.

## Done (git holds detail)

- `autoRun` no longer deletes runs on modes that render nothing — the launch thunk ignores it there and screams, naming the call site.
- The real predicate is "no UI **and** nobody will ever run it" — `callerExecutes` is the declared, required claim for the two legitimate two-phase callers (`run-headless-agent-json.ts`, `generate-page-image.ts`).
- Measured victim fixed: image-studio's DESCRIBE launch, which never ran at all.
- `HEADLESS_DISPLAY_MODES` classifies the modes in one exported place.
- Guard + 4-case behavioural test + doctrine doc + `FEATURE.md` pointer.
- A compile-time refusal was **attempted and rejected** — 8 errors, several needing refactors of load-bearing code, and it cannot narrow a dynamic `"background" | "direct"`. The scanning guard replaced it. Do not retry it without new information.

## Decisions needed (Arman only)

1. **Should other "UI control aimed at an absent UI" combinations get the same treatment?**
   *Situation:* `autoRun: false` on a display mode that paints nothing used to silently
   throw runs away; that is now ignored-and-screamed-about, guarded, and tested. Several
   other config flags are also purely about the interface (`showPreExecutionGate`,
   `showVariablePanel`, `allowChat`) and can likewise be set on `background`, where they
   mean nothing.
   *Decide:* sweep them all with the same treatment now, or leave them until one of them
   actually causes a visible failure. Nobody has reported a defect from these yet — this
   would be pre-emptive.
