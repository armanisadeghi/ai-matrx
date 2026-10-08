/**
 * jest.setup.ts — polyfills applied before every test in the jsdom env.
 *
 * Why structuredClone? Dexie (warm-cache persistence tier) uses
 * `structuredClone` to clone values before storing them in IndexedDB. Modern
 * Node (17+) has it as a global, and real browsers have it, but the jsdom
 * test environment scrubs it off the test-local `globalThis`. Polyfilling
 * back to the Node global here so the Dexie wrapper runs unmodified.
 */

// Dummy Supabase env vars so `utils/supabase/client.ts` doesn't throw when
// tests transitively import code that instantiates the browser client at
// module load (e.g. Tools-grid selectors pull in chat's store slices).
// Tests never hit real Supabase — mocks or fake-indexeddb stand in.
//
// Only the new sb_publishable_* env var is seeded here. The legacy
// NEXT_PUBLIC_SUPABASE_ANON_KEY is DEPRECATED and BANNED in this repo —
// see https://supabase.com/docs/guides/getting-started/api-keys
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
}
if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
}

if (
  typeof (globalThis as { structuredClone?: unknown }).structuredClone !==
  "function"
) {
  // Node ≥17 ships a global `structuredClone`, but jsdom strips it from the
  // test-local `globalThis`. `v8.deserialize(v8.serialize(v))` gives us the
  // same semantics (HTML-structured-clone algorithm) without depending on
  // whatever node version is running — and is what Node's own polyfill does.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const v8 = require("node:v8") as {
    deserialize: (buf: Buffer) => unknown;
    serialize: (v: unknown) => Buffer;
  };
  (globalThis as { structuredClone?: <T>(v: T) => T }).structuredClone = <T>(
    v: T,
  ): T => v8.deserialize(v8.serialize(v)) as T;
}

/**
 * ── Immer MapSet: every test store behaves like the real store ───────────────
 *
 * `lib/redux/store.ts` calls `enableMapSet()`, so production reducers may read
 * `Map`/`Set` state inside drafts (the notes slice's `_dirtyFields` does). A test
 * that builds its own store without it throws INSIDE the reducer, and a caller
 * that catches the error reports a plain failure — on 2026-09-15 the War Room
 * rename test returned `false` for a rename that works in the app. Enabling it
 * once here makes that divergence impossible; the per-file calls that predate
 * this line are harmless (the plugin is idempotent).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
(require("immer") as { enableMapSet: () => void }).enableMapSet();

/**
 * ── TextEncoder / TextDecoder ────────────────────────────────────────────────
 *
 * Node has had both as globals since 11; jsdom's test-local `globalThis` does
 * not, exactly as with `structuredClone` above. Any module that reaches for one
 * at IMPORT time therefore dies before a single test runs — `@ai-matrx/meet`'s
 * published bundle does (its base64/crypto helpers), which took down the whole
 * suite that renders `<MeetHost>` over the real package. Node's own
 * implementations are the honest answer; nothing here is a stub.
 */
if (typeof (globalThis as { TextEncoder?: unknown }).TextEncoder === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const util = require("node:util") as {
    TextEncoder: typeof globalThis.TextEncoder;
    TextDecoder: typeof globalThis.TextDecoder;
  };
  Object.assign(globalThis, {
    TextEncoder: util.TextEncoder,
    TextDecoder: util.TextDecoder,
  });
}

/**
 * ── The WHATWG streams ───────────────────────────────────────────────────────
 *
 * Same class as `TextEncoder` above, one layer out: Node has had
 * `ReadableStream` / `WritableStream` / `TransformStream` as globals since 18,
 * jsdom's test-local `globalThis` carries none of them, and a package that
 * reaches for one at IMPORT time dies before a single test is collected.
 * `@zip.js/zip.js` does exactly that (`new TransformStream()` while building
 * its codec at module scope), so importing anything that can read a zip — the
 * vault's CSV-archive import, and therefore `VaultWorkspace` — took a whole
 * suite down with `ReferenceError: TransformStream is not defined`.
 *
 * `node:stream/web` ships the real WHATWG implementations. Nothing here is a
 * stub: a test that pipes bytes through one gets the same semantics a browser
 * gives it.
 */
if (
  typeof (globalThis as { TransformStream?: unknown }).TransformStream ===
  "undefined"
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const webStreams = require("node:stream/web") as {
    ReadableStream: typeof globalThis.ReadableStream;
    WritableStream: typeof globalThis.WritableStream;
    TransformStream: typeof globalThis.TransformStream;
  };
  for (const name of [
    "ReadableStream",
    "WritableStream",
    "TransformStream",
  ] as const) {
    if (typeof (globalThis as Record<string, unknown>)[name] === "undefined") {
      (globalThis as Record<string, unknown>)[name] = webStreams[name];
    }
  }
}

/**
 * ── fetch / Request / Response / Headers ─────────────────────────────────────
 *
 * Same class again: Node has had the Fetch API as globals since 18, jsdom's
 * test-local `globalThis` carries none of it, and a module that touches one at
 * IMPORT time takes the whole suite down before a test is collected. `next/cache`
 * does (next/dist/server/web/spec-extension/adapters/next-request.js subclasses
 * `Request`), so any client component that imports a server action pulled it
 * in and twelve rich-document suites died with `ReferenceError: Request is not
 * defined` (2026-09-27, the search-engine-indexed switch).
 *
 * These are Node's OWN implementations, read from Node's real global through
 * `vm.runInThisContext` — the outer context, not jsdom's — so there is no new
 * dependency and nothing is a stub. It runs for every environment, including
 * files that pin `@jest-environment jsdom` in a docblock.
 */
{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeGlobal = (require("node:vm") as typeof import("node:vm")).runInThisContext("globalThis") as Record<string, unknown>;
  for (const name of ["fetch", "Request", "Response", "Headers"] as const) {
    if (typeof (globalThis as Record<string, unknown>)[name] === "undefined" && nodeGlobal[name] !== undefined) {
      (globalThis as Record<string, unknown>)[name] = nodeGlobal[name];
    }
  }
}

/**
 * ── THE TOP-LAYER PSEUDO-CLASSES ARE ANSWERED HERE, NOT BY nwsapi ────────────
 *
 * MEASURED, not guessed: opening ONE Radix popover (`ColumnHeaderCell`'s
 * sort/filter menu) took 12–17 SECONDS in this environment and blew every
 * 5s test timeout. A CPU profile put ~90% of the time inside nwsapi's
 * selector engine, and counting `Element.matches` calls showed the shape of
 * it: 32k calls for `:modal` produced **37 MILLION** calls for `:fullscreen`.
 *
 * The cause is a recursion, in nwsapi 2.2.27 (jsdom 30's engine). jsdom has
 * no native selector engine, so `Element.matches` IS nwsapi — and nwsapi's
 * `isModal()`/`isFullscreen()` ask for the "native" state by calling
 * `node.matches(':modal')` / `node.matches(':fullscreen')`, which re-enters
 * nwsapi and asks again, exponentially. @floating-ui's `isTopLayer()` calls
 * `matches(':modal')` and `matches(':popover-open')` on every element it
 * positions, so every popper, dropdown, select, tooltip and context menu in
 * the repo pays that cost.
 *
 * Answering the three top-layer pseudo-classes directly is not a stub of
 * anything the DOM would otherwise tell us: jsdom implements NO top layer —
 * no fullscreen element, no `showModal()` top-layer state, no popover
 * showing state — so `false` is the honest answer for all three, and it is
 * the same answer nwsapi is trying (and failing) to compute. Every other
 * selector still goes to the real engine.
 *
 * Effect on the measured case: 12,107ms → 61ms.
 *
 * Guarded on `Element` existing: this setup file also runs for every
 * `@jest-environment node` suite, where there is no DOM at all and touching
 * `Element.prototype` throws before a single test can be collected.
 */
if (typeof Element !== "undefined") {
  const TOP_LAYER_PSEUDO = /^\s*:(modal|fullscreen|popover-open)\s*$/;
  const nativeMatches = Element.prototype.matches;
  // `defineProperty` rather than assignment: `Element.prototype.matches` is
  // declared as overloaded TYPE PREDICATES (`selectors: K` narrows `this`), and
  // a plain `(selectors: string) => boolean` cannot be assigned to it without a
  // cast. The descriptor keeps the runtime shape identical and the types honest.
  Object.defineProperty(Element.prototype, "matches", {
    configurable: true,
    writable: true,
    value: function (this: Element, selectors: string): boolean {
      if (typeof selectors === "string" && TOP_LAYER_PSEUDO.test(selectors)) {
        return false;
      }
      return nativeMatches.call(this, selectors);
    },
  });
}

/**
 * ── window.matchMedia: jsdom has none; every browser does ────────────────────
 *
 * jsdom implements no `matchMedia`, so any component that reads a media query
 * (`useIsMobile` → `ContextMenuV3`, the panels, the tables) died with
 * "window.matchMedia is not a function" — 2026-09-26 the model context panel's
 * organization suite, the day ContextMenuV3 adopted `useIsMobile`. 73 suites had
 * each hand-stubbed it; the next component to read a query broke the rest.
 *
 * The answer is the one a browser at jsdom's viewport gives: width queries
 * (`min-width` / `max-width`, px, joined by `and`) are evaluated against
 * `window.innerWidth` (1024 in jsdom — a desktop), everything else
 * (`prefers-color-scheme: dark`, `prefers-reduced-motion`, `hover`) does not
 * match. Defined configurable + writable and only when absent, so a suite that
 * sets its own (a phone, a dark scheme) still wins and restores cleanly.
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  const widthQueryMatches = (query: string): boolean => {
    const parts = query.toLowerCase().split(/\s+and\s+/);
    let sawWidth = false;
    for (const part of parts) {
      const m = /\(\s*(min|max)-width\s*:\s*([\d.]+)px\s*\)/.exec(part);
      if (!m) return false;
      sawWidth = true;
      const px = Number(m[2]);
      if (m[1] === "min" ? window.innerWidth < px : window.innerWidth > px) return false;
    }
    return sawWidth;
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: widthQueryMatches(query),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}

/**
 * ── CSS.escape: jsdom has no `CSS` global; every browser does ────────────────
 *
 * `WindowPanel` builds `[data-window-id="${CSS.escape(id)}"]` to announce the
 * front-most layer (ARE-010); under jsdom that threw "CSS is not defined" and
 * every suite that mounts a window died (2026-09-26: windowPanelMinimize, the
 * window-header title suite). This is the CSSOM spec's serialize-an-identifier
 * algorithm, so a selector built here matches exactly what a browser builds.
 * Defined only when absent, so a suite with its own `CSS` still wins.
 */
if (typeof globalThis.CSS === "undefined" || typeof globalThis.CSS?.escape !== "function") {
  const cssEscape = (value: string): string => {
    const string = String(value);
    const length = string.length;
    const first = string.charCodeAt(0);
    let out = "";
    for (let i = 0; i < length; i++) {
      const code = string.charCodeAt(i);
      if (code === 0x0000) {
        out += "�";
      } else if (
        (code >= 0x0001 && code <= 0x001f) ||
        code === 0x007f ||
        (i === 0 && code >= 0x0030 && code <= 0x0039) ||
        (i === 1 && code >= 0x0030 && code <= 0x0039 && first === 0x002d)
      ) {
        out += `\\${code.toString(16)} `;
      } else if (i === 0 && length === 1 && code === 0x002d) {
        out += `\\${string.charAt(i)}`;
      } else if (
        code >= 0x0080 ||
        code === 0x002d ||
        code === 0x005f ||
        (code >= 0x0030 && code <= 0x0039) ||
        (code >= 0x0041 && code <= 0x005a) ||
        (code >= 0x0061 && code <= 0x007a)
      ) {
        out += string.charAt(i);
      } else {
        out += `\\${string.charAt(i)}`;
      }
    }
    return out;
  };
  const existing = (globalThis as { CSS?: object }).CSS ?? {};
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    writable: true,
    value: { ...existing, escape: cssEscape },
  });
}

/**
 * THE APP'S SURFACE MANIFESTS, REGISTERED WITH `@ai-matrx/chat` AS THE APP DOES
 * AT STARTUP (P19, `providers/chat-surface-manifests.ts`). Lazy: the registry
 * (every manifest) loads only when package code first looks a surface up, and
 * through the test's own module registry — so a test that `jest.mock`s
 * `@/features/surfaces/manifests/registry` still hands the package its mock,
 * exactly as before the package stopped importing the registry. A test that
 * mocks `@ai-matrx/chat/surfaces/runtime/registry` itself never reaches this.
 */
{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const seam = require("@ai-matrx/chat/surfaces/runtime/registry") as typeof import("@ai-matrx/chat/surfaces/runtime/registry");
  const app = () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/features/surfaces/manifests/registry") as typeof import("@/features/surfaces/manifests/registry");
  seam.registerSurfaceManifests({
    getManifest: (surfaceName) => app().getManifest(surfaceName),
    getAllManifests: () => app().getAllManifests(),
    getRawManifest: (surfaceName) => app().getRawManifest(surfaceName),
    getSurfaceAncestry: (surfaceName) => app().getSurfaceAncestry(surfaceName),
    getSurfaceChildren: (surfaceName) => app().getSurfaceChildren(surfaceName),
    getSurfaceSection: (surfaceName) =>
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/features/surfaces/manifests/surface-section") as typeof import("@/features/surfaces/manifests/surface-section")).getSurfaceSection(surfaceName),
  });
}

/**
 * FEATURE INTELLIGENCE, REGISTERED WITH `@ai-matrx/chat` AS THE APP DOES AT
 * STARTUP (P19, `providers/ChatSurfaceRegistrations.tsx`). Lazy and through the
 * test's module registry, like the manifests above, so a test mocking an app
 * feature-intelligence module still hands the package its mock.
 */
{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const seam = require("@ai-matrx/chat/surfaces/runtime/intelligence") as typeof import("@ai-matrx/chat/surfaces/runtime/intelligence");
  /* eslint-disable @typescript-eslint/no-require-imports */
  const indicator = () =>
    require("@/features/mandates/feature-intelligence/IntelligenceIndicator") as typeof import("@/features/mandates/feature-intelligence/IntelligenceIndicator");
  const doors = () =>
    require("@/features/mandates/feature-intelligence/page-intelligence-doors") as typeof import("@/features/mandates/feature-intelligence/page-intelligence-doors");
  const places = () =>
    require("@/features/mandates/feature-intelligence/registry") as typeof import("@/features/mandates/feature-intelligence/registry");
  const hrefs = () =>
    require("@/features/mandates/feature-intelligence/hrefs") as typeof import("@/features/mandates/feature-intelligence/hrefs");
  const placement = () =>
    require("@/features/mandates/feature-intelligence/placement") as typeof import("@/features/mandates/feature-intelligence/placement");
  const react = require("react") as typeof import("react");
  /* eslint-enable @typescript-eslint/no-require-imports */
  seam.registerSurfaceIntelligence({
    Indicator: (props) => react.createElement(indicator().IntelligenceIndicator, props),
    declaredKeysForRoute: (pathname) => indicator().declaredKeysForRoute(pathname),
    usePageIntelligenceDoors: () => doors().usePageIntelligenceDoors(),
    declaredPlacesFor: (feature) => places().declaredPlacesFor(feature),
    featureIntelligenceHref: (feature, options) => hrefs().featureIntelligenceHref(feature, options),
    targetForKey: (mandateKey) => placement().targetForKey(mandateKey),
  });
}

/**
 * THE APP'S CONTEXT SOURCES (scopes) AND COMPUTE TARGETS, REGISTERED WITH
 * `@ai-matrx/chat` AS THE APP DOES AT STARTUP (P21, `providers/chatContextSources.ts`).
 * Every export resolves lazily, per read, through the test's own module registry — so a
 * test that `jest.mock`s an app scopes/sandbox module still hands the package its mock,
 * and a test that never reads a scope never loads the scopes feature.
 */
{
  /* eslint-disable @typescript-eslint/no-require-imports */
  const lazy = (map: Record<string, string[]>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [modulePath, names] of Object.entries(map)) {
      for (const name of names) {
        const [exportName, registeredAs] = name.split(":");
        Object.defineProperty(out, registeredAs ?? exportName, {
          enumerable: true,
          get: () => (require(modulePath) as Record<string, unknown>)[exportName],
        });
      }
    }
    return out;
  };
  const scopesSeam = require("@ai-matrx/chat/context/sources/scopes") as typeof import("@ai-matrx/chat/context/sources/scopes");
  const computeSeam = require("@ai-matrx/chat/compute/targets") as typeof import("@ai-matrx/chat/compute/targets");
  const syncConversationScopes = (conversationId: string) => async (dispatch: (a: unknown) => unknown) => {
    const mod = require("@/features/scopes/redux/thunks/syncConversationScopes") as typeof import("@/features/scopes/redux/thunks/syncConversationScopes");
    await dispatch(mod.syncConversationScopes(conversationId));
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
  // THE APP'S ERROR UI SLOTS, registered as `providers/chatUiRegistration.ts` does at runtime.
  // Wrapped (never read at registration — Object.assign would load the real component now),
  // so a package component that draws ErrorAlchemyMenu/ErrorNotice shows the app's, not the
  // "is not set up here" stand-in.
  {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const uiSeam = require("@ai-matrx/chat/host/ui-slots") as typeof import("@ai-matrx/chat/host/ui-slots");
    const reactForUi = require("react") as typeof import("react");
    const slot = (modulePath: string, exportName: string) => (props: object) =>
      reactForUi.createElement(
        (require(modulePath) as Record<string, React.ComponentType<object>>)[exportName],
        props,
      );
    /* eslint-enable @typescript-eslint/no-require-imports */
    uiSeam.registerChatUi({
      ErrorAlchemyMenu: slot("@/components/errors/ErrorAlchemyMenu", "ErrorAlchemyMenu"),
      ErrorNotice: slot("@/components/errors/ErrorNotice", "ErrorNotice"),
      // Package cards (RunFailureCard, ...) print the server's sentence through these two slots.
      TextWithDoors: slot("@/components/official/entity-ref/TextWithDoors", "TextWithDoors"),
      ServerNotes: slot("@/components/official/ServerNotes", "ServerNotes"),
      // Function slots the package calls through (read lazily, so a test's own mock of the catalogue wins).
      /* eslint-disable @typescript-eslint/no-require-imports */
      peekMandateCatalogueEntry: (...args: unknown[]) =>
        (require("@/features/mandates/catalogue").peekMandateCatalogueEntry as (...a: unknown[]) => unknown)(...args),
      invalidateMandateCatalogueCache: () => require("@/features/mandates/catalogue").invalidateMandateCatalogueCache(),
      /* eslint-enable @typescript-eslint/no-require-imports */
    });
  }
  const scopes = lazy({
      "@/features/scopes/redux/selectors/active-context": [
        "selectActiveOrganizationId", "selectActiveOrganizationName", "selectActiveProjectId",
        "selectActiveTaskId", "selectActiveScopeIds", "selectActiveScopeIdsByType", "selectHasActiveContext",
      ],
      "@/lib/redux/slices/appContextSlice": [
        "selectScopeSelectionsContext", "selectActiveScopeTypeIds", "selectProjectId", "selectTaskId",
        "selectProjectName", "selectTaskName", "selectAppContext", "addActiveScope", "removeActiveScope",
      ],
      "@/features/scopes/redux/selectors/admin": ["selectScopeById", "selectScopesByType", "selectScopesLoadedForType"],
      "@/features/scopes/redux/selectors/resolved-context": ["makeSelectResolvedContext"],
      "@/features/scopes/redux/selectors/tree": ["makeSelectScopeTypeLabelMapForOrg"],
      "@/features/scopes/redux/contextItemCatalog": ["listScopeTypeItems", "selectAllContextItems", "selectLoadedCatalogTypeIds"],
      "@/features/agent-context/redux/tasksSlice": ["selectTaskById"],
      "@/features/scopes/redux/scopeContextView": ["setScopeContextValue"],
      "@/features/scopes/redux/thunks/ensureContextValues": ["ensureContextValues"],
      "@/features/scopes/redux/thunks/ensureScopeTree": ["ensureScopeTree"],
      "@/features/scopes/redux/thunks/conversationScopeGate": ["ensureConversationScopesOrAsk"],
      "@/features/scopes/hooks/useScopeTree": ["useScopeTree"],
      "@/features/scopes/hooks/useContextValues": ["useContextValues"],
      "@/features/scopes/components/active-context/quick-pick/engine": ["drillPathForScope", "useDrillPathEngine", "useUniverse"],
      "@/features/scopes/service/scopesService": ["scopesService"],
      "@/features/scopes/service/associationsService": ["associationsService"],
      "@/features/scopes/service/favoritesService": ["favoritesService"],
      "@/features/scopes/host/associationsStore": ["getAssociationsStore"],
      "@/features/scopes/service/favoriteOverlay": ["readFavoriteIds", "writeFavorite"],
      "@/features/scopes/registry/entityRegistry": ["resolveEntityToken", "tryGetEntityInfo"],
      "@/features/scopes/service/entityTitles": ["entityTitleFallback", "fetchEntityTitles", "getCachedEntityTitle"],
      "@/features/scopes/utils/referenceCell": ["referenceConfigFromItem"],
      "@/features/scopes/utils/scopeValuePayload": ["buildScopeValuePayload"],
      "@/features/scopes/utils/slugify": ["slugifyKey"],
      "@/features/scopes/components/active-context/ActiveContextLensChip": ["ActiveContextLensChip"],
      "@/features/scopes/components/active-context/ActiveContextTree": ["ActiveContextTree"],
      "@/features/scopes/components/active-context/miller-columns/MillerColumns": ["MillerColumnsCore"],
      "@/features/scopes/components/reference/ContextValueInput": ["ContextValueInput"],
      "@/features/scopes/components/reference/ContextValueRow": ["ContextValueRow"],
  });
  // Never spread `scopes`: a spread reads every getter now, before a test's mocks exist.
  scopes.syncConversationScopes = syncConversationScopes;
  scopesSeam.registerChatScopes(scopes as Parameters<typeof scopesSeam.registerChatScopes>[0]);
  computeSeam.registerChatComputeTargets(
    lazy({
      "@/lib/sandbox/active-binding": [
        "getEffectiveSandboxRef", "resolveAgentSandboxRef", "getConversationSandboxBinding", "getSurfaceSeedRef",
        "getActiveSandboxBinding", "resolveSandboxRefDetails", "clearSandboxBindingCache",
      ],
      "@/lib/sandbox/binding-scope": ["resolveBindingScope"],
      "@/lib/sandbox/bound-target-view": ["describeBoundTargetState", "resolveBoundTargetView"],
      "@/lib/sandbox/conversation-binding-row": ["conversationSandboxBindingFromRow"],
      "@/lib/sandbox/format": ["sandboxDisplayName", "splitIdentifyingName"],
      "@/lib/sandbox/sandbox-defaults": ["resolveSandboxCreateDefaults"],
      "@/lib/sandbox/status": ["ACTIVE_EFFECTIVE_STATUSES", "getEffectiveStatus", "STATUS_LABELS", "statusPillClasses"],
      "@/hooks/sandbox/use-compute-targets": ["useComputeTargets"],
      "@/hooks/sandbox/use-sandbox": ["useSandboxInstances"],
      "@/hooks/sandbox/use-verified-binding": ["useVerifiedSandboxBinding"],
      "@/components/dialogs/sandbox-gate/SandboxGateHost": ["openSandboxGate"],
      "@/features/code/views/sandboxes/CloneRepoDialog": ["CloneRepoDialog"],
      "@/features/code/views/sandboxes/SandboxDiagnosticsPanel": ["SandboxDiagnosticsPanel"],
    }) as Parameters<typeof computeSeam.registerChatComputeTargets>[0],
  );
}

/**
 * ── ResizeObserver: jsdom has none ───────────────────────────────────────────
 * Components that observe their own size (menu scroll fades, composer heights)
 * die on `ResizeObserver is not defined`. A no-op stub, applied only where jsdom
 * left it missing, so suites that install their own keep theirs.
 */
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/**
 * ── The files engine host (@ai-matrx/media/files/engine) ─────────────────────
 * The app wires it in `features/files/files-host.ts`, imported by the store
 * module. Here every member is required at CALL time, so a suite's
 * `jest.mock("@/lib/python-client")` (or supabase client, toast, share links,
 * store singleton) is what the engine calls — exactly as when the engine lived
 * in the app.
 */
{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  // The host port module alone — never the front door, which would load the
  // whole engine here, before any suite's jest.mock of an engine module.
  const { configureFilesHost } = require("@ai-matrx/media/files/engine/host/configure") as typeof import("@ai-matrx/media/files/engine/host/configure");
  const lazy = <T extends object>(spec: string): T =>
    new Proxy({} as T, {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      get: (_target, key) => (require(spec) as Record<PropertyKey, unknown>)[key],
    });
  configureFilesHost({
    get db() {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("@/utils/supabase/client").supabase;
    },
    server: lazy("@/lib/python-client"),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    store: () => require("@/lib/redux/store-singleton").getStoreSingleton(),
    scope: (state) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ctx = require("@/lib/redux/slices/appContextSlice");
      const s = state as { userAuth?: { id?: string | null }; appContext?: unknown } | null | undefined;
      const has = Boolean(s?.appContext);
      return {
        userId: s?.userAuth?.id ?? null,
        organizationId: has ? ctx.selectOrganizationId(s) : null,
        projectId: has ? ctx.selectProjectId(s) : null,
        taskId: has ? ctx.selectTaskId(s) : null,
      };
    },
    ensureOrganizationContext: (options) =>
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/lib/organization/organization-gate").ensureOrganizationContext(options),
    shareLinks: lazy("@/utils/permissions/shareLinks"),
    notify: {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      success: (message, options) => require("@/lib/toast").toast.success(message, options),
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      error: (message, options) => require("@/lib/toast").toast.error(message, options),
    },
  });
}
