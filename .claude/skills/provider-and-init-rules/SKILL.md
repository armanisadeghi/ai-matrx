---
name: provider-and-init-rules
description: >
  Enforces initialization, provider, and data-fetching rules for the app shell, layout, and global provider tree.
  Use when working on app/Providers.tsx, app/DeferredSingletons.tsx, any layout.tsx, any provider file,
  any context that wraps children globally, StoreProvider, or when adding new providers, data-fetching to
  the startup path, or useEffect calls that run on mount in upper-level components. Also use when someone
  references Redux user state, auth checks, isAdmin, isGuest, or fingerprintId on the client side.
---

# Provider & Initialization Rules

These rules govern everything in the upper layers of the app: providers, layouts, shell components,
and anything that runs on every page load. Violations here cost every user on every page.

## Cardinal Rules

1. **Nothing fetches until needed.** No provider, context, or hook may call Supabase, an API, IndexedDB,
   or any async data source on mount. Providers mount as empty shells. Data loading is triggered by the
   consumer that actually needs it.

2. **Nothing runs twice.** If the global provider tree already provides a context, child routes and
   components MUST NOT wrap their own duplicate instance. Use `initialize()` from the existing context,
   never a second `<XProvider>`.

3. **Redux over providers.** Our internal policy is to use Redux for all new state. Context providers
   are legacy. When touching an existing provider, do not expand it — plan its migration to Redux.
   If there is absolutely no alternative and a legacy provider must stay, it still obeys rule 1.

4. **No client-side Supabase auth calls.** User identity is already in Redux. Use selectors. The only
   legitimate Supabase auth access is server-side (Server Components, API routes, `proxy.ts`).

---

## User Identity — Client Side

User state is populated at the server boundary and hydrated into Redux before any client code runs.
**Never** call `supabase.auth.getUser()`, `supabase.auth.getSession()`, or any Supabase auth method
from a client component.

### Selectors (`@/lib/redux/slices/userSlice`)

| Need | Selector | Returns |
|------|----------|---------|
| Is this a logged-in user? | `selectIsAuthenticated` | `boolean` (`!!state.user.id`) |
| Is this an admin? | `selectIsAdmin` | `boolean` |
| Is this a guest (fingerprint only)? | `selectFingerprintId` | `string \| null` — non-null means guest |
| Auth init complete? | `selectAuthReady` | `boolean` — `true` once user OR fingerprint is set |
| User ID | `selectUserId` | `string \| null` |
| Display name | `selectDisplayName` | `string` (derived, memoized) |
| Full context object | `selectUserContext` | `{ user, isAuthenticated, isAdmin }` |

**Guest detection pattern:**

```tsx
const isAuthenticated = useAppSelector(selectIsAuthenticated);
const fingerprintId = useAppSelector(selectFingerprintId);
const isGuest = !isAuthenticated && !!fingerprintId;
```

---

## The Idle Scheduler (`@/utils/idle-scheduler`)

All non-critical initialization is deferred through the IdleScheduler — a module-level singleton
(not React context) that waits for the browser to be truly idle after the page paints.

### Priority Scale

| Priority | When it runs | Use for |
|----------|-------------|---------|
| 1 | First of the deferred batch | Analytics init, critical measurements |
| 2 | High | Preferences sync, service worker registration |
| 3 | Normal | Non-critical UI hydration, 3rd-party widgets |
| 4 | Low | Telemetry, background sync |
| 5 | Absolute last | Broker registration, admin features, speculative prefetch |

### Hooks

```tsx
// Fire-and-forget deferred work (zero re-renders)
useIdleTask(key, priority, callback);

// Gate rendering until idle flush completes (one re-render: false → true)
const ready = useIdleReady();

// Register work AND get notified when done
const { ready } = useIdleGate(key, priority, callback);
```

### Where deferred work lives

| File | Purpose |
|------|---------|
| `app/DeferredSingletons.tsx` | Deferred background logic: broker registration (p5), preferences load (p2), PostHog identify (p3), plus UI singletons gated behind `useIdleReady()` |
| `features/shell/islands/DeferredIslands.tsx` | Heavy layout-level UI chunks (Canvas, Messaging, VoicePad, WindowTray) gated behind `useIdleReady()` |

---

## Provider Rules in Detail

### Empty-Shell Pattern

Every provider in `app/Providers.tsx` MUST mount as a zero-cost shell: create context, set default
state, render children. No `useEffect` that fetches. No realtime subscriptions. No timers.

When data is needed, the provider exposes an idempotent `initialize()` function:

```tsx
// Inside the provider
const [initialized, setInitialized] = useState(false);

const initialize = useCallback(() => {
  if (initialized) return;       // Idempotent — safe to call many times
  setInitialized(true);
  // NOW fetch, subscribe, poll, etc.
}, [initialized]);

// Expose via context value
const value = { ...otherStuff, initialize, initialized };
```

Consumers call `initialize()` on mount when they actually need the data:

```tsx
function TasksPage() {
  const { initialize } = useTaskContext();
  useEffect(() => { initialize(); }, [initialize]);
  // ...
}
```

### No Duplicate Provider Instances

If a provider already exists in the global tree (`app/Providers.tsx`), child components MUST NOT
wrap their own `<XProvider>`. This causes duplicate state, duplicate fetches, and duplicate
realtime channels.

**Wrong:**
```tsx
function MyFeaturePage() {
  return (
    <TaskProvider>        {/* DUPLICATE — already in global tree */}
      <TaskContent />
    </TaskProvider>
  );
}
```

**Right:**
```tsx
function MyFeaturePage() {
  const { initialize } = useTaskContext();
  useEffect(() => { initialize(); }, [initialize]);
  return <TaskContent />;
}
```

### Adding a New Provider (Legacy — Only When Unavoidable)

1. Create it as an empty shell with an `initialize()` method.
2. Add it to `app/Providers.tsx` in the appropriate position.
3. Do NOT add eager `useEffect` calls.
4. Document why Redux was not viable (this should be rare).
5. Add a `// TODO: migrate to Redux` comment at the top of the file.

### Preferred: Adding New State via Redux

1. Create a slice in `lib/redux/slices/` or `features/<name>/redux/`.
2. Add typed selectors (memoized with `createSelector` when derived).
3. If async initialization is needed, use a thunk dispatched via `useIdleTask` in
   `DeferredSingletons.tsx` or triggered by the first consumer that needs the data.

---

## What Belongs Where

| Category | Location | Runs when |
|----------|----------|-----------|
| Redux store creation | `StoreProvider` | Immediately (synchronous, zero network) |
| Theme detection | `ThemeProvider` | Immediately (reads cookie, no network — prevents FOUC) |
| Schema hydration | `SchemaProvider` | Immediately (server-passed data, zero network) |
| Query client creation | `ReactQueryProvider` | Immediately (synchronous, zero network) |
| User preferences load | `DeferredSingletons` | Idle priority 2 |
| Broker registration | `DeferredSingletons` | Idle priority 5 |
| PostHog identify | `DeferredSingletons` | Idle priority 3 |
| Admin debug tools | `DeferredSingletons` → `AdminFeatureProvider` | Idle (rendered after `useIdleReady()`) |
| Heavy layout islands | `DeferredIslands` | After `useIdleReady()` returns true |
| Feature data (tasks, transcripts, files, audio recovery) | Feature consumer calls `initialize()` | When user navigates to or opens that feature |

---

## Checklist Before Merging

- [ ] No `useEffect` in any provider that fetches data, opens subscriptions, or starts timers on mount
- [ ] No duplicate `<XProvider>` wrappers — only the global instance in `app/Providers.tsx`
- [ ] No `supabase.auth.*` calls from client components — use Redux selectors
- [ ] Any new deferred work uses `useIdleTask` / `useIdleReady` with appropriate priority
- [ ] New state uses Redux, not a new context provider (document exceptions)
- [ ] `initialize()` on all lazy providers is idempotent (safe to call N times)
