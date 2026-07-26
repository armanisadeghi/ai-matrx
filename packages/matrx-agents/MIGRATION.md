# Migration: in-repo source → `@matrx/agents` package

## Where we are

The package is **Phase 9.0–9.3** complete:

- ✅ Workspace bootstrap (`pnpm-workspace.yaml`, `packages/matrx-agents/`)
- ✅ Adapter interface surface (`SupabaseLike`, `FetchLike`, `CallbackManagerLike`, `LoggerLike`, `AuthLike`)
- ✅ `configure()` + runtime registry with strict accessor errors when unconfigured
- ✅ Public module surface — `redux/*`, `config/registry`, adapter interfaces, reducer-map builder (no barrel `index.ts` files)

## What isn't done yet

**Phase 9.4 — file extraction.** Today each module re-exports from
`@/features/agents/redux/...` inside the host app. The package itself
doesn't own any implementation files yet — it's a façade. The extraction
to the package's `src/` tree is a mechanical but large move:

1. Copy each slice/thunk/selector file into `packages/matrx-agents/src/redux/<slice>/`.
2. Rewrite internal imports from `@/features/agents/...` to relative paths
   inside the package.
3. Replace every direct reach into app-owned code:
   - `import { supabase } from "@/utils/supabase/client"` → `getSupabase()`
     from `../config`
   - `selectAccessToken` + `selectFingerprintId` (from
     `@/lib/redux/slices/userSlice`) → `getAuth().getCredentials()`
   - `selectResolvedBaseUrl` (from `@/lib/redux/slices/apiConfigSlice`) →
     `getApiBaseUrl()`
   - `ENDPOINTS.ai.*` → string constants owned by the package, or
     `apiBaseUrl + "/ai/agents/" + agentId` inline
   - `callbackManager` (from `@/utils/callbackManager`) →
     `getCallbackManager().trigger(...)`
   - `fetch(...)` → `getFetch()(...)`
4. Keep the public symbol names identical. The host app's imports continue
   working because the direct module paths stay the same — only the internal
   plumbing flips.

**Phase 9.5 — host app bootstrap.**

1. In the app's store module, call `configure({...})` once, before the
   root reducer is built.
2. Replace the hand-wired reducer map in `lib/redux/rootReducer.ts` with
   `...buildAgentsReducerMap()` so the slice keys stay in sync.

## Why the façade first

Moving 40+ files in a single pass is risky — one bad import and the whole
app breaks. The façade-first approach gives us:

- **A public surface we can test NOW.** Consumers can `import from
  "@matrx/agents/redux/thunks"` (and sibling subpaths) today; the path aliases work.
- **A contract freeze point.** Adapter interfaces + `configure()` are
  settled; no more API bikeshedding during the physical move.
- **A measurable migration.** Every file moved in Phase 9.4 is one
  re-export swap in the module files — linear progress, no integration risk
  spikes.

## Adapter wire-up checklist (for the host app)

```ts
import { configure } from "@matrx/agents/config";
import { supabase } from "@/utils/supabase/client";
import { selectAccessToken, selectFingerprintId } from "@/lib/redux/slices/userSlice";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { callbackManager } from "@/utils/callbackManager";
import { store } from "@/lib/redux/store";

configure({
  supabase,
  fetch: globalThis.fetch.bind(globalThis),
  apiBaseUrl: selectResolvedBaseUrl(store.getState()),
  callbackManager: {
    trigger(id, data) { callbackManager.trigger(id, data); },
  },
  auth: {
    getCredentials() {
      const s = store.getState();
      return {
        accessToken: selectAccessToken(s) ?? null,
        fingerprintId: selectFingerprintId(s) ?? null,
      };
    },
  },
});
```

Two caveats when wiring:

1. **`apiBaseUrl` is computed from state — and state can change.** If the
   host app lets users switch servers at runtime, the package needs to
   re-read the base URL on every outbound call rather than capturing it
   once. `getApiBaseUrl()` already reads the registry each call, so
   callers should `configure()` again on server switches (or we make
   `apiBaseUrl` a getter function in the config — cleaner, and probably
   the right move for Phase 9.4).

2. **`auth.getCredentials()` can be sync OR async.** Package code
   `await`s it either way. This lets RN / future clients fetch a token
   lazily (e.g. from `SecureStore`) without coupling to a synchronous
   Redux selector.

## Opening questions for the shared package

- **Per-conversation selector keying.** Current slice names use
  `instance*` prefixes (`instanceUIState`, `instanceVariableValues`). The
  mental model has unified on `conversations`. Future rename pass (not in
  scope here) should flatten to `display`, `variables`, etc. Do this as a
  coordinated grep-and-replace after the package ships.

- **React-agnostic selectors.** The narrow selectors (`selectMessageContent`
  etc.) are plain functions `(state) => value`. React-Redux bindings live
  OUTSIDE the package, so a non-React consumer can just pass these to
  `store.getState()` or subscribe manually. Already good.

- **SSR-safe.** `configure()` runs on both server and client. No
  browser-only APIs are used at import time. Individual thunks use
  `fetch` / `AbortController` which are available in modern Node + RN.
