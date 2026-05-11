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
// module load (e.g. Tools-grid selectors pull in modelRegistrySlice).
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
