# Overlay & Window Roadmap

> Companion to [`features/overlays/FEATURE.md`](../features/overlays/FEATURE.md), [`features/window-panels/FEATURE.md`](../features/window-panels/FEATURE.md), and [`docs/OVERLAY_WINDOW_OVERHAUL.md`](./OVERLAY_WINDOW_OVERHAUL.md). This doc is the **honest list of what's still rough** in the post-overhaul state plus where the system can grow.

## 1. Known gaps (real debt — would fix today if time allowed)

### 1.1 Six `as never` casts in the controller

[`features/overlays/OverlayController.tsx`](../features/overlays/OverlayController.tsx) still has 6 `as never` casts. Each is documented inline with a `// TODO:` note explaining why. All trace to **non-exported local types** in the consumer components:

| Overlay | Prop | Blocker |
|---|---|---|
| `fullScreenEditor` | `tabs`, `initialTab` | `TabId` is a local type duplicated in two files |
| `agentRunHistoryWindow` | `initialGroupBy` | `GroupBy` is a non-exported local type |
| `resourcePickerWindow` | `attachmentCapabilities` | Anonymous inline shape, structurally incompatible with the exported alias |
| `streamDebug` | `defaultPosition` | Anonymous inline `{ x: number; y: number }` |
| `whatsappMediaWindow` | `initialTabId` | `MediaTabId` is non-exported |

**Fix path**: refactor each consumer to export its type. Touches 5 files. Pure cleanup, no behavior change. Done at leisure, post-cutover.

### 1.2 ~290 unmigrated raw `dispatch(openOverlay(...))` sites

`AgentOptionsMenu.tsx` is migrated as a canary (27 sites → typed openers). The remaining sites still use raw dispatches. They work — both paths funnel through the same slice — but lose type safety on the dispatched data shape.

**Fix path**: incremental. Each site is mechanical: import the opener, replace `dispatch(openOverlay({ overlayId, data }))` with `useOpenX()(opts)`. A sub-agent can sweep a feature area in one shot (see how [AgentOptionsMenu was migrated](../features/agents/components/shared/AgentOptionsMenu.tsx) for the pattern). Suggest doing 5–10 high-traffic features as a batch, then leaving the rest to migrate as files are touched.

### 1.3 Callback contract files still under `features/window-panels/windows/*/callbacks.ts`

The 7 callback-aware openers (`imageUploader`, `smartCodeEditor*`, `curatedIconPicker`, `contentEditor*`) live in `features/overlays/openers/` as **thin re-exports** of the hand-written hooks at `features/window-panels/windows/<feature>/useOpenX.ts`. The actual callback contract files (`callbacks.ts`) also still live there.

The end state from the plan was to put callbacks under `features/overlays/callbacks/<overlayId>.ts`. That move requires:
- Moving 5 `callbacks.ts` files
- Updating 5 `useOpenX.ts` files' imports
- Updating each component file's import (the components themselves import their own `callbacks.ts` to subscribe to the group)

Mechanical but cross-cuts ~20 files. Low value (the current structure works); good cleanup PR for someone with a spare afternoon.

### 1.4 No first-class refs integration in openers

The user owns a `lib/refs/` system (`RefProvider` + `useRefManager` + `useComponentRef`). The overhaul plan called for openers to expose typed `handle.ref.<method>()` proxies that wrap `useRefManager().call(componentId, method, ...)`. **Not built.** Today, callers wanting to call imperative methods on a rendered overlay component use `useRefManager()` directly.

**Fix path**: a separate proposal. Each callback-aware opener could declare a `MethodsContract` interface; the codegen could emit a typed `handle.ref` proxy. ~30 lines per opener. Maybe 1 day of focused work. No callers exist who would benefit YET, but the user explicitly asked about this in the architecture conversation — it's the natural completion of the "feels like a normal component" goal.

### 1.5 System 3 reorganization not done

The plan called for moving `lib/redux/slices/windowManagerSlice.ts` → `features/windows/manager.ts` and grouping the related primitives (`WindowTray`, `WindowTraySync`, `WindowPanel`, hooks) under `features/windows/`. **Not done.** Touches ~15 importers; pure file-move + import-update; zero behavior change.

The motivation was naming: "windows" as a concept lives in `features/window-panels/`, conflating with the deprecated overlay registry stuff. After the legacy controller files are deleted (Stage 6), the directory becomes cleaner; this move becomes a smaller rename. Defer.

### 1.6 System 4 (URL + DB persistence) not built

The original task that started the April 2026 conflation was tab persistence — "open a window, refresh, window comes back." That work was never finished. The infrastructure exists:

- `WindowPersistenceManager.tsx` reads/writes `window_sessions` rows on mount.
- `features/window-panels/url-sync/UrlPanelRegistry.ts` has `registerPanelHydrator` for parsing `?panels=…` on boot.

What's missing:

- **URL write side**: middleware that subscribes to `openOverlay`/`closeOverlay` and updates `?panels=` on the URL (debounced). Today the URL only updates if a specific hook is wired per overlay.
- **`persistenceMode` field** in the catalogue: `none` / `id-only` / `full`. Determines what gets saved.
- **`useWindowCollectData(cb)` hook** for full-mode windows to provide their ephemeral state for DB persistence.

**Fix path**: This is Stage 7 in the overhaul plan. Real work — probably 2 focused days. Not blocking the cutover, but it's the original product feature that was never finished.

### 1.7 The diagnostic middleware can be retired (or kept)

[`lib/redux/middleware/overlayDiagnostics.ts`](../lib/redux/middleware/overlayDiagnostics.ts) exists to catch silent-failure bugs in the OLD spread-render path: an overlay dispatched but no component mounted within 1500ms. With the new explicit controller, this class is structurally impossible — dispatch → JSX render is one synchronous React tree commit.

**Choice**: keep as a safety net forever (cheap; ~200 lines; the timing-watchdog is also useful for catching chunk-load failures from service workers, CSP problems, etc.), or delete post-cutover. Currently we keep. Could remove the heartbeat probes if we want to trim.

### 1.8 Codegen and the controller can drift

`scripts/generate-overlay-controller.ts` was a one-shot seeder. After tightening 35 of 41 `as never` casts by hand, re-running the codegen would blow that work away. The codegen knows to skip the 7 callback-aware openers (`CALLBACK_AWARE_OPENERS` set), but not the hand-tightened controller.

**Fix path**: either (a) delete the codegen entirely now that the seed has done its job and the controller is fully hand-edited, or (b) teach the codegen to merge — preserve hand-edits while emitting new entries on demand. Option (a) is honest; option (b) is more work than it's worth. **Recommend deleting the codegen post-cutover.** The controller is a normal hand-edited file from this point forward.

### 1.9 ESLint rules are still warn-only

The "no JSX spread in OverlayController.tsx" rule is set to `warn` (not `error`) during the migration period. The plan called for bumping it to `error` after the cutover. **Pending.**

Also pending: the "no `openOverlay`/`closeOverlay`/`toggleOverlay` import outside `features/overlays/`" rule. Would currently fire on ~290 existing dispatch sites; need to migrate them first or accept hundreds of warnings.

### 1.10 The catalogue isn't used as much as it could be

[`features/overlays/catalogue.ts`](../features/overlays/catalogue.ts) has metadata for every overlay (label, instanceMode, isWindow). Currently it's used for nothing except documentation. It SHOULD be used by:

- The Tools Grid (currently reads from the legacy registry metadata)
- URL hydration (currently reads from the legacy registry metadata)
- WindowPersistenceManager (same)
- Admin smoketest pages
- Doctrine / drift-check scripts

After the legacy registry is deleted (Stage 6), all those consumers need to migrate to the new catalogue. **This is a real piece of cleanup work that hasn't started.**

---

## 2. Improvements (could ship, would add real value)

### 2.1 Zod schemas per overlay for runtime data validation

The opener's `Options` interface is a TypeScript-only contract. A misbehaving caller could pass `null` where a string is required (e.g. through `as any` or a JSON.parse). Today the component would crash on first access.

**Idea**: per-overlay Zod schemas in `features/overlays/openers/<id>.tsx`. The hook validates `opts` against the schema in dev (free runtime safety, stripped in prod). Bonus: schemas double as documentation.

```tsx
const Options = z.object({
  initialAgentId: z.string().nullable().optional(),
  initialSelectedConversationId: z.string().nullable().optional(),
});
export type OpenAgentRunWindowOptions = z.infer<typeof Options>;
export function useOpenAgentRunWindow() {
  const dispatch = useAppDispatch();
  return useCallback((opts: OpenAgentRunWindowOptions = {}) => {
    if (process.env.NODE_ENV !== "production") Options.parse(opts);
    // ...
  }, [dispatch]);
}
```

Codegen can emit the Zod schema from the Props interface (with the same heuristics it uses to emit Options today). ~1 day of work; adds ~15 KB to dev bundle; zero prod cost.

### 2.2 Render-side runtime guards from the same Zod schemas

The OverlayController's runtime guards (`typeof data?.x === "string" ? data.x : null`) are hand-written and inconsistent. If we have a Zod schema per overlay, the controller can call `Schema.safeParse(data)` once per overlay open and pass the validated value:

```tsx
{(() => {
  const isOpen = isOpenById.agentRunWindow;
  const raw = dataById.agentRunWindow;
  if (!isOpen) return null;
  const parsed = AgentRunWindowOptionsSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn("[overlays] agentRunWindow received invalid data:", parsed.error);
    return null;  // or render with defaults, or render an error UI
  }
  return <AgentRunWindow isOpen onClose={…} {...parsed.data} />;
})()}
```

That's actually a `{...spread}` though — except now it's safe because the spread comes from a Zod-validated object whose shape exactly matches the Props. Could be a sanctioned exception to the no-spread rule, or we keep the explicit prop list and just use `parsed.data.x` inside it.

### 2.3 An "overlay playground" admin page

A `/administration/overlay-playground` page that:
- Lists every overlay in the catalogue
- For each, shows a JSON editor pre-filled with the Options shape (from the Zod schema if we ship it, else from the Props interface)
- "Open" button that calls the opener
- Shows the catalogue metadata + persistence mode + URL key + instance mode in a sidebar

Lets engineers exercise overlays without setting up the production flow. Free QA tooling. ~half day.

### 2.4 Performance: 111 `useAppSelector` subscriptions in the controller

Right now the controller has 111 `useAppSelector(s => selectIsOverlayOpen(s, X))` plus 111 `useAppSelector(s => selectOverlayData(s, X))`. That's 222 Redux subscriptions on the singleton controller component, all re-checking on every state update.

In practice this is fine — Redux subscriptions are cheap and Redux Toolkit dedupes — but it's not free. Two improvements:

- **Single combined selector**: `useAppSelector(selectAllOpenOverlays)` returns a `Record<overlayId, { isOpen, data }>` and we read from that. One subscription, one re-render trigger per state change.
- **Memoize on isOpen-changes only**: only re-run the JSX for overlay X when isOpen[X] or data[X] changes. Today every overlay block runs every render. React's reconciliation handles this, but explicit memoization at the block level (one `useMemo` per overlay) would let DevTools profiling show per-overlay work.

Net: low-priority. Profile first.

### 2.5 Codemod for the legacy → opener migration

The remaining ~290 dispatch sites can be migrated mechanically. A jscodeshift or simple regex codemod could:

1. Find `dispatch(openOverlay({ overlayId: "X", data: {...} }))`
2. Look up the opener for `X`
3. Replace with `useOpenX()(opts)` and add the import
4. Hoist the `useOpenX()` call to the component's top (since it's a hook)

Could clear 80% of the remaining sites in a single PR. Sub-agent territory.

### 2.6 Per-overlay performance budget + tooling

The new controller eagerly subscribes to all overlays. A subtle problem: opening overlay A doesn't help us know how often overlay B fires. We could:

- Add a per-overlay "open count" metric (cheap; debounced flush to /admin telemetry)
- Surface "top 10 most-opened overlays" in the playground page
- Identify overlays that are never opened in production for deletion

### 2.7 A typed `handle.ref` proxy

(Cross-references #1.4 above.) Today opener handles expose `close()` and (for callback-aware ones) `dispose()`. They could also expose `ref` — a typed proxy that wraps `useRefManager().call(componentId, methodName, ...args)`:

```tsx
const handle = openAgentRun({ initialAgentId: id });
handle.ref.focusInput();             // calls registered method
handle.ref.sendMessage("hello");
```

Implementation: each overlay declares a `Methods` interface; component registers via `useComponentRef`; opener proxies the registered methods. Codegen emits the proxy.

### 2.8 First-class instance focus + window arrangement

`windowManagerSlice` tracks focus per window via `focusedAt`. The opener could expose:

```tsx
const handle = openAgentRun({ … });
handle.focus();    // brings window forward
handle.minimize();
handle.maximize();
handle.popout();
```

These already exist as actions on `windowManagerSlice`. The opener wraps them with the window's id. Trivial addition once the opener pattern is locked in.

### 2.9 Cross-overlay communication (without Redux)

Today, overlay A wanting to talk to overlay B does so via Redux state OR via the callback registry. Both work but feel like plumbing.

**Idea**: a typed channel system. Overlays declare a "publishes" set and a "subscribes" set; the opener wires them up. E.g., the agent-run window publishes `agentSelected` events; the agent-list window subscribes. Without writing any glue Redux.

This is real new infrastructure — would want a small RFC before building. Probably overkill for the current usage patterns.

### 2.10 Group windows (e.g., agent + its history side-by-side)

Today, opening agent X's run window and X's history window means two independent overlays. Power users tile them manually. The system could:

- Declare "window groups" in the catalogue (e.g., `agentRunGroup` = [`agentRunWindow`, `agentRunHistoryWindow`])
- Provide a `useOpenAgentRunGroup({ agentId })` opener that arranges them side-by-side
- Persist as one URL key

Useful for the "studio" surfaces. Probably half a day of work, mostly in `windowManagerSlice` for the arrangement math.

---

## 3. Aspirational / blue-sky

### 3.1 An overlay router

Currently overlays open via dispatch. URL hydration on page boot is one-way (URL → dispatch). What if we treated overlay state AS the URL primary, with the slice being a derived cache?

Route: `/agents?run=agentX&history=true&editor=tab:variables`

- URL changes → slice updates → controller renders
- Slice updates → URL updates (debounced)
- Refresh, back/forward, share — all just work

Doable but a fairly large refactor of `WindowPersistenceManager` and the slice. Worth it for the persistence story.

### 3.2 Overlay-level analytics events

Each overlay opener could automatically fire a typed analytics event:

```ts
analytics.track("overlay_opened", {
  overlayId: "agentRunWindow",
  instanceMode: "singleton",
  agentId: opts.initialAgentId,
});
```

Free product-usage telemetry. Wire into PostHog / whatever's current.

### 3.3 Visual designer for overlays

Stretch goal. A page where you drag-drop a `<WindowPanel>` body, declare its props, and the system emits the registration entry + opener stub + controller block. Useful for non-engineer collaborators.

Probably 2 weeks of work. Big swing.

### 3.4 Native-window popout

The legacy system has a `popoutMode: "pip" | "popup"` state. The current implementation uses CSS positioning + a separate window manager state. A real implementation would use `window.open` for a true OS-level popout — drag a window OUT of the browser.

`windowManagerSlice` already tracks `popoutMode` and `prePopoutRect`. The actual `window.open` integration isn't built.

---

## 4. What's deliberately NOT planned

A few things we explicitly decided against during the architectural conversation. Listing them so future agents don't propose them:

- **A `kind: "window" | "modal" | "sheet"` discriminator on overlay metadata.** The whole point of the overhaul was to stop treating these as different things at the rendering layer. They're all just components. (If we ever need different chrome, we name new components, not branch on kind.)
- **Auto-iterating the catalogue to render**. The catalogue is metadata only. Iterating it to render brings back the generic-spread bug class.
- **A "smart" data merger that hydrates dispatch payloads from catalogue defaults**. Defaults live in the controller's JSX (`prop={data?.x ?? "default"}`). Inferring them from a separate "defaults" map is exactly the conflation we backed out of.
- **Replacing `callbackManager` or `lib/refs/`**. They work. Use them.

---

## 5. How to prioritize

If forced to rank the top five "what to do next" items:

1. **Ship the cutover** (Stage 5 in `OVERLAY_WINDOW_OVERHAUL.md`). Validate in dev, flip the env var in prod, bake 48h. Until this happens, none of the cleanup below can land.
2. **Delete the legacy code** (Stage 6). `UnifiedOverlayController`, `OverlaySurface`, `windowRegistry*`. Trims ~3000 lines and eliminates the rendering ambiguity.
3. **Migrate the top 5 dispatch-site features** (#2.5 above with a codemod or a sub-agent). Each removes a class of legacy import. Cumulative cleanup.
4. **Build System 4 — window persistence** (#1.6). The original ask. Big product win.
5. **Zod-validate the dispatch payloads** (#2.1). Closes the runtime-safety gap that explicit TypeScript prop wiring already closed at compile time.

Everything else is "nice to have."
