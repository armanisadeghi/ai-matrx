/**
 * The harness both suites share: a real signed-in admin, a real store client,
 * and the captured waits the server half actually produced.
 *
 * NOTHING HERE IS A MOCK OF THE THING UNDER TEST. The waits in
 * `fixtures/awaiting-approval.captured.json` were produced by
 * `matrx_records.store.RecordStore.field_propose` — the call the deployed
 * `records` tool makes — against the MAIN database, on tables a PERSON
 * declared, in a throwaway store-ON organization on the platform default. The
 * store the card writes into is the same live store, reached through the same
 * doors, as `admin@admin.com`.
 */
import path from "node:path";
import dotenv from "dotenv";

// jsdom gives a DOM and no network. The card is a React component (so the DOM
// is needed) that talks to the real database (so the network is), and jsdom's
// realm carries neither `fetch` nor the web streams `undici` is built on —
// supabase-js dies on "fetch is not defined" before a single door is called.
// Node's own web streams and HTTP client are handed to that realm, in that
// order; nothing about the requests is stubbed.
const realm = globalThis as unknown as Record<string, unknown>;
{
  // jsdom implements no `matchMedia`, and the platform's card shell asks it
  // whether this is a phone. Answering "no" is the desktop card, which is the
  // one these clauses describe.
  // Neither does it implement `ResizeObserver`, which the shell's scroll fade
  // observes with. Nothing these clauses assert depends on a measured size.
  if (typeof realm["ResizeObserver"] !== "function") {
    realm["ResizeObserver"] = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof realm["matchMedia"] !== "function") {
    realm["matchMedia"] = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const streams = require("node:stream/web") as Record<string, unknown>;
  for (const name of [
    "ReadableStream",
    "WritableStream",
    "TransformStream",
    "ByteLengthQueuingStrategy",
    "CountQueuingStrategy",
  ]) {
    if (typeof realm[name] !== "function" && streams[name]) realm[name] = streams[name];
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MessagePort, MessageChannel } = require("node:worker_threads");
  if (typeof realm["MessagePort"] !== "function") realm["MessagePort"] = MessagePort;
  if (typeof realm["MessageChannel"] !== "function") realm["MessageChannel"] = MessageChannel;
  // jsdom's `performance` has no resource-timing hook, and undici calls it on
  // every completed request; without it every real call dies AFTER the network
  // round trip, which reads like a store refusal and is not one.
  const perf = realm["performance"] as Record<string, unknown> | undefined;
  if (perf && typeof perf["markResourceTiming"] !== "function") {
    perf["markResourceTiming"] = () => {};
  }
  if (typeof realm["fetch"] !== "function") {
    // undici keeps its connection pool alive with `setTimeout(...).unref()`,
    // and jsdom's timers return plain numbers, so every real request died on
    // `fastNowTimeout?.unref is not a function` — after the round trip, which
    // reads exactly like a refusal from the store and is not one. Node's timers are
    // installed in this realm for the whole suite — they are the same API with
    // a handle object, and React's own scheduling is happy with either.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeTimers = require("node:timers") as Record<string, unknown>;
    realm["setTimeout"] = nodeTimers["setTimeout"];
    realm["clearTimeout"] = nodeTimers["clearTimeout"];
    realm["setInterval"] = nodeTimers["setInterval"];
    realm["clearInterval"] = nodeTimers["clearInterval"];
    realm["setImmediate"] = nodeTimers["setImmediate"];
    realm["clearImmediate"] = nodeTimers["clearImmediate"];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const undici = require("undici") as Record<string, unknown>;
    realm["fetch"] = undici["fetch"];
    realm["Headers"] = undici["Headers"];
    realm["Request"] = undici["Request"];
    realm["Response"] = undici["Response"];
  }
}

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { setStoreSingleton } from "@/lib/redux/store-singleton";

import captured from "./fixtures/awaiting-approval.captured.json";
import { readRecordChangeWait, type RecordChangeWait } from "../recordChangeApproval";

// `override: true` — jest.setup.ts seeds a fake localhost URL/key so modules
// that build a Supabase client at import do not throw, and it runs first.
dotenv.config({
  path: path.resolve(__dirname, "../../../.env.local"),
  override: true,
});

export const ADMIN_EMAIL = process.env.AI_ADMIN_USERNAME;
export const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD;
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const ORGANIZATION = captured.organization_id as string;

export const canRun = Boolean(
  ADMIN_EMAIL && ADMIN_PASSWORD && SUPABASE_URL?.startsWith("http") && SUPABASE_KEY,
);

export type CapturedCase = "approve" | "decline" | "redTwin";

/** The captured file, addressed by case. The JSON's own inferred type is far
 *  narrower than anything a reader should depend on, so it is read as data. */
const cases = captured as unknown as Record<
  CapturedCase,
  { result: unknown; table_id: string }
>;

/** One captured tool result, read through the module under test. */
export function waitFor(which: CapturedCase): RecordChangeWait {
  const record = cases[which];
  const wait = readRecordChangeWait(record.result);
  if (!wait) {
    throw new Error(
      `the captured ${which} result is not a wait — the fixture or the reader is wrong`,
    );
  }
  return wait;
}

/** The table the captured case names. */
export function tableFor(which: CapturedCase): string {
  return cases[which].table_id;
}

export async function signInAsAdmin(): Promise<{
  supabase: SupabaseClient;
  userId: string;
  store: RecordsClient;
}> {
  const supabase = createSupabaseClient(SUPABASE_URL as string, SUPABASE_KEY as string);
  const signedIn = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL as string,
    password: ADMIN_PASSWORD as string,
  });
  if (signedIn.error || !signedIn.data.user) {
    throw new Error(`could not sign in as admin@admin.com: ${signedIn.error?.message}`);
  }
  const userId = signedIn.data.user.id;
  setStoreSingleton({
    getState: () => ({
      appContext: { organization_id: ORGANIZATION },
      userAuth: { id: userId },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return {
    supabase,
    userId,
    store: createRecordsClient({
      dataSource: recordsDataSource(supabase),
      actor: personActor(userId),
      organizationId: ORGANIZATION,
    }),
  };
}

/** The keys the TABLE itself declares, read back from the live store. */
export async function declaredKeys(store: RecordsClient, tableId: string): Promise<string[]> {
  const read = await store.recordRead({ record_id: tableId });
  if (!read.ok) throw new Error(`reading the table refused: ${read.error.message}`);
  const fields = (read.data.document as Record<string, unknown>)["fields"];
  if (!Array.isArray(fields)) return [];
  return fields
    .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>)["name"] : null))
    .filter((n): n is string => typeof n === "string");
}

/** Does the store hold a Field definition for this key on this table? */
export async function fieldExists(
  store: RecordsClient,
  tableId: string,
  key: string,
): Promise<boolean> {
  const fields = await store.fields({ table_id: tableId });
  if (!fields.ok) throw new Error(`reading the fields refused: ${fields.error.message}`);
  return fields.data.some((f) => f.key === key);
}

/**
 * The captured wait, re-addressed to a table THIS RUN declared.
 *
 * Why not simply use the table the capture names: a suite whose first clause
 * asserts "the column is not there yet" can only pass once, and a test that
 * can only pass once is a test nobody can re-run after a change. The
 * declaration — the part the server built and the part a person approves — is
 * carried whole and byte-for-byte; only the address changes, and it changes to
 * a table declared here by the PERSON, which is the same "already existed"
 * case the policy decided on.
 */
export async function onAFreshTable(
  store: RecordsClient,
  wait: RecordChangeWait,
): Promise<{ wait: RecordChangeWait; tableId: string }> {
  if (wait.change.change !== "field") {
    throw new Error("onAFreshTable is for a column proposal");
  }
  const home = await store.personKernelId();
  if (!home.ok) throw new Error(`personKernelId refused: ${home.error.message}`);
  const homeRecord = await store.recordWrite({
    table_id: home.data,
    data: { name: "ZZZ RELEASE-2 approval-card suite home" },
  });
  if (!homeRecord.ok) throw new Error(`writing the home refused: ${homeRecord.error.message}`);
  const stamp = `${Date.now()}`;
  const declared = await store.tableDeclare({
    spec: {
      name: `ZZZ RELEASE-2 approval-card table ${stamp}`,
      slug: `zzz_release2_card_${stamp}`,
      type: "entity",
      label_singular: "Crew",
      label_plural: "Crews",
      display: "list",
      weight: "light",
      ordered: false,
      row_order: "sorted",
      title_field: "name",
      retention_days: 30,
      agent_writable: true,
      default_sort: [{ field: "name", direction: "asc" }],
      fields: [{ name: "name" }],
    },
    homeId: homeRecord.data,
  });
  if (!declared.ok) throw new Error(`tableDeclare refused: ${declared.error.message}`);
  const tableId = declared.data;
  const field = { ...wait.change, tableId, declaration: { ...wait.change.declaration, entity_definition_id: tableId } };
  return { wait: { ...wait, change: field }, tableId };
}
