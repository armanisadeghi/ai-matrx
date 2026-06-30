# TS Strictness Waves — Live Handoff

> Operational handoff for the staged TypeScript strictness rollout (Phase B2 of the
> dependency initiative). The **master tracker** is `docs/upgrades/README.md` §5 — this
> file is the short, current "where are we / what's next / how to run it" sheet so we can
> work the remaining waves in batches over time without reloading all the context.
>
> **Last updated:** 2026-06-29 · **Active wave:** 5 (`strictNullChecks`) — flag **ON**, **1347 errors** surfaced. Wave 4 (`strictFunctionTypes`) **✅ 0 errors, ready to land**.

---

## The model (how a wave works)

Strictness is flipped **one compiler flag at a time, fewest-errors-first**. Each flag is a
"wave." A wave is fixed by fanning out to many parallel agents — **one source file per
agent** — driven by pre-generated task files.

The hard, non-negotiable constraint that shapes everything:

> **Fix agents must NEVER run a type-check / `tsc` / `pnpm build`.** Dozens run in
> parallel; a single `tsc` balloons to **20+ minutes** and stalls everyone. They fix
> **blind**, working only from the error list in their assigned task file. Verification is
> central (the orchestrator runs `pnpm type-check` once, after all agents finish).

This is exactly why the per-file task files exist — each one is a complete, self-contained
briefing for its file so the agent never needs to compile.

### Tooling (already built — just run it)

| Command | What it does |
|---|---|
| `pnpm measure:strict` | Flips each candidate flag in isolation, ranks them by error count, writes `type-errors/<flag>.txt`. (Already run — baseline below.) |
| `pnpm wave:split <flag>` | Runs ONE `tsc` pass for the flag and **splits the errors into one agent-assignable task file per source file** under `type-errors/<flag>/tasks/`, plus `_manifest.md` (files ranked by error count) and `_assignments.json` (for batching). |

`type-errors/` is gitignored. The temp tsconfig the scripts use is gitignored + removed on exit.

---

## Measured baseline (ranked, ascending)

Measured on the `tsconfig.typecheck.json` include set (excludes `(transitional)`, `(dev)`,
`applet` per Arman). Source: `type-errors/_summary.json`.

| Wave | Errors | Files | Flag | Dominant codes | Status |
|---|---|---|---|---|---|
| 0 | 0–1 | 0–1 | `strictBindCallApply`, `alwaysStrict`, `noFallthroughCasesInSwitch`, `noImplicitThis` | — | ✅ landed |
| 1 | 28 | 18 | `useUnknownInCatchVariables` | TS2339 | ✅ landed |
| 2 | 54 | 26 | `noImplicitOverride` | TS4114 | ✅ landed |
| 3 | 579 | 404 | `noImplicitReturns` | TS7030 | ✅ landed (commit `6008d4a25`) |
| 4 | 822 | 314 | `strictFunctionTypes` | TS2769 (792), TS2322, TS2345 | ✅ **0 errors with flag ON** (mostly central fixes — see below); ready to commit |
| **5** | **1347** | **388** | **`strictNullChecks`** | **TS2322 (531), TS2339 (248), TS2345 (246), TS18047/18048 (175)** | 🟡 **ACTIVE — flag ON, DB types regenerated, fixing in batches** |
| 6 | 1420 | 363 | `noImplicitAny` | TS7006/7031/7053/7018 | ⬜ queued |

**Explicitly NOT being added** (Arman): `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`. The unused-symbol flags
(`noUnusedLocals` 2298, `noUnusedParameters` 483) are TS6133 noise — enforced via ESLint
`@typescript-eslint/no-unused-vars` (`argsIgnorePattern: '^_'`), **not** tsc flags.

---

## ✅ Done

- Measurement harness (`scripts/measure-strict-flags.ts`) + ranked baseline.
- Fan-out splitter (`scripts/wave-split.ts`).
- Track A anti-cheat system (shipped): `types/json.ts` guards, ESLint `no-explicit-any` /
  `no-non-null-assertion` / `ban-ts-comment` at `warn`, the `check:hatches` ratchet +
  frozen `type-escape-baseline.json`.
- Waves 0–3 landed, each verified `pnpm type-check` = 0 before commit.
- Wave 4 (`strictFunctionTypes`) flag ON + `pnpm type-check` = **0 errors** (verified raw
  `tsc`); pending commit. Fixes were ~90% central (Redux dispatch/store typing) — see below.

---

## ▶️ Remaining steps

### Wave 4 — `strictFunctionTypes` (✅ COMPLETE, 0 errors — ready to commit)

> **🎯 824 → 0. Almost entirely a handful of central/primitive fixes, NOT 314 file fixes.**
> The dominant cause (790 / 824, 96%) was `dispatch(someThunk())` → TS2769
> *"AsyncThunkAction is not assignable to UnknownAction."* Under `strictFunctionTypes`, TS
> checks the thunk middleware's function-typed parameter contravariantly, collapsing the
> **inferred** `AppDispatch = AppStore["dispatch"]` to the plain-action overload, so every
> `dispatch(thunk())` app-wide broke.

> **🔴 CRITICAL FOLLOW-ON LESSON — verify with a RAW `tsc`, and watch for type cycles.**
> The first attempt at the central fix declared `AppDispatch` explicitly as
> `ThunkDispatch<RootState, …> & Dispatch<…>` **inside `lib/redux/store.ts` while
> `RootState` was still `ReturnType<AppStore["getState"]>`**. That closed a type loop:
> `AppStore = ReturnType<typeof makeStore>` → `makeStore` body references
> `RootState`/`AppDispatch` → `AppDispatch` → `RootState` → `AppStore`. TS reported
> `RootState`/`AppStore` *"circularly references itself"* (TS2456) and silently collapsed
> `RootState` to `unknown` — which **cascaded into ~250 downstream `unknown` errors** (every
> selector: *"Property 'status' does not exist on type 'unknown'"*). A measurement tool that
> only diffs the flag had masked this; a **raw full `tsc` showed 275, not 37.** Fix: derive
> `RootState` from the root reducer and re-export it (it already exists as
> `ReturnType<ReturnType<typeof createSlimRootReducer>>` in `lib/redux/rootReducer.ts`) so it
> no longer routes through `AppStore`. `AppDispatch` can then reference it with no loop.
> **Always verify a store-type change with `pnpm type-check` (raw `tsc`), never a flag-delta
> tool — a single circular type alias collapses to `unknown` and hides hundreds of errors.**

The remaining ~30 genuine per-file/cluster fixes were applied directly (no fan-out needed):

- **`createAsyncThunk` missing state config.** Thunks declared `createAsyncThunk<Ret, Arg>`
  (no 3rd type arg) get a default `ThunkDispatch<unknown,…>`; dispatching an inner thunk
  whose config is `{ state: RootState }` then fails TS2769. Fix: add `{ state: RootState }`
  as the 3rd type arg (or `createAsyncThunk.withTypes<{ state: SliceState }>()(…)` when the
  return type must stay inferred — used for the app-builder integrated thunks). Files:
  `launch-agent-execution`, `execute-instance`, `create-instance` (`startNewConversationAndExecute`),
  `transcript-studio/redux/thunks` (`ingestExternalRecordingThunk`),
  `app-builder/{field,container}BuilderThunks`.
- **Manual thunk over-typed its `dispatch`.** `userDataThunk` only dispatches plain slice
  actions, so `(dispatch: AppDispatch)` was needlessly tight and broke a minimal test store.
  Loosened to `(dispatch: Dispatch)` → fixed all 6 test errors at the source.
- **Middleware DispatchExt = `unknown`.** `scopeTreeInvalidationMiddleware` typed its dispatch
  as `ThunkDispatch<unknown,…>` but dispatched a `RootState` thunk → set it to `RootState`.
- **Redux 5 middleware `next` typed as `Dispatch`.** `lib/sync/engine/middleware.ts` — the
  curried `next` must be `(action: unknown) => unknown`, not `Dispatch`, to satisfy `Middleware`.
- **Component prop widened too far → generic over-infers.** `DesktopFilterPanel`'s
  `*_OPTIONS` consts were typed with spurious `| AgentSortOption` unions, making the generic
  `RadioSelect<T>` infer `T` wider than the narrow `onChange` handlers. Narrowed the consts to
  the panel's actual prompt types (+ one explicit `<PromptTab | AgentTab>` type arg).
- **Heterogeneous handler registry.** `war-room-tools/tools/registry.ts` used
  `WarRoomToolHandler<unknown, unknown>`; `unknown` args fail contravariantly. Match the
  canonical sibling (`ui-first-tools`): `WarRoomToolHandler<any, any>` + eslint-disable (args
  are validated by the zod `schema` at runtime).
- **`onChange/onSave: (data: string | object)`.** The JSON editor (`EnhancedEditableJsonViewer`)
  legitimately emits a string; consumers (`ConstraintsEditor`, `ControlsEditor`,
  `JsonFieldEditor`, `LocalStorageAdmin`) accepted only `object`. Widen the handler param to
  `object | string` and guard (`Array.isArray` / `typeof === "string"`), or wrap to ignore
  strings — type-honest, no cast.
- **Yjs observer field typed `<unknown>`.** `WorkbookCollabSession` typed `yArrayObserver` as
  `YArrayEvent<unknown>` but observed a `Y.Array<CollabMutationInfo>` → match the element type.
- **`.map(fnReference)` under strict.** `skillsThunks` — passing a bare function to `.map`
  checks it against the 3-arg `(value,index,array)` signature; wrap as `(row) => fn(row)`.
- **Select subset vs full Row.** `scripts/sync-feature-docs.ts` stored rows as the full
  `FeatureDocRow` but selected a column subset → `.select("*")`.

**To land:** `pnpm type-check` = 0 confirmed (raw `tsc`, ~60–70s). Commit
`chore(ts): strictness Wave 4 — strictFunctionTypes` and update §5 + the change log in
`docs/upgrades/README.md` and the table above.

### Wave 5 — `strictNullChecks` (ACTIVE — 1347 errors, flag ON)

> **Why this wave matters most (Arman, 2026-06-29):** this is the **Supabase loudness
> switch**. Every supabase-js call returns `{ data: T | null, error }` (and `.single()` →
> `T | null`); with the flag OFF, TS treated `data` as always-present, so
> `data.map(...)` / `data.id` on a failed-or-empty query compiled clean and **crashed at
> runtime**. The Supabase major bump was already done (`supabase-js` 2.108.2 / `ssr` 0.12,
> Phase C) and both clients are typed `<Database>` — the version was never the gap; the gap
> was `strictNullChecks: false`. Flipping it converts those latent runtime crashes into 1347
> compile errors. Also ran `pnpm db-types` to refresh the generated types (near no-op — only
> two RPC signatures drifted, NO tables removed). **Note:** `pnpm check:schema` flagged 8
> "orphan" types (`admin.feature_docs` + 7 `education.*`) but those are **false positives** —
> the tables are real and live (the live-DB regen kept them); the check's committed snapshot
> `scripts/schema-check/current-schema.json` is stale and should be refreshed separately.

**⚠️ Until this wave reaches 0, `pnpm type-check` / `sync-types` step 3 are RED by design.**
That's the expected WIP state for an active wave (same as Wave 4 ran with its flag on).

**Dominant patterns + canonical fixes (measure bodies, fix the shared shape):**

1. **`X | null` not assignable to `X | undefined` (the #1 shape).** Postgres columns are
   `T | null`; optional RPC args + domain types are `T | undefined`. The classic site is an
   RPC call passing `someId || null`:
   ```ts
   // ❌ supabase-js generates optional RPC args as `string | undefined`; null is rejected
   p_user_id: input.user_id || null,
   // ✅ behavior-preserving — `|| undefined` omits the arg, DB applies its default (null)
   p_user_id: input.user_id || undefined,
   ```
   A whole-file sweep is safe **only when every `|| null` is an RPC `p_*` arg** (verify
   first). **Done as exemplar:** `features/brokers/services/core-broker-crud.ts` (32 → 0).
   For DB-row → domain-object mappers, prefer `?? undefined` per field, or widen the domain
   type to `| null` to match the DB — don't blanket-cast.
2. **`X is possibly 'null' / 'undefined'` (TS18047/18048) on query results.** Guard the
   `error` / empty `data` first (`if (error) throw error; if (!data) return …;`) so `data`
   narrows to non-null before use. This is the real-bug class — handle it, don't `!`.
3. **`Property … does not exist` (TS2339)** usually follows from (2): narrow first.

**Loop:** `pnpm wave:split strictNullChecks` to segregate into per-file task files (Arman is
fixing directly, in batches, not via parallel agents). Re-measure for shared causes BEFORE
grinding. `strictPropertyInitialization` rides on once this is green (re-measure then).

### Wave 6 — `noImplicitAny` (~1420 / 363)

Final wave. `pnpm wave:split noImplicitAny`, fan out, verify, land. After this, evaluate
flipping the umbrella `strict: true` (should be a no-op if the family is fully on).

---

## Fix rules (what every agent must obey)

These are baked into each generated task file; restated here as the contract:

- **No type-check / `tsc` / build.** Work blind from the error list. (Reason above.)
- **Edit only the one assigned file.**
- **No cheating** (`TYPESCRIPT_STANDARDS.md` §3): no `// @ts-ignore`, no
  `// @ts-expect-error`, no `as any`, no `as unknown as`, no `!` non-null assertions, no
  widening to `any`. Fix the real signature.
- **Preserve runtime behavior** — these are correctness fixes, not refactors. Minimal diff.
- For `strictFunctionTypes` specifically: align the function/callback signature with what
  the consumer expects (fix the parameter types). Prefer **widening the implementation's
  parameter** to match the expected signature over narrowing the expected type. Never cast.

### Watch out: the "cast it harder" anti-fix

`strictFunctionTypes` frequently surfaces a TS2352/TS2769 on a line that **already had a
loose `as X` cast** (left over from the old config). The wrong move — which agents reach for
— is to escalate the cast (`as X` → `as unknown as X`). That's a banned hatch, not a fix.

The right move is almost always to **delete the cast entirely**: the cast was masking a
signature the type system can satisfy honestly. Worked example (`PasteImageHandler.tsx`):

```ts
// ❌ agent's "fix" — banned double-cast, and the sibling line still errored
element.addEventListener("paste", handlePaste as unknown as EventListener);
element.removeEventListener("paste", handlePaste as EventListener);

// ✅ correct — no cast: "paste" is a key of HTMLElementEventMap, so the typed
//    addEventListener overload already accepts (ev: ClipboardEvent) => Promise<void>
element.addEventListener("paste", handlePaste);
element.removeEventListener("paste", handlePaste);
```

---

## Quick reference

- Master tracker: `docs/upgrades/README.md` (§5 = strictness plan, §8 = change log)
- Flags live in: `tsconfig.json` → `compilerOptions`
- Type-check command: `pnpm type-check` (uses `tsconfig.typecheck.json`)
- Anti-cheat ratchet: `pnpm check:hatches` / `pnpm fix:hatches <path>`
