# lib/wizard-draft — the answers last as long as the step

**Status:** `active` · **Tier:** `2` · **Last updated:** `2026-09-12`

## The law

**A multi-step form whose STEP lives in the URL must hold its ANSWERS somewhere
that lasts at least as long as the URL does — and must never draw a later step
out of answers it has not read, or does not have.**

The URL survives a reload, a tab restore, a shared link and a crash,
synchronously and always. Answers in React state survive none of it, and
answers in the sync engine survive it only *eventually*: localStorage is read
after React hydration, IndexedDB a turn later, and the signed-in person's
records only on the identity resync that lands ~100ms after an anonymous first
render. For those few hundred milliseconds every cache legitimately looks
empty. A form that concludes anything from that renders a confident lie.

W43 (Arman's Expert, live build, 2026-09-12): on `/masterwork/new` she filled
step 1, continued to `?step=2`, reloaded — the URL still said step 2, the page
looked complete, "Best for what you described" showed the defaults, and Start
created a Rulebook with no goal in it. Nothing said a word.

## What is here

| Piece | What it owns |
|---|---|
| `useWizardDraft(wizardId, { restore })` | Holds one form's answers in the shared `wizardDraftSlice`, adds a `status` of `"loading" \| "found" \| "absent"` (it waits for `useSyncHydrated()`), and reports any saved value the `restore` mapper refused in `rejectedKeys` — loudly, never a silent drop. |
| `resolveWizardStep({...})` | The step decision: `"loading"` (wait), `"step"` (render it), `"lost"` (say so). A silent demotion to step 1 is deliberately not one of the outcomes. |
| `<WizardAnswersLost onStartOver />` | What `"lost"` looks like: plain words, one reason, one way forward. |

Persistence itself is NOT here — it is `lib/redux/slices/wizardDraftSlice.ts`
(the generic slice, warm-cache preset, 7-day TTL, per-identity). Never fork a
per-feature draft slice; register a new `wizardId` instead.

## Using it

```tsx
const { status, restored, patch, clear } = useWizardDraft<MyValues>("my-wizard", {
  restore: (data) => ({ values: mapIt(data), rejectedKeys: [] }),
});
const resolution = resolveWizardStep<1 | 2>({
  requestedStep: urlStep,
  firstStep: 1,
  draftStatus: status,
  prerequisitesMet: Boolean(goal.trim()),
});
```

- `patch` on every keystroke; `clear` only after the work durably landed.
- `restored` settles exactly once per mount — apply it in one effect, and let
  anything the person has already typed win.
- A `restore` mapper must accept every shape it persists. The Masterwork bug
  was exactly this: a multi-select answer persists as `"A | B"` and the mapper
  validated the joined string against single option values.

## Guards

- `__tests__/resolveWizardStep.test.ts` — the step rule, all five outcomes.
- `features/masterwork/intake/__tests__/new-rulebook-survives-reload.test.tsx`
  — the live case end to end: fill step 1, persist through the real sync
  policy, rehydrate a fresh store, remount at `?step=2`, assert the goal and
  the multi-select answer are back and that a missing draft says so.

## Change Log

- `2026-09-12` — Created (W43). Adopted by `features/masterwork/intake/NewRulebookFlow.tsx`.
