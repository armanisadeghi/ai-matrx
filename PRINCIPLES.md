# Operating Principle: Build the Platform, Not the Artifact

> **The artifact is disposable. The class of failure goes extinct.**

This document is the canonical operating principle for everyone — human or agent — working in `matrx-frontend`. The repo's [`CLAUDE.md`](./CLAUDE.md) links here. Read it once, internalize it, and return when you hit friction.

It is the React/TypeScript counterpart of the backend doctrine at [`/Users/armanisadeghi/code/aidream/PRINCIPLES.md`](/Users/armanisadeghi/code/aidream/PRINCIPLES.md). Same principle, frontend-shaped failure modes.

---

## Context

We are building an agentic harness intended to surpass Google, Anthropic, OpenAI, Microsoft, and every major enterprise platform. We cannot out-resource them. We can only out-think them — by treating every task as an opportunity to grow the platform itself.

The frontend codebase is millions of lines. Coherence is its single most valuable property and the easiest one to lose. Every duplicated type, one-off component, parallel slice, and copy-pasted hook **subtracts** from coherence permanently. Doctrine exists to prevent that.

---

## The Principle

Whatever task is in front of you is not the goal. It is an **excuse** — a forcing function that reveals what the platform is missing. Your real job is to build (or extend) the capability that makes the task trivial, then complete the task by consuming it. The artifact is disposable. The capability is the product.

This applies to **every kind of work**: features, refactors, integrations, UI, tooling, and — most importantly — bug fixes.

---

## Two modes

### Mode 1: Building features

Build (or extend) the primitive first, then build the feature on top of it as the first consumer.

- Asked to add a button with a spinner? Don't write `LoadingButton`. Extend [`components/ui/button.tsx`](./components/ui/button.tsx) with a `loading` prop. Every future async button inherits it.
- Asked to add a sortable list? Don't write sort logic in that screen. Find the table primitive (or build one in `components/official/`). Every future list inherits sorting, filtering, pagination.
- Asked to add a "share via link" dialog? Don't roll a new modal. Compose [`@/components/ui/dialog`](./components/ui/dialog.tsx) + the existing `confirm` / `TextInputDialog` primitives. Every future share flow gets the same a11y, focus management, and mobile drawer behavior.
- Asked to add a new file source (e.g. clipboard paste from a third-party tool)? Don't write a new upload path. Extend `FileSource` in [`features/files/handler/types.ts`](./features/files/handler/types.ts) and add an adapter. Every future input shape flows through the same pipeline.

### Mode 2: Fixing bugs

Fix the bug — then work backward through every layer that allowed it to happen.

A bug is almost never a single failure. It is the visible tip of three, four, five upstream weaknesses that all had to align. Fixing only the symptom guarantees the next variant of the same bug. The discipline:

1. **Stop the bleeding.** Patch the immediate symptom so users are unblocked.
2. **Trace the chain.** Ask "what allowed this to happen?" repeatedly until you reach actual root causes — usually missing types, missing selectors, missing validation, missing hook abstractions, missing observability, or missing guardrails.
3. **Harden each layer.** Fix every root cause as a platform-level improvement. A missing null check becomes a typed contract. A duplicated state becomes a slice extension. A surprising re-render becomes a memoized selector. A silent fetch failure becomes a typed error class in the handler.
4. **Make the class of bug extinct.** When you finish, the entire category of failure should be structurally impossible — not just fixed in this one place.

**Example.** Avatar fails to render on the profile page. The patch is a fallback image. *Why* did it fail? The URL was an expired signed URL. *Why* did the component get a raw URL? It hand-constructed an `<img src>` instead of going through `useFileSrc`. *Why* could that happen? The component imported a `cloudFileToUrl` helper that bypassed the handler. *Why?* The helper exists. **The bug fix ships in an hour. The next change deletes the helper, moves the call site to `useFileSrc`, and adds the path to the file-handler ring-fence in [`eslint.config.mjs`](./eslint.config.mjs)** — and avatars, attachments, exports, and every future media surface inherit the fix.

---

## The Rule

When you hit friction, a gap, or a failure, you have two options:

1. Patch around it for this one case. **Forbidden.**
2. Build (or harden) the missing capability as a generic, named, documented primitive, then resolve the task by consuming it. **Required.**

If the code you are about to write only serves this single artifact and could not be reused by anything else, stop. Either generalize it or do not write it.

---

## The five frontend anti-patterns (where this almost always breaks)

These are the failure modes agents repeat in this codebase. Every one is a violation of the doctrine. Each has a "look here first" anchor and a search algorithm.

### 1. Local types

**The failure.** Declaring `interface FooProps` / `type Bar` inside a component, hook, or feature file when the same shape already exists in a shared location. Worse: silencing the resulting type errors with `as`, `as any`, or `as unknown as X` coercion.

**Why it kills coherence.** Two versions of the same concept drift independently. The Supabase row gains a column; only one of the local copies gets updated. Type safety collapses silently. The next agent sees both and now has to guess which is canonical.

**Look here first.**

- **Database rows:** [`types/database.types.ts`](./types/database.types.ts) (Supabase-generated, regenerated via `pnpm db-types`). **Never** hand-redeclare a row shape.
- **File pipeline:** [`features/files/handler/types.ts`](./features/files/handler/types.ts) — `FileSource`, `NormalizedFile`, `FileTarget`, `MediaBlock`, `UploadOpts`. Plus [`features/files/types.ts`](./features/files/types.ts) — `CloudFile`, `Asset`, `MediaRef`, `Visibility`, `PermissionLevel`.
- **Agents / messages:** [`features/agents/types/`](./features/agents/types/) — `ImageBlock`, `AudioBlock`, `VideoBlock`, `DocumentBlock`, `MessagePart`, execution and definition types.
- **Per-feature types:** every Tier-1/2 feature has a `types.ts` (`features/conversation/types.ts`, `features/notes/types.ts`, `features/sharing/types.ts`, `features/settings/types.ts`, etc. — see `CLAUDE.md` for the full list).
- **Cross-feature utility types:** [`types/`](./types/) — `entities.ts`, `FlexibleId.ts`, `supabase-rpc.ts`, `MatrxServerTableTypes.ts`.

**Search algorithm.**

1. **Small / clear case** — grep the name and likely synonyms before declaring. `rg "interface ${Name}|type ${Name} ="`, `rg "${Name}Props"`, `rg "${BaseConcept}"`. If anything plausible turns up, read it.
2. **Larger case** — when the concept is foundational (a new message shape, a new file kind, a new entity touching multiple features), delegate enumeration to an `Explore` subagent: *"Find every type in this repo that represents `<concept>`. List file paths, the type name, and 1-line of what it carries. Don't recommend — just enumerate."* Then **you** read the list and pick the canonical one, or propose extending the closest match.
3. **Never coerce.** `as any`, `as unknown as X`, and `as X` casts that bypass the compiler are doctrine violations. If the types don't line up, the fix is either (a) extend the canonical type, (b) write a typed adapter, or (c) raise a typed error. Coercion freezes the bug into the code. Full fix doctrine (Reality Check, forbidden "fixes", the one sanctioned DB-guarded cast): the **`type-safety`** skill + [`TYPESCRIPT_STANDARDS.md`](./TYPESCRIPT_STANDARDS.md) §3.

**Acceptance test.** *"If the Supabase schema changes tomorrow, will every relevant call site type-error correctly?"* If your new local type would shield call sites from that signal, delete it.

### 2. Recreated components

**The failure.** Building `LoadingButton`, `ConfirmModal`, `PrimaryAction`, `MyCard`, `DataTable2`, etc. when an existing component covers 90% of the need and a prop would cover the rest. Or rebuilding a Dialog with header / scrollable body / pinned footer from scratch every time instead of composing the canonical building blocks.

**Why it kills coherence.** A component used 50 times gets stress-tested. A component used once carries the bug it shipped with forever. The result is 20 versions of "the button" with different sizes, animations, focus rings, and accessibility gaps — and the user feels every one of them.

**Look here first.**

- **Canonical, composed components:** [`components/official/`](./components/official/) — the 27-component canonical set. Browse the live registry at `/administration/official-components` (route: `app/(authenticated)/(admin-auth)/administration/official-components/`).
- **Foundation primitives (shadcn/ui):** [`components/ui/`](./components/ui/) — Button, Dialog, Drawer, Input, Select, Toast, Tooltip, Popover, etc. These compose into everything else. Extend props here when the prop is genuinely cross-cutting.
- **Confirm / prompt / clipboard:** see CLAUDE.md "Browser dialogs are banned" — every replacement lives under `components/ui/confirm-dialog`, `components/dialogs/confirm/`, `components/dialogs/text-input/`, `components/dialogs/clipboard-fallback/`.
- **File rendering / picking:** never hand-render media or files — `FilePreview`, `MediaThumbnail`, `FileTree`, `FileResourceChip`, `openFilePicker`, `openFolderPicker` are all re-exported from `@/features/files`.
- **Window-panel surfaces:** every floating window, sheet, modal, and inline overlay goes through the registry at `features/window-panels/registry/windowRegistry.ts`. Invoke the `window-panels` skill before adding one.

**Search algorithm.**

1. **Small / clear case** — open `components/official/` and `components/ui/` in your editor; grep for the concept (`rg -l "Button" components/ui`, `rg "loading" components/ui/button.tsx`). Read the props of the closest match.
2. **Larger case** — delegate to `Explore`: *"List every component in this repo whose props or layout match `<description>`. Include `components/official/`, `components/ui/`, and any feature-scoped components under `features/*/components/`. Return name, path, and the prop signature."* Read the list. The right answer is almost always *extend an existing component with a prop*, not *create a new one*.
3. **If you must create a new one** — put it in `components/official/` (or `components/ui/` if it's a primitive). Add it to the registry at `app/(authenticated)/(admin-auth)/administration/official-components/parts/component-list.tsx`. Single-file additions buried inside a feature route are doctrine debt — the component will never be reused, even if it could have been.

**Acceptance test.** *"If I deleted this component, could I rebuild the surface in minutes by composing existing primitives + adding one prop?"* If yes — you should have done that instead.

**The form-control sub-case (most common, most user-visible).** The recreated-component failure that bites real users the hardest is the hand-rolled *form control*: a `<div>` faking a checkbox (a bordered box + a conditionally-rendered `Check` icon), a raw `<input type="checkbox|radio|range">`, or a `rounded-full` track with a sliding `translate-x` thumb faking a `Switch`. These skip the design tokens, so they look broken in light/dark, lose the focus ring, and drop keyboard + a11y support. **Always use [`components/ui/checkbox`](./components/ui/checkbox.tsx), [`components/ui/radio-group`](./components/ui/), [`components/ui/switch`](./components/ui/), and [`components/ui/slider`](./components/ui/)** — never rebuild them inline, even in demos/admin/prototypes. This whole class is detected by **`pnpm check:ui-primitives`** ([`scripts/check-ui-primitives.ts`](./scripts/check-ui-primitives.ts)) — full-repo by default (`pnpm check:ui-primitives:strict`), `--staged` / `--branch` for scoped scans, `--strict` blocks release. **Exception:** hidden checkbox inputs that only drive pure-CSS layout (`sr-only`, `aria-hidden`, or a dedicated `*-toggle` hook class for `:checked` / `:has()` / `peer-checked`) — not visible form controls. If you need a colored accent (e.g. per-category), put it on the *container*, not by reinventing the control.

### 3. Parallel Redux slices

**The failure.** Spinning up a new `createSlice` for data that already lives in an existing slice, because "it's easier for this screen." Or duplicating the same state in component-local `useState` because finding the existing selector took thirty seconds.

**Why it kills coherence.** Two slices owning the same data means writes happen against one and reads happen against the other, and the discrepancy surfaces as a bug in three weeks that takes a day to trace. Redux exists *so this can't happen*. Bypassing it discards the entire benefit.

**Look here first.**

- **Store:** [`lib/redux/store.ts`](./lib/redux/store.ts) + [`lib/redux/hooks.ts`](./lib/redux/hooks.ts). Always use `useAppDispatch` / `useAppSelector` / `useAppStore` — never untyped variants.
- **Cross-cutting slices:** [`lib/redux/slices/`](./lib/redux/slices/) — `overlaySlice`, `windowManagerSlice`, `layoutSlice`, `userAuthSlice`, `userProfileSlice`, `userPreferencesSlice`, `agentCacheSlice`, `artifactsSlice`, `entitySystemSlice`, `apiConfigSlice`, etc. (33 slices total).
- **Feature-scoped slices:** [`features/*/redux/`](./features/) — e.g. `features/agents/redux/agent-definition/`, `features/agents/redux/execution-system/`.
- **Entity-store layer:** [`lib/redux/entity-store.ts`](./lib/redux/entity-store.ts) and `lib/redux/entity/` — the generic entity-manager pattern. If your data is "rows of a Supabase table," the entity layer is probably the right home.
- **Selectors:** every slice exports memoized selectors via `createSelector`. **Every property has its own selector.** Don't `useSelector(state => state.foo.bar.baz)` — find or add a named selector.

**Search algorithm.**

1. **Small / clear case** — `rg "createSlice" lib/redux/slices/` + `rg "createSlice" features/*/redux/` to enumerate. Then `rg "<your-state-concept>"` across slices to find the existing home.
2. **Larger case** — when the data is a new domain object that might touch multiple features, delegate to `Explore`: *"Find every Redux slice and selector that touches `<concept>`. List slice name, path, the state shape, the public selectors, and the actions. Don't recommend."* You decide whether to (a) add fields to an existing slice, (b) add a selector / action to an existing slice, or (c) — rarely — create a new slice that composes with the existing ones.
3. **Never use `useState` for global concerns.** If two unrelated components ever need the same fact, it belongs in Redux. Component-local state is for transient UI (open/closed, hover, draft text being typed).
4. **If a selector or action doesn't exist, ask before creating one** (this is from `CLAUDE.md` and applies doubly here — many existing selectors look absent until you grep for the right name).

**Acceptance test.** *"If I deleted my new slice / selector / action, could the screen still work using only existing slice primitives + one composed selector?"* If yes — you should have done that instead.

### 4. Duplicated hook logic

**The failure.** Writing a new hook that does what an existing hook already does, because you didn't look. Or — worse — calling an existing hook AND re-implementing its logic in the component on top of it ("the hook gives me X, but I also need Y, so let me just add a `useState` + `useEffect` here"). The hook already handles Y; the duplicate fights it.

**Why it kills coherence.** Hooks are how this codebase enforces invariants — auth, file resolution, mobile detection, debounce, navigation transitions, realtime subscription teardown, observability. Re-implementing them in components leaks those invariants past the boundary and creates subtle bugs that only show up under specific conditions (slow network, mobile, race-y dispatch).

**Look here first.**

- **General-purpose:** [`hooks/`](./hooks/) — `use-mobile.tsx`, `use-media-query.ts`, `use-toast.ts`, `use-outside-click.ts`, `useApiAuth.ts`, `useBackendApi.ts`, `useClipboard.ts`, `useTextToSpeech.ts`, `useContentBlocks.ts`, `useContextCollection.ts`, `useSystemPrompts.ts`, `useTools.ts`, etc.
- **Schema / metadata / RPCs:** [`lib/hooks/`](./lib/hooks/) — `useModule`, `useDatabase`, `useSchema`, `useEnums`, `useNavigationInterceptor`, `useSqlFunctions`, `useCommonFormats`, `useUser`.
- **File pipeline (the entire family):** [`@/features/files`](./features/files/) re-exports `useFile`, `useFileAs`, `useFileSrc`, `useFileBlob`, `useFileMediaBlock`, `useFileDownloadUrl`, `useFileUpload`, `useFileNode`, `useFolderNode`, `useCloudTree`, `useFolderContents`, plus the imperative `fileHandler` / `requestUpload`. ESLint hard-bans bypassing them.
- **Feature-scoped hooks:** under `features/*/hooks/` — read the feature's `FEATURE.md` before assuming the hook you need doesn't exist.

**Search algorithm.**

1. **Small / clear case** — `rg "export function use" hooks/ lib/hooks/`, then narrow by concept. Read the closest match's source — it almost always already returns more than its name suggests.
2. **Larger case** — delegate to `Explore`: *"Find every hook in this repo that loads / mutates / subscribes to `<concept>`. List name, path, signature, return shape, and 1-line of behavior."* Read the list before deciding.
3. **Trust the hook.** If you're using `useFileSrc` and finding yourself adding `useState` + `useEffect` around it to handle loading or errors, the hook already exposes that — read its return value. The duplicate state will race the hook's own state and the bug will look like the hook is broken.
4. **Extend, don't fork.** If an existing hook is 80% of what you need, add an option to it. Backward-compatible additions (new optional argument with a sensible default) are almost always safe. Forking creates two hooks both pretending to be canonical.

**Acceptance test.** *"If I deleted my new hook, could the component do its job using only existing hooks + a few inline state values for transient UI?"* If yes — you should have done that instead.

### 5. The agent mindset trap

**The failure.** Generating new code feels cheap; reading existing code feels expensive. Agents bias toward writing because writing produces visible output and reading produces "nothing." The result is code bloat, fragmentation, and technical debt accumulating one task at a time.

**Humans are lazy in the right way.** They avoid writing extra code, so they find existing solutions. **Agents are lazy in the wrong way.** They avoid the effort of searching, reading, understanding — and generate new code instead.

**The rule.** Reading and grepping is *not* "wasted effort." It is the work. The "look here first" anchors above are not optional checks — they are the first action of every task that creates a type, component, slice, hook, or service.

**The escalation discipline.** Calibrate search effort to feature size:

- **Trivial change** (one prop, one line, one selector): grep + read the matching file. ~30 seconds.
- **Medium change** (a new screen, a new dialog flow): grep the concept across `features/`, `components/`, `hooks/`. Read 2-3 candidates. ~2-5 minutes.
- **Large change** (a new feature, a new entity, a new cross-cutting concern): **delegate enumeration to an `Explore` subagent**. Give it the concept and ask for a structured list of every existing primitive that touches it. Read the list yourself. Decide whether to extend an existing primitive or — rarely, with explicit reasoning — to build a new one. The main agent reviews the subagent's findings before writing a single line of new code.

The bigger the feature, the more time goes into the lookup. This is not a tax on velocity; it is the velocity. Every shortcut taken at lookup time is paid back tenfold in the debugging session three weeks from now.

---

## How this composes with existing rules in `CLAUDE.md`

The doctrine doesn't replace anything in `CLAUDE.md`; it provides the *frame* the existing rules sit inside. Several rules are direct expressions of this doctrine:

- *"Extend existing slices; never spin up parallel or local state"* → anti-pattern #3.
- *"If an action or selector doesn't exist, ask before creating one"* → anti-pattern #3 + #5.
- *"Never write to project root. One README.md per feature, only after the code is tested"* → infrastructure-first.
- *"Do not invent new top-level features"* → infrastructure-first; the user owns that decision.
- *"Browser dialogs are banned"* → anti-pattern #2 (`confirm`/`alert`/`prompt` are recreated components in disguise).
- *"File Handling — Single Entry Point"* → anti-pattern #4 hardened with ESLint.
- *"Barrel files are being eliminated"* → import from source so refactoring isn't masked by re-exports.
- *"Do not invent a new admin-gate primitive"* → anti-pattern #4 applied to authorization.

When a rule in `CLAUDE.md` and your immediate task seem to conflict, the rule wins, and the conflict is itself a signal that the task is asking you to violate the doctrine. Reach for the doctrine first; re-shape the task to fit the rule.

---

## Acceptance tests

When finished, ask:

- *For features:* "If I deleted what I just built, could I rebuild it in minutes using only existing platform capabilities?"
- *For bug fixes:* "Is this entire class of bug now structurally impossible, not just fixed in this one place?"
- *For any change:* "Did I add a new type / component / slice / hook? If yes — did I prove (via grep, file read, or `Explore` subagent) that no existing primitive could be extended instead, and is that proof traceable in the PR description?"

If yes — done. If no — the remainder is your next infrastructure ticket. Extract it.

---

## Non-negotiables

- Friction is a signal, not an obstacle. Every gap is a primitive you haven't built yet.
- Every bug is a stack of root causes. Fix all of them, not just the visible one.
- Name and scope every new capability generically. If only one caller fits, it isn't a primitive — it's an artifact you shouldn't be writing.
- Declarative over hardcoded. Anything that could be data should be data — render lists from registries, not from hand-typed JSX.
- No type coercion (`as any`, `as unknown as X`, unsafe `as X`). If types don't line up, the canonical type is wrong or your shape is wrong — fix one of them.
- Every task must leave the platform measurably more powerful — and a class of future failures measurably less possible — than it found it.

---

## Enforcement

Doctrine without enforcement is decoration. The following are in force today:

- **ESLint rules** ([`eslint.config.mjs`](./eslint.config.mjs)) — barrel-file warning, file-handler ring-fence (4 tiers, hard error), window-panels registry import ban, legacy Supabase key hard ban, parallel-`createSlice` ban (outside designated dirs), `as any` and `as unknown as` warning, dialog ban (warn).
- **`pnpm check:doctrine`** ([`scripts/check-doctrine.ts`](./scripts/check-doctrine.ts)) — scans staged / branch-diff files and lists newly created types, components, slices, and hooks so you can confirm none duplicate existing primitives. Run before opening a PR.
- **Pre-commit hook** ([`simple-git-hooks` + `lint-staged`](./package.json)) — runs `eslint --max-warnings 0` on staged `.ts`/`.tsx` files. New ESLint errors block the commit.
- **Feature template** ([`features/_FEATURE_TEMPLATE.md`](./features/_FEATURE_TEMPLATE.md)) — every `FEATURE.md` includes a "Doctrine compliance" section listing the existing primitives reused and (if any) the new primitive introduced + why nothing existing could have been extended.
- **Code review** — PRs that introduce a new type, component, slice, or hook without an extension-vs-creation justification in the description are sent back. The author or the reviewer can run `pnpm check:doctrine` to surface what was added.

If you discover a doctrine violation that lint/script doesn't catch, the next infrastructure ticket is: make it catchable.
