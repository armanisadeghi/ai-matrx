/**
 * 🚨 THE ZERO-PREFETCH LAW (Arman, 2026-08-31) — the guard.
 *
 * "If I never get a `__kind` key coming into any of the content I render …
 * there should be absolutely no record of anything related to Content IR
 * having ever been fetched for me or on my behalf. The first time anything
 * should ever even be considered is when we see that `__kind` key."
 *
 * Concretely: a session that never meets a kind SIGNAL — a `__kind` key, a
 * registered detection surface resolving a slug, or a caller-declared
 * expected kind — performs ZERO Content-IR fetches. Not the light catalog,
 * not components, not per-slug reads. Plain JSON fences, markdown, whole
 * pages of content: nothing.
 *
 * WHERE THE DOUBLE SITS (forcing-function audit, 2026-09-10). Every
 * Content-IR read in this app — the kind catalog, per-slug schemas, the
 * component list, per-slug components, detection surfaces — goes through the
 * ONE browser client, `@/utils/supabase/client`. That client is replaced by a
 * RECORDER; the registries, loaders, parser and accumulator all run for real.
 * So the guard is a census of the transport, not of named registry methods:
 * a prefetch introduced through `refresh()`, `refreshKindComponents()`, a
 * direct loader call, or any future path shows up as a recorded client
 * operation. The earlier version spied on four registry methods and stayed
 * green when a prefetch was added through `refresh` (sabotage-proven).
 *
 * Every test gets FRESH modules (the registries are singletons whose warm
 * promise is memoized — a signal test running first would otherwise hide a
 * later kindless prefetch behind that memo).
 *
 * Both halves:
 *  - the live stream path (StreamBlockAccumulator.irOpenRegion), and
 *  - the DB-reload/static path (memoizedRegionEnvelope).
 */

import { chunkText } from "./seeded-random";

interface RecordedCall {
  method: string;
  args: readonly unknown[];
}

/** One client operation chain: `schema(...)` / `from(...)` / `rpc(...)` onward. */
interface RecordedOperation {
  calls: RecordedCall[];
  /** The first production frame that started it — so a red names the culprit. */
  origin: string;
}

const mockOperations: RecordedOperation[] = [];

jest.mock("@/utils/supabase/client", () => {
  // A chainable, awaitable query builder that records every call. Awaiting
  // it answers "no rows" — `maybeSingle()`/`single()` → null, lists → [] with
  // an exact count of 0, so readAllRows completes honestly.
  function chain(operation: RecordedOperation): object {
    const proxy: object = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            const single = operation.calls.some(
              (c) => c.method === "maybeSingle" || c.method === "single",
            );
            return (resolve: (value: unknown) => void) =>
              resolve({ data: single ? null : [], error: null, count: 0 });
          }
          return (...args: unknown[]) => {
            operation.calls.push({ method: String(prop), args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  }
  const client = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return undefined;
        return (...args: unknown[]) => {
          const frames = (new Error().stack ?? "").split("\n").slice(1);
          const origin =
            frames.find(
              (f) =>
                !f.includes("node_modules") &&
                !f.includes("zero-prefetch-law.test") &&
                f.includes("/matrx-frontend/"),
            ) ?? "(no repo frame)";
          const operation: RecordedOperation = {
            calls: [{ method: String(prop), args }],
            origin: origin.trim(),
          };
          mockOperations.push(operation);
          return chain(operation);
        };
      },
    },
  );
  return { supabase: client, createClient: () => client };
});

/** `schema(content_ir).from(kind_definition).select(id, kind).eq(kind,x)…` */
function describeOperation(operation: RecordedOperation): string {
  const chainText = operation.calls
    .map((c) => `${c.method}(${c.args.map((a) => String(a)).join(",")})`)
    .join(".");
  return `${chainText}  [from ${operation.origin}]`;
}

function recorded(): string[] {
  return mockOperations.map(describeOperation);
}

/**
 * Absence cannot be awaited as a condition. Every fetch path here is a pure
 * promise chain (dynamic `import()` of the client + awaits), so a single
 * macrotask turn drains it completely; five turns is a wide margin. The
 * planted prefetch mutations in the audit report prove this window catches a
 * fire-and-forget fetch.
 */
async function settleFireAndForgetWork(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function waitForRead(
  predicate: (operation: string) => boolean,
  what: string,
): Promise<void> {
  for (let turn = 0; turn < 50; turn += 1) {
    if (recorded().some(predicate)) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(
    `never observed ${what}; recorded client operations:\n${recorded().join("\n") || "(none)"}`,
  );
}

async function loadPipeline() {
  const { StreamBlockAccumulator } = await import(
    "@/features/agents/redux/execution-system/utils/stream-block-accumulator"
  );
  const { memoizedRegionEnvelope } = await import(
    "../registry/region-envelope-memo"
  );
  const { kindRegistry } = await import("../registry/kind-registry");
  const { componentRegistry } = await import(
    "../registry/component-registry"
  );
  // Module initialization is not the law's subject; only what rendering
  // content does afterwards is.
  await settleFireAndForgetWork();
  mockOperations.length = 0;

  function runAccumulator(document: string): void {
    const dispatch = (action: unknown) => action;
    const accumulator = new StreamBlockAccumulator(
      "req_zero_prefetch",
      (p) => ({ type: "test/upsert", payload: p }),
    );
    for (const chunk of chunkText(document, 13, 7)) {
      accumulator.ingest(chunk, dispatch);
    }
    accumulator.finalize(dispatch);
  }

  return {
    runAccumulator,
    memoizedRegionEnvelope,
    kindRegistry,
    componentRegistry,
  };
}

// A DB-only slug (no compiled schema, no compiled component), so the signal
// path must reach BOTH per-slug reads rather than short-circuit on the floor.
const SIGNAL_KIND = "zero_prefetch_signal_kind";

const isContentIr = (op: string) => op.startsWith("schema(content_ir)");
const perSlugSchemaRead = (op: string) =>
  isContentIr(op) &&
  op.includes("from(kind_definition)") &&
  op.includes(`eq(kind,${SIGNAL_KIND})`) &&
  op.includes("limit(2)");
const perSlugComponentLookup = (op: string) =>
  isContentIr(op) &&
  op.includes("from(kind_definition)") &&
  op.includes(`eq(kind,${SIGNAL_KIND})`) &&
  op.includes("maybeSingle()");
const lightCatalogRead = (op: string) =>
  isContentIr(op) &&
  op.includes("from(kind_definition)") &&
  op.includes("loading_component:metadata->>loading_component");

beforeEach(() => {
  jest.resetModules();
  mockOperations.length = 0;
});

describe("THE ZERO-PREFETCH LAW — live stream (accumulator)", () => {
  it("a kindless JSON fence performs no client read and demands nothing", async () => {
    const p = await loadPipeline();
    p.runAccumulator(
      'Here is plain data:\n\n```json\n{"hello": 1, "items": [1, 2, 3]}\n```\n\nDone.\n',
    );
    await settleFireAndForgetWork();

    expect(recorded()).toEqual([]);
    expect(p.kindRegistry.hasBeenDemanded()).toBe(false);
    expect(p.componentRegistry.hasBeenDemanded()).toBe(false);
  });

  it("a kindless code fence and XML region perform no client read (no surface warm)", async () => {
    const p = await loadPipeline();
    p.runAccumulator(
      "Some code:\n\n```python\nprint('hi')\n```\n\n<notes>\nremember this\n</notes>\n\nDone.\n",
    );
    await settleFireAndForgetWork();

    expect(recorded()).toEqual([]);
    expect(p.kindRegistry.hasBeenDemanded()).toBe(false);
  });

  it("prose and markdown with no structure perform no client read", async () => {
    const p = await loadPipeline();
    p.runAccumulator(
      "# A heading\n\nJust text, a list:\n\n- one\n- two\n\nAnd a `code span`.\n",
    );
    await settleFireAndForgetWork();

    expect(recorded()).toEqual([]);
    expect(p.kindRegistry.hasBeenDemanded()).toBe(false);
    expect(p.componentRegistry.hasBeenDemanded()).toBe(false);
  });

  it("a __kind signal fires the per-slug schema read AND the per-slug component lookup", async () => {
    const p = await loadPipeline();
    p.runAccumulator(
      `\`\`\`json\n{"__kind": "${SIGNAL_KIND}", "title": "T", "items": [1]}\n\`\`\`\n`,
    );

    await waitForRead(perSlugSchemaRead, `the per-slug schema read for ${SIGNAL_KIND}`);
    await waitForRead(
      perSlugComponentLookup,
      `the per-slug component lookup for ${SIGNAL_KIND}`,
    );
    await waitForRead(lightCatalogRead, "the light kind catalog read");
    // Once a signal exists, a completed region may merge DB detection
    // surfaces — the warm is deferred, never removed.
    await waitForRead(
      (op) => isContentIr(op) && op.includes("from(kind_surface)"),
      "the detection-surface warm after a kind signal",
    );
    expect(p.kindRegistry.hasBeenDemanded()).toBe(true);
    expect(p.componentRegistry.hasBeenDemanded()).toBe(true);
  });
});

describe("THE ZERO-PREFETCH LAW — DB reload / static split (region memo)", () => {
  it("a kindless complete JSON object performs no client read", async () => {
    const p = await loadPipeline();
    const envelope = p.memoizedRegionEnvelope('{"plain": true, "n": 42}');
    await settleFireAndForgetWork();

    expect(envelope?.root.kind).toBe("");
    expect(recorded()).toEqual([]);
    expect(p.kindRegistry.hasBeenDemanded()).toBe(false);
    expect(p.componentRegistry.hasBeenDemanded()).toBe(false);
  });

  it("a __kind object fires the per-slug schema read and the warm", async () => {
    const p = await loadPipeline();
    const envelope = p.memoizedRegionEnvelope(
      `{"__kind": "${SIGNAL_KIND}", "title": "T", "items": []}`,
    );

    expect(envelope?.root.kind).toBe(SIGNAL_KIND);
    await waitForRead(perSlugSchemaRead, `the per-slug schema read for ${SIGNAL_KIND}`);
    await waitForRead(lightCatalogRead, "the light kind catalog read");
    expect(p.componentRegistry.hasBeenDemanded()).toBe(true);
  });
});
