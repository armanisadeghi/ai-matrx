# lib/wizard-draft — the answers last as long as the step

**Status:** `active` · **Tier:** `2` · **Last updated:** `2026-09-12`

## The law

**A multi-step form whose STEP lives in the URL must hold its ANSWERS somewhere
that lasts at least as long as the URL does — and must never draw a later step
out of answers it has not read, or does not have.**

**And when it puts those answers back, it SAYS SO.** A form that silently
re-fills itself is lying about what the person is looking at: they read the
pre-filled field as the blank one they still have to fill in, click where their
eye lands, and type into the middle of what is already there.

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

Cold walk 6 (live build, 2026-09-17): the same screen, the other direction. She
typed her goal, went to look at the catalog, came back — and the textarea
already held the old sentence with nothing on screen admitting it. She clicked
where her eye landed and typed her sentence into the middle of the old one. The
Rulebook was created with `prefix + whole sentence + suffix` as its goal: 286
characters out of a 143-character sentence, into `platform.rulebook.description`
and `metadata.intake.goal`, and the Capture Plan then faithfully displayed the
mess.

## What is here

| Piece | What it owns |
|---|---|
| `useWizardDraft(wizardId, { restore })` | Holds one form's answers in the shared `wizardDraftSlice`, adds a `status` of `"loading" \| "found" \| "absent"` (it waits for `useSyncHydrated()`), and reports any saved value the `restore` mapper refused in `rejectedKeys` — loudly, never a silent drop. |
| `resolveWizardStep({...})` | The step decision: `"loading"` (wait), `"step"` (render it), `"lost"` (say so). A silent demotion to step 1 is deliberately not one of the outcomes. |
| `<WizardAnswersLost onStartOver />` | What `"lost"` looks like: plain words, one reason, one way forward. |
| `<WizardDraftRestored onStartFresh onDismiss />` | The one notice that goes with `applyOnce`: "We put back what you started writing here last time. Change it, or start fresh." Plus the two controls that make it true — "Start fresh" (the caller empties its fields in the same click) and dismiss. |

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
- **Put the draft back through `applyOnce`, and render `<WizardDraftRestored>`
  on `didRestore`.** `applyOnce` owns the once-ness (call it from one effect)
  and cannot run without raising `didRestore`, so the notice can never drift
  out of step with what is actually in the fields. `discard()` is the "Start
  fresh" half — it drops the draft; the caller empties its own state beside it.
- `restored` settles exactly once per mount — let anything the person has
  already typed win.
- A `restore` mapper must accept every shape it persists. The Masterwork bug
  was exactly this: a multi-select answer persists as `"A | B"` and the mapper
  validated the joined string against single option values.

## Guards

- `__tests__/resolveWizardStep.test.ts` — the step rule, all five outcomes.
- `features/masterwork/intake/__tests__/new-rulebook-survives-reload.test.tsx`
  — the live case end to end: fill step 1, persist through the real sync
  policy, rehydrate a fresh store, remount at `?step=2`, assert the goal and
  the multi-select answer are back and that a missing draft says so.
- `__tests__/restored-draft-is-announced.test.tsx` — abandon a goal, come back,
  and the page must SAY it put it back; "Start fresh" must empty the field and
  the draft; and every file that touches the draft primitive must render the
  notice.

## Change Log

- `2026-09-17` — A RESTORED DRAFT IS ANNOUNCED (cold walk 6). `applyOnce`,
  `didRestore`, `acknowledge` and `discard` added to `useWizardDraft`, plus
  `<WizardDraftRestored>`. Adopted by every consumer: the Masterwork guided
  start, the Research init wizard (migrated off its own hand-rolled slice
  read), the Masterwork rule editor (which restores an abandoned unsaved edit
  over the saved rule) and the Masterwork teach-back, whose whole session —
  every round and every correction — now lives here instead of in mount-time
  React state. Guard:
  `__tests__/restored-draft-is-announced.test.tsx` — the notice on screen, the
  "Start fresh" remedy, and a census so the next wizard cannot repeat it.

- `2026-09-12` — Created (W43). Adopted by `features/masterwork/intake/NewRulebookFlow.tsx`.
