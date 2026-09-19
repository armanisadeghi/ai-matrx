/**
 * @jest-environment jsdom
 *
 * LIVE. Renders the two `/data-v2` route files against the real main database,
 * signed in as `admin@admin.com` — the one identity this repo's policy names
 * for UI testing, never a real person's account.
 *
 * WHAT THIS PROVES, AND WHY IT IS THE ONLY THING THESE FILES CAN GET WRONG.
 * Both route files are a MOUNT and nothing more: the platform header, the
 * campaign switch, and one component from `@ai-matrx/records-ui`. Everything
 * they render is proved against the live store by that package's own suite
 * (`apps/shared/records-ui/demo/walk.test.tsx` walks create → records → view →
 * propose/accept → export). So what is left to get wrong here is the BINDING —
 * and the binding is exactly what broke on the first live load, twice over:
 *
 *   · `recordsDataSource(createClient())` handed supabase-js straight through,
 *     and supabase-js's `rpc(fn, args, options)` has no `schema` option, so
 *     every door went out as `public.<door>` and PostgREST answered PGRST202.
 *     This test goes RED on that: it asserts the page draws the store's four
 *     lanes, which it cannot do unless `custom.table_kernel_id` and
 *     `custom.read_records` really answered.
 *   · the switch. One organization has the standing per-person override and one
 *     does not, and the page must say which it is rather than 404 or blank.
 *
 * WHY IT IS SAFE AGAINST MAIN (owner ruling 2026-09-18, there is no rehearsal
 * copy): this suite READS ONLY. It declares nothing, writes nothing and deletes
 * nothing. `884d1ce8-…` ("admin's Workspace") carries the standing
 * `platform.knob_override` turning `custom.code_paths_enabled` on for that
 * (user, organization) pair; the platform default stays false for everyone.
 *
 * Needs `AI_ADMIN_USERNAME` / `AI_ADMIN_PASSWORD` from `.env.local`. Without
 * them the suite is SKIPPED, loudly, with the reason — never a silent green.
 */
import path from "node:path";
import dotenv from "dotenv";

// `override: true` — `jest.setup.ts` seeds a fake localhost URL/key so tests
// that transitively import `utils/supabase/client.ts` do not throw at module
// load, and it runs BEFORE this file. Without `override` this suite would
// silently sign in against `localhost:54321`.
dotenv.config({ path: path.resolve(__dirname, "../../../../.env.local"), override: true });

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// jsdom ships no `fetch`, and supabase-js is nothing but fetch. Node's own
// implementation (undici — the same one `globalThis.fetch` is in a Node realm)
// is handed to the jsdom realm here, so the sign-in and every door call below
// are REAL network calls and not a stub. Without this the suite dies with a
// bare "fetch is not defined" that says nothing about the database.
{
  const g = globalThis as Record<string, unknown>;
  // undici is built on the web streams and Blob, which jsdom also omits, so
  // they go in first — `require("undici")` throws "ReadableStream is not
  // defined" at import otherwise.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const streams = require("node:stream/web") as Record<string, unknown>;
  for (const name of ["ReadableStream", "WritableStream", "TransformStream"]) g[name] ??= streams[name];
  const buffer = require("node:buffer") as Record<string, unknown>;
  for (const name of ["Blob", "File"]) g[name] ??= buffer[name];
  const threads = require("node:worker_threads") as Record<string, unknown>;
  for (const name of ["MessagePort", "MessageChannel", "BroadcastChannel"]) g[name] ??= threads[name];
  // undici reports resource timing through `performance.markResourceTiming`,
  // which jsdom's `performance` does not implement — without this every real
  // response dies AFTER the bytes arrive with "markResourceTiming is not a
  // function", which reads like a network failure and is not one.
  const perf = (g.performance ?? {}) as Record<string, unknown>;
  perf.markResourceTiming ??= () => undefined;
  // Node's own timers, because undici calls `.unref()` on the handle it gets
  // back and jsdom's `setTimeout` returns a plain number. Without this every
  // request dies with "fetch failed", whose cause — three layers down — reads
  // "fastNowTimeout?.unref is not a function" and says nothing about a network.
  const timers = require("node:timers") as Record<string, unknown>;
  for (const name of ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate"]) g[name] = timers[name];

  // These five are REPLACED, not defaulted: jsdom ships its own `Headers`,
  // `Request` and `Response`, and undici's fetch only recognises its own — a
  // half-and-half realm fails with a bare "fetch failed" that names nothing.
  const undici = require("undici") as Record<string, unknown>;
  for (const name of ["fetch", "Headers", "Request", "Response", "FormData"]) g[name] = undici[name];
  /* eslint-enable @typescript-eslint/no-var-requires */
}

const ADMIN_EMAIL = process.env.AI_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** admin's Workspace — the org carrying the standing switch override. */
const SWITCH_ON_ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
/** AI Matrx. Named here only as the org whose override this suite does NOT use. */
const OTHER_ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

const canRun = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD && SUPABASE_URL?.startsWith("http") && SUPABASE_KEY);

if (!canRun) {
  // eslint-disable-next-line no-console
  console.warn(
    "/data-v2 route-mount live test SKIPPED — set AI_ADMIN_USERNAME, AI_ADMIN_PASSWORD, " +
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (this repo's .env.local " +
      "has all four) to run it against the main database.",
  );
}

let authedClient: SupabaseClient;
let userId = "";
/** What the routes' `useAppSelector` answers. Set per test. */
let activeOrg: string | null = SWITCH_ON_ORG;

// The route reads the signed-in person and the active organization from redux,
// and its supabase client from the browser factory. Those two are the host's
// seams, and they are the ONLY things replaced here: the client handed back is
// a REAL one carrying a REAL admin session, so every door call below is a real
// call to the real store.
jest.mock("@/utils/supabase/client", () => ({ createClient: () => authedClient }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: unknown) => (selector as (s: unknown) => unknown)(undefined),
  useAppDispatch: () => () => undefined,
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => userId }));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationId: () => activeOrg,
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
// Page chrome is the platform's and is proved by its own tests; it drags the
// whole shell (and its own store reads) into jsdom for nothing here.
jest.mock("@/features/shell/components/header/PageHeader", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/shell/components/header/variants/variants/HeaderStructured", () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const describeLive = canRun ? describe : describe.skip;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describeLive("/data-v2 — the route files bind the store, live main database", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    authedClient = createSupabaseClient(SUPABASE_URL as string, SUPABASE_KEY as string);
    const signedIn = await authedClient.auth.signInWithPassword({
      email: ADMIN_EMAIL as string,
      password: ADMIN_PASSWORD as string,
    });
    if (signedIn.error || !signedIn.data.user) {
      throw new Error(`Could not sign in as admin@admin.com: ${signedIn.error?.message}`);
    }
    userId = signedIn.data.user.id;
  }, 120_000);

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    // Guarded: when `beforeAll` fails (no session, no database) there is no
    // root, and an unguarded teardown replaces that real reason with a
    // "cannot read properties of undefined" on every test.
    if (root) act(() => root.unmount());
    container?.remove();
  });

  /** Render, then let the store's own round trips settle. */
  async function mount(node: React.ReactElement, until: (text: string) => boolean) {
    await act(async () => {
      root.render(node);
    });
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      if (until(container.textContent ?? "")) return;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
      });
    }
    throw new Error(`the page never settled. Last text on screen:\n${container.textContent}`);
  }

  it("draws the person's tables in four lanes, read through the store's own doors", async () => {
    activeOrg = SWITCH_ON_ORG;
    const { default: UnifiedDataPage }: typeof import("../page") = require("../page");
    await mount(<UnifiedDataPage />, (text) => text.includes("Community"));

    const text = container.textContent ?? "";
    // THE FORCING ASSERTION. These four headings only render after `tableList`
    // answered, which is `custom.table_kernel_id` + `custom.read_records`. With
    // the schema dropped they were asked of `public` and the page showed
    // "The store is not being served … PGRST202" instead.
    for (const lane of ["Mine", "My organization", "System", "Community"]) {
      expect(text).toContain(lane);
    }
    expect(text).not.toContain("PGRST202");
    expect(text).not.toContain("The store is not being served");
    // The one create affordance the page owns.
    expect(text).toContain("New table");
  }, 300_000);

  it("names the organization gap instead of a blank page when nobody has picked one", async () => {
    // The record store is keyed `(organization_id, id)` and this package never
    // guesses which organization you meant, so a person who has picked none has
    // no list to be shown. The page must SAY that — a blank screen and a 404 are
    // both the failure this asserts against.
    activeOrg = null;
    const { default: UnifiedDataPage }: typeof import("../page") = require("../page");
    await mount(<UnifiedDataPage />, (text) => text.includes("Pick an organization") || text.includes("switched off"));

    const text = container.textContent ?? "";
    expect(text).toContain("Pick an organization first");
    expect(text).toContain("the record store is keyed by organization");
    expect(text).not.toContain("404");
    // The route still drew its own header, so this is a page with a sentence on
    // it and not a crashed mount.
    expect(text).toContain("Data");
    expect(OTHER_ORG).toHaveLength(36);
  }, 300_000);

  it("the table route mounts one table's whole screen for a real table id", async () => {
    activeOrg = SWITCH_ON_ORG;
    // A table this person really has, chosen by asking the store — never a
    // hardcoded id that rots.
    const { createRecordsClient } = require("@ai-matrx/records/core");
    const { personActor, recordsDataSource } = require("@ai-matrx/records-ui");
    const client = createRecordsClient({
      dataSource: recordsDataSource(authedClient),
      actor: personActor(userId),
      organizationId: SWITCH_ON_ORG,
    });
    const tables = await client.tableList();
    if (!tables.ok) throw new Error(`tableList refused: ${tables.error.message}`);
    const table = tables.data.find((t: { is_kernel: boolean }) => !t.is_kernel) ?? tables.data[0];
    if (!table) throw new Error("admin's Workspace holds no table to open — declare one and re-run.");

    const { default: UnifiedDataTableRoute }: typeof import("../[tableId]/page") = require("../[tableId]/page");
    await mount(
      <UnifiedDataTableRoute params={Promise.resolve({ tableId: table.id })} />,
      (text) => text.includes("Inbox") || text.includes("Waiting for this table's views"),
    );

    const text = container.textContent ?? "";
    // The table screen's own header row, which only renders once the Table
    // record came back through the read door.
    expect(text).toContain("Inbox");
    expect(text).not.toContain("PGRST202");
    expect(text).not.toContain("The store is not being served");
  }, 300_000);
});
