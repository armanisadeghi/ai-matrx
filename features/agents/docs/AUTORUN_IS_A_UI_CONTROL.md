# `autoRun` is a user-interface control

**Read this before you touch `autoRun` anywhere.** It has been misdiagnosed as
a "does the agent run?" switch repeatedly, and every time it costs a real
feature.

> "Auto Run is a user interface control that determines if the user interface
> will allow the user to interact prior to submitting or if the user interface
> will just let things go. If there is no user interface, it's impossible for
> autorun to have any impact at all because there is no ui."
>
> — Arman, 2026-08-25

## The one thing it decides

**Does the interface stop and let the person act before the request goes out?**

That is all. It has NO authority over whether a run happens. Press a button
wired to an agent and that agent runs — that is a done deal, and nothing about
`autoRun` may interfere with it.

| Value | Meaning |
|---|---|
| `false` (the hard default) | The component opens and WAITS. A human presses send. |
| `true` | The request goes out immediately; the person gets no turn first. |

**`autoRun` never gates rendering.** The launch thunk opens the display mode's
overlay in Step 4, *before* the `autoRun` check in Step 5, precisely so this
can never be confused. If you ever find a component that does not appear
because `autoRun` is `false`, that is a broken component — fix it there, and do
not "fix" it by changing what `autoRun` means.

Do not confuse it with `showPreExecutionGate`, which is a different UI control
(it inserts a gate widget to collect input first).

## Where it cannot apply: headless modes

`HEADLESS_DISPLAY_MODES` in [`../utils/run-ui-utils.ts`](../utils/run-ui-utils.ts)
— today just **`background`** — paint nothing. No component, no composer, no
button.

On those, `autoRun: false` is a contradiction. There is no interface to pause,
nobody to offer the choice to, and **nothing that would ever send it
afterwards**. It reads as "wait for the user" and behaves as "throw the run
away". So the launch **ignores it and runs anyway**, and logs loudly naming the
call site.

> **Measured victim.** `features/image-studio/hooks/useImageStudio.ts` launched
> its DESCRIBE agent with `{ autoRun: false, displayMode: "background" }`. That
> run never happened, silently, for as long as the line existed.

### `direct` is NOT headless

`direct` means *"no overlay — the **caller** renders the interface"*, and
callers do. `/chat`
([`features/cx-chat/hooks/useInstanceBootstrap.ts`](../../cx-chat/hooks/useInstanceBootstrap.ts))
creates an empty conversation with `direct` + `autoRun: false` exactly so you
can type in the chat composer before anything is sent. Treating `direct` as
headless would fire a blank run the moment anyone opened a chat.

## The one lawful headless deferral: `callerExecutes`

A caller may legitimately need the deferral when it must seed something the
launch itself cannot carry — multi-part message content, for example. Note that
`runtime.userInput` and `runtime.variables` **are** seeded before execution, so
anything expressible there needs no deferral at all.

Those callers declare it:

```ts
launchAgentExecution({
  /* … */
  callerExecutes: true,               // "I will dispatch executeInstance myself"
  config: { displayMode: "background", autoRun: false },
});
```

The claim is required; the deferral is never assumed from the flag alone. Set
it and then fail to execute, and you own a conversation that can never run.

Live users: [`run-headless-agent-json.ts`](../redux/execution-system/thunks/run-headless-agent-json.ts)
(its two-step message-parts path) and
[`generate-page-image.ts`](../../marketing/lib/generate-page-image.ts).

## How this is enforced

| Layer | What it does |
|---|---|
| **Runtime** — [`launch-agent-execution.thunk.ts`](../redux/execution-system/thunks/launch-agent-execution.thunk.ts) Step 5 | Headless + `autoRun: false` without `callerExecutes` → runs anyway, `console.error` naming the fix. |
| **Authoring** — `pnpm check:autorun-headless` | Flags the literal config wherever it is written. In `check:release-gates`, blocking in both modes. |
| **Behavioural** — `autorun-is-a-ui-control.test.ts` | Pins all four cases through the real thunk, including "interactive + `autoRun:false` still OPENS the component". |

## If you are about to change what `autoRun` means

Don't. Read this file again, then check whether what you actually have is one
of these:

- A component that will not render → fix the component.
- A headless run that will not fire → you wrote `autoRun: false` on a mode with
  no UI. Drop the flag, or pass `true`.
- A run that fires before you finished seeding it → you want `callerExecutes`,
  or you want to seed through `runtime` instead.

**A rename has been considered and deferred.** `autoRun` reads like a run
gate, which is the whole source of the confusion, but the name reaches DB
columns and shortcut bundles; Arman is holding it for a full argument revamp.
Until then the name stays and this document is the mitigation.
