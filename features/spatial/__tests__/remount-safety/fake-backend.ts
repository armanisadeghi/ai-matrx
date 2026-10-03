/**
 * The service boundary for the remount-safety suite: a recording Supabase
 * client and a recording `fetch`.
 *
 * Every board item reads and writes through ONE Supabase client
 * (`@/utils/supabase/client`) and the Python server through `fetch`. The suite
 * replaces exactly those two doors — nothing a component owns — and keeps a
 * ledger of every call, so a case can ask "what did waking or remounting this
 * tile do to the network?". Rows come from the case's fixture tables (`seed`),
 * filtered by the query's equality filters, so a component gets back what the
 * real database would answer for its record.
 *
 * Used from inside `jest.mock` factories, so it imports nothing at module
 * level that a factory could not reach.
 */

export type Op = "select" | "insert" | "update" | "upsert" | "delete" | "rpc";

export interface BackendCall {
  door: "db" | "rpc" | "fetch" | "channel" | "storage";
  /** `schema.table` for db calls, the function name for rpc, the URL for fetch, the channel name. */
  target: string;
  op: Op | "subscribe" | "unsubscribe" | string;
  filters: Array<[string, unknown[]]>;
  payload?: unknown;
}

type Row = Record<string, unknown>;
type RpcAnswer = unknown | ((args: Record<string, unknown> | undefined) => unknown);
type FetchAnswer = (url: string, init?: RequestInit) => unknown;

interface BackendState {
  calls: BackendCall[];
  tables: Map<string, Row[]>;
  rpcs: Map<string, RpcAnswer>;
  rpcKinds: Map<string, "read" | "write">;
  fetches: Array<{ match: RegExp; answer: FetchAnswer }>;
  openChannels: Set<string>;
  user: { id: string; email: string };
}

const state: BackendState = {
  calls: [],
  tables: new Map(),
  rpcs: new Map(),
  rpcKinds: new Map(),
  fetches: [],
  openChannels: new Set(),
  user: { id: "", email: "" },
};

/** Clear the ledger and every fixture (between cases). */
export function resetBackend(user: { id: string; email: string }): void {
  state.calls = [];
  state.tables = new Map();
  state.rpcs = new Map();
  state.rpcKinds = new Map();
  state.fetches = [];
  state.openChannels = new Set();
  state.user = user;
}

/** Rows a table answers with (`schema.table`, or a bare table name for `public`). */
export function seed(table: string, rows: Row[]): void {
  state.tables.set(qualify(table), rows.map((r) => ({ ...r })));
}

/**
 * What an RPC answers. `kind` says whether calling it changes anything
 * ("write": a create, an "opened" recording, a save) — an RPC nobody seeded
 * counts as a write, so an unknown call can never pass as a harmless read.
 */
export function seedRpc(name: string, answer: RpcAnswer, kind: "read" | "write" = "read"): void {
  state.rpcs.set(name, answer);
  state.rpcKinds.set(name, kind);
}

export function rpcKind(name: string): "read" | "write" | "unknown" {
  return state.rpcKinds.get(name) ?? "unknown";
}

export function seedFetch(match: RegExp, answer: FetchAnswer): void {
  state.fetches.push({ match, answer });
}

export function backendCalls(): readonly BackendCall[] {
  return state.calls;
}

export function openChannelCount(): number {
  return state.openChannels.size;
}

function qualify(table: string): string {
  return table.includes(".") ? table : `public.${table}`;
}

function record(call: BackendCall): void {
  state.calls.push(call);
}

function matches(row: Row, filters: Array<[string, unknown[]]>): boolean {
  for (const [method, args] of filters) {
    const [column, value] = args as [string, unknown];
    if (typeof column !== "string" || column.includes(",") || column.includes("(")) continue;
    if (!(column in row)) continue;
    if (method === "eq" && row[column] !== value) return false;
    if (method === "in" && Array.isArray(value) && !value.includes(row[column])) return false;
    if (method === "is" && value === null && row[column] !== null) return false;
  }
  return true;
}

/** A PostgREST-shaped builder: every chained call is recorded; awaiting it answers. */
function queryBuilder(schema: string, table: string) {
  const call: BackendCall = { door: "db", target: `${schema}.${table}`, op: "select", filters: [] };
  let mode: "many" | "single" | "maybeSingle" = "many";
  let head = false;
  let recorded = false;

  const answer = () => {
    if (!recorded) {
      recorded = true;
      record(call);
    }
    const rows = state.tables.get(call.target) ?? [];
    let data: unknown;
    if (call.op === "select") {
      data = rows.filter((r) => matches(r, call.filters));
    } else if (call.op === "delete") {
      data = [];
    } else {
      // Writes land, as they would in the database: a later read sees them.
      const payload = call.payload;
      const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
      if (call.op === "update") {
        const hit = rows.filter((r) => matches(r, call.filters));
        for (const r of hit) Object.assign(r, list[0]);
        data = hit.map((r) => ({ ...r }));
      } else {
        const now = new Date().toISOString();
        const written = list.map((p, i) => ({
          id: `00000000-0000-4000-8000-${String(state.calls.length).padStart(8, "0")}${String(i).padStart(4, "0")}`,
          created_at: now,
          updated_at: now,
          ...p,
        }));
        // Newest first, as the feature reads order by created_at desc.
        state.tables.set(call.target, [...written, ...rows]);
        data = written;
      }
    }
    const list = data as Row[];
    if (mode === "single") {
      if (list.length === 0) {
        return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "", hint: "" }, count: null, status: 406, statusText: "Not Acceptable" };
      }
      return { data: list[0], error: null, count: 1, status: 200, statusText: "OK" };
    }
    if (mode === "maybeSingle") return { data: list[0] ?? null, error: null, count: list.length, status: 200, statusText: "OK" };
    return { data: head ? null : list, error: null, count: list.length, status: 200, statusText: "OK" };
  };

  const builder: Record<string, unknown> = {};
  const proxy: Record<string, unknown> = new Proxy(builder, {
    get(_target, prop: string | symbol) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve().then(answer).then(resolve, reject);
      }
      if (prop === "catch" || prop === "finally") {
        const p = Promise.resolve().then(answer);
        return (p as unknown as Record<string, unknown>)[prop as string]?.bind?.(p);
      }
      if (typeof prop === "symbol") return undefined;
      return (...args: unknown[]) => {
        switch (prop) {
          case "select":
            if (call.op === "select") {
              const opts = args[1] as { head?: boolean } | undefined;
              head = opts?.head === true;
            }
            break;
          case "insert":
          case "update":
          case "upsert":
            call.op = prop;
            call.payload = args[0];
            break;
          case "delete":
            call.op = "delete";
            break;
          case "single":
            mode = "single";
            break;
          case "maybeSingle":
            mode = "maybeSingle";
            break;
          default:
            call.filters.push([prop, args]);
        }
        return proxy;
      };
    },
  });
  return proxy;
}

function fakeChannel(name: string) {
  const channel: Record<string, unknown> = {
    topic: `realtime:${name}`,
    on: () => channel,
    subscribe: (cb?: (status: string) => void) => {
      record({ door: "channel", target: name, op: "subscribe", filters: [] });
      state.openChannels.add(name);
      if (cb) queueMicrotask(() => cb("SUBSCRIBED"));
      return channel;
    },
    unsubscribe: () => {
      record({ door: "channel", target: name, op: "unsubscribe", filters: [] });
      state.openChannels.delete(name);
      return Promise.resolve("ok");
    },
    send: () => Promise.resolve("ok"),
    track: () => Promise.resolve("ok"),
    untrack: () => Promise.resolve("ok"),
    presenceState: () => ({}),
    state: "joined",
  };
  return channel;
}

function rpc(name: string, args?: Record<string, unknown>) {
  const call: BackendCall = { door: "rpc", target: name, op: "rpc", filters: [], payload: args };
  let mode: "many" | "single" | "maybeSingle" = "many";
  const run = () => {
    record(call);
    const seeded = state.rpcs.get(name);
    if (seeded === undefined) {
      return { data: null, error: { code: "PGRST202", message: `rpc ${name} is not seeded for this case`, details: "", hint: "" } };
    }
    const value = typeof seeded === "function" ? (seeded as (a: unknown) => unknown)(args) : seeded;
    if (mode !== "many" && Array.isArray(value)) return { data: value[0] ?? null, error: null };
    return { data: value, error: null };
  };
  const p: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string | symbol) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve().then(run).then(resolve, reject);
        }
        if (typeof prop === "symbol") return undefined;
        return (...a: unknown[]) => {
          if (prop === "single") mode = "single";
          else if (prop === "maybeSingle") mode = "maybeSingle";
          else call.filters.push([prop, a]);
          return p;
        };
      },
    },
  );
  return p;
}

function schemaClient(schema: string) {
  return {
    from: (table: string) => queryBuilder(schema, table),
    rpc: (name: string, args?: Record<string, unknown>) => rpc(name, args),
  };
}

function session() {
  return {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: authUser(),
  };
}

function authUser() {
  return {
    id: state.user.id,
    email: state.user.email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-03-14T16:02:11.000Z",
  };
}

/** The one Supabase client every case gets (`@/utils/supabase/client`). */
export function createFakeSupabase() {
  return {
    ...schemaClient("public"),
    schema: (name: string) => schemaClient(name),
    channel: (name: string) => fakeChannel(name),
    removeChannel: (channel: { unsubscribe?: () => unknown }) => {
      channel?.unsubscribe?.();
      return Promise.resolve("ok");
    },
    removeAllChannels: () => Promise.resolve([]),
    getChannels: () => [],
    auth: {
      getUser: async () => ({ data: { user: authUser() }, error: null }),
      getSession: async () => ({ data: { session: session() }, error: null }),
      getClaims: async () => ({ data: { claims: { sub: state.user.id, email: state.user.email } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      refreshSession: async () => ({ data: { session: session(), user: authUser() }, error: null }),
    },
    storage: {
      from: (bucket: string) => {
        const op = (name: string) => async (...args: unknown[]) => {
          record({ door: "storage", target: bucket, op: name, filters: [], payload: args[0] });
          if (name === "createSignedUrl") return { data: { signedUrl: `https://storage.test/${bucket}/${String(args[0])}?token=signed` }, error: null };
          if (name === "download") return { data: new Blob(["file body"]), error: null };
          return { data: null, error: null };
        };
        return {
          createSignedUrl: op("createSignedUrl"),
          createSignedUrls: op("createSignedUrls"),
          download: op("download"),
          upload: op("upload"),
          remove: op("remove"),
          list: op("list"),
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${bucket}/${path}` } }),
        };
      },
    },
    functions: {
      invoke: async (name: string, opts?: { body?: unknown }) => {
        record({ door: "fetch", target: `functions/${name}`, op: "invoke", filters: [], payload: opts?.body });
        return { data: null, error: null };
      },
    },
  };
}

/** In-memory `blob:` URLs (URL.createObjectURL) — local, never network, never recorded. */
const blobs = new Map<string, Blob>();
let blobSeq = 0;
export function createObjectURL(blob: Blob): string {
  const url = `blob:http://localhost/${++blobSeq}`;
  blobs.set(url, blob);
  return url;
}
export function revokeObjectURL(url: string): void {
  blobs.delete(url);
}

/** The recording `fetch` (the Python server, file bytes, anything over HTTP). */
export async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const local = blobs.get(url);
  if (local) {
    const text = await local.text();
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": local.type || "text/plain" }),
      url,
      json: async () => JSON.parse(text),
      text: async () => text,
      blob: async () => local,
      arrayBuffer: async () => new TextEncoder().encode(text).buffer,
      clone() {
        return this;
      },
      body: null,
      bodyUsed: false,
    } as unknown as Response;
  }
  const method = (init?.method ?? "GET").toUpperCase();
  record({ door: "fetch", target: url, op: method, filters: [], payload: init?.body });
  const seeded = state.fetches.find((f) => f.match.test(url));
  const body = seeded ? seeded.answer(url, init) : { error: `fetch ${url} is not seeded for this case` };
  const status = seeded ? 200 : 404;
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status < 400,
    status,
    statusText: status < 400 ? "OK" : "Not Found",
    headers: new Headers({ "content-type": typeof body === "string" ? "text/plain" : "application/json" }),
    url,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
    text: async () => text,
    blob: async () => new Blob([text]),
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
    clone() {
      return this;
    },
    body: null,
    bodyUsed: false,
  } as unknown as Response;
}

/**
 * The recording XMLHttpRequest (file downloads use XHR for progress). Same
 * ledger and seeds as `fakeFetch`; jsdom's own would reach the real network.
 */
export class FakeXMLHttpRequest {
  static readonly UNSENT = 0;
  static readonly OPENED = 1;
  static readonly DONE = 4;
  readyState = 0;
  status = 0;
  statusText = "";
  response: unknown = null;
  responseText = "";
  responseType = "";
  timeout = 0;
  withCredentials = false;
  upload = { addEventListener: () => undefined, removeEventListener: () => undefined };
  onload: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onreadystatechange: (() => void) | null = null;
  private method = "GET";
  private url = "";
  private listeners = new Map<string, Array<(ev: unknown) => void>>();
  private headers: Record<string, string> = {};
  open(method: string, url: string) {
    this.method = method.toUpperCase();
    this.url = url;
    this.readyState = 1;
  }
  setRequestHeader() {}
  getResponseHeader(name: string) {
    return this.headers[name.toLowerCase()] ?? null;
  }
  getAllResponseHeaders() {
    return Object.entries(this.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
  }
  addEventListener(type: string, fn: (ev: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(type: string, fn: (ev: unknown) => void) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn));
  }
  abort() {}
  send(body?: unknown) {
    record({ door: "fetch", target: this.url, op: this.method, filters: [], payload: body });
    const seeded = state.fetches.find((f) => f.match.test(this.url));
    const answer = seeded ? seeded.answer(this.url) : { error: `xhr ${this.url} is not seeded for this case` };
    const text = typeof answer === "string" ? answer : JSON.stringify(answer);
    queueMicrotask(() => {
      this.status = seeded ? 200 : 404;
      this.statusText = seeded ? "OK" : "Not Found";
      this.headers = { "content-type": typeof answer === "string" ? "text/plain" : "application/json" };
      this.responseText = text;
      this.response = this.responseType === "blob" ? new Blob([text]) : this.responseType === "json" ? answer : text;
      this.readyState = 4;
      this.onreadystatechange?.();
      for (const fn of this.listeners.get("readystatechange") ?? []) fn({ target: this });
      this.onload?.({ target: this });
      for (const fn of this.listeners.get("load") ?? []) fn({ target: this });
      for (const fn of this.listeners.get("loadend") ?? []) fn({ target: this });
    });
  }
}
