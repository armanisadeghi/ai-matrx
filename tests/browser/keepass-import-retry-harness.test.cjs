const assert = require("node:assert/strict");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const {
  exactRetry,
  localOrigin,
  runtimeConfig,
  assertSource,
  parsePreviewLease,
  assertPreviewAttestation,
  assertVaultOrigin,
  requestDigest,
  listOwned,
  reconcile,
  cleanup,
  finalFailure,
  recordAttempt,
  removeArtifact,
  createVaultRouteGuard,
  createGuardedContext,
  canonicalId,
  aggregateRunFailures,
  runFinalizer,
} = require("./keepass-import-retry-acceptance.cjs");
test("refuses unarmed or remote-origin runs before browser launch", () => {
  const base = {
    MATRX_KEEPASS_IMPORT_CANARY: "RUN_UNDER_REVIEW",
    MATRX_KEEPASS_LOCAL_FRONTEND: "http://127.0.0.1:3001",
    MATRX_KEEPASS_LOCAL_API: "http://127.0.0.1:8000",
    NEXT_PUBLIC_BACKEND_URL_PROD: "http://127.0.0.1:8000",
    AI_ADMIN_USERNAME: "admin@admin.com",
    AI_ADMIN_PASSWORD: "private",
  };
  assert.equal(localOrigin(base.MATRX_KEEPASS_LOCAL_FRONTEND, "3001"), true);
  assert.equal(localOrigin("http://vault-task3.localhost:3001", "3001"), true);
  assert.equal(localOrigin("http://localhost.example.com:3001", "3001"), false);
  assert.equal(localOrigin("http://vault-task3.localhost:3002", "3001"), false);
  assert.throws(
    () =>
      runtimeConfig({
        ...base,
        MATRX_KEEPASS_LOCAL_API: "https://server.app.matrxserver.com",
      }),
    /localhost_api_required/,
  );
});
test("refuses a lease whose live process checkout or hostname differs", () => {
  const config = {
    frontend: "http://vault-task3.localhost:3001",
    api: "http://127.0.0.1:8027",
  };
  const lease = parsePreviewLease(
    "ROOT=/worktree\nOWNER_HOST=vault-task3.localhost\nPORT=3001\nPID=123",
  );
  const live = {
    isAlive: () => true,
    processCwd: () => "/worktree",
    ownsListener: () => true,
  };
  assert.doesNotThrow(() =>
    assertPreviewAttestation(lease, config, { worktree: "/worktree" }, live),
  );
  assert.throws(
    () =>
      assertPreviewAttestation(
        { ...lease, ROOT: "/foreign" },
        config,
        {
          worktree: "/worktree",
        },
        live,
      ),
    /preview_checkout_mismatch/,
  );
  assert.throws(
    () =>
      assertPreviewAttestation(
        { ...lease, OWNER_HOST: "foreign.localhost" },
        config,
        { worktree: "/worktree" },
        live,
      ),
    /preview_host_mismatch/,
  );
  assert.throws(
    () =>
      assertPreviewAttestation(
        lease,
        config,
        { worktree: "/worktree" },
        {
          isAlive: () => false,
          processCwd: () => "/worktree",
          ownsListener: () => true,
        },
      ),
    /preview_pid_not_live/,
  );
  assert.throws(
    () =>
      assertPreviewAttestation(
        lease,
        config,
        { worktree: "/worktree" },
        {
          isAlive: () => true,
          processCwd: () => "/foreign",
          ownsListener: () => true,
        },
      ),
    /preview_process_checkout_mismatch/,
  );
  assert.throws(
    () =>
      assertPreviewAttestation(
        lease,
        config,
        { worktree: "/worktree" },
        {
          isAlive: () => true,
          processCwd: () => "/worktree",
          ownsListener: () => false,
        },
      ),
    /preview_process_listener_mismatch/,
  );
  assert.doesNotThrow(() =>
    assertVaultOrigin("http://127.0.0.1:8027/api/vault/items", config),
  );
  assert.throws(
    () =>
      assertVaultOrigin(
        "https://server.app.matrxserver.com/api/vault/items",
        config,
      ),
    /foreign_vault_origin_refused/,
  );
});
test("uses the Fetch Response boolean contract and durably reconciles a dropped response", async () => {
  const priorFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        items: [
          { id: "11111111-1111-4111-8111-111111111111", display_name: "retry" },
        ],
      }),
      { status: 200 },
    );
  };
  const ledger = {
    attempts: [
      {
        name: "retry",
        key: "key-1",
        body: { source: "system_import" },
        itemIds: ["11111111-1111-4111-8111-111111111111"],
      },
    ],
  };
  const actor = {
    token: "token",
    orgId: "11111111-1111-4111-8111-111111111111",
    email: "admin@admin.com",
  };
  try {
    const items = await listOwned(
      { api: "http://127.0.0.1:8027" },
      actor,
      new Set(["retry"]),
    );
    assert.equal(items.length, 1);
    const reconciled = await reconcile(
      { api: "http://127.0.0.1:8027" },
      actor,
      ledger,
      new Set(["retry"]),
      { save: async () => undefined },
    );
    assert.equal(reconciled[0].id, "11111111-1111-4111-8111-111111111111");
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = priorFetch;
  }
});
test("cleanup attempts every delete and reports cleanup before the scenario failure", async () => {
  const priorFetch = global.fetch;
  const deleted = [];
  let listCalls = 0;
  global.fetch = async (url, init = {}) => {
    const target = String(url);
    if (init.method === "DELETE") {
      deleted.push(target);
      return new Response(null, {
        status: target.endsWith("11111111-1111-4111-8111-111111111111")
          ? 500
          : 204,
      });
    }
    listCalls += 1;
    return new Response(
      JSON.stringify({
        items:
          listCalls === 1
            ? [
                {
                  id: "11111111-1111-4111-8111-111111111111",
                  display_name: "one",
                },
                {
                  id: "22222222-2222-4222-8222-222222222222",
                  display_name: "two",
                },
              ]
            : [],
      }),
      { status: 200 },
    );
  };
  const ledger = {
    attempts: [
      {
        name: "one",
        key: "a",
        body: {},
        itemIds: ["11111111-1111-4111-8111-111111111111"],
      },
      {
        name: "two",
        key: "b",
        body: {},
        itemIds: ["22222222-2222-4222-8222-222222222222"],
      },
    ],
  };
  const actor = {
    token: "token",
    orgId: "11111111-1111-4111-8111-111111111111",
    email: "admin@admin.com",
  };
  try {
    const failures = await cleanup(
      { api: "http://127.0.0.1:8027" },
      actor,
      ledger,
      new Set(["one", "two"]),
      { save: async () => undefined },
    );
    assert.equal(deleted.length, 2);
    const result = finalFailure(new Error("scenario_failed"), failures);
    assert(
      result instanceof AggregateError &&
        result.errors.some((error) => error.message === "scenario_failed"),
    );
  } finally {
    global.fetch = priorFetch;
  }
});
test("records a value-free attempt mapping before a response can be dropped", async () => {
  const ledger = { attempts: [] };
  const body = {
    definition_key: "website_login",
    source: "system_import",
    principal: { type: "user" },
    fields: [{ field_key: "password", value: "plaintext-never-persisted" }],
    login_urls: ["https://fixture.example.invalid"],
    browser_fill_enabled: false,
  };
  const attempt = await recordAttempt(
    ledger,
    "retry",
    "key",
    body,
    JSON.stringify(body),
    {
      save: async () => undefined,
    },
  );
  assert.deepEqual(attempt, {
    name: "retry",
    key: "key",
    digest: requestDigest(JSON.stringify(body)),
    body: {
      definitionKey: "website_login",
      source: "system_import",
      principal: "user",
      fieldKeys: ["password"],
      loginUrlCount: 1,
      browserFillEnabled: false,
    },
    itemIds: [],
  });
  assert.equal(
    JSON.stringify(ledger).includes("plaintext-never-persisted"),
    false,
  );
  const changedBytes = {
    ...body,
    fields: [{ field_key: "password", value: "different-plaintext" }],
  };
  await assert.rejects(
    () =>
      recordAttempt(
        ledger,
        "retry",
        "key",
        changedBytes,
        JSON.stringify(changedBytes),
        { save: async () => undefined },
      ),
    /attempt_mapping_mismatch/,
  );
  assert.equal(requestDigest(JSON.stringify(body)).length, 64);
});
test("context-wide route guard aborts foreign and anonymous creates before transport", async () => {
  const calls = [];
  const state = {
    actor: null,
    handleCreate: null,
    observedAllowedVaultRequest: false,
  };
  const guard = createVaultRouteGuard({ api: "http://127.0.0.1:8027" }, state);
  const fakeRoute = (url, method = "GET") => ({
    request: () => ({ url: () => url, method: () => method }),
    abort: async () => calls.push(`abort:${url}`),
    continue: async () => calls.push(`continue:${url}`),
  });
  await guard(fakeRoute("https://server.app.matrxserver.com/api/vault/items"));
  await guard(fakeRoute("http://127.0.0.1:8027/api/vault/items", "POST"));
  await guard(
    fakeRoute("http://127.0.0.1:8027/api/vault/items?principal_type=user"),
  );
  assert.deepEqual(
    calls.map((call) => call.split(":")[0]),
    ["abort", "abort", "continue"],
  );
  assert.equal(state.observedAllowedVaultRequest, true);
  assert.deepEqual(
    state.runFailures.map((error) => error.message),
    ["foreign_vault_request_refused", "anonymous_vault_create_refused"],
  );
  const final = aggregateRunFailures(undefined, state.runFailures);
  assert(final instanceof AggregateError);
  assert.deepEqual(
    final.errors.map((error) => error.message),
    ["foreign_vault_request_refused", "anonymous_vault_create_refused"],
  );
});
test("guarded context cannot resolve before route protection is installed", async () => {
  let releaseRoute;
  let pageCreated = false;
  const context = {
    route: () =>
      new Promise((resolve) => {
        releaseRoute = resolve;
      }),
    on: () => undefined,
    newPage: () => {
      pageCreated = true;
    },
  };
  let ready = false;
  const pending = createGuardedContext(
    async () => context,
    { api: "http://127.0.0.1:8027" },
    { runFailures: [] },
  ).then(() => {
    ready = true;
  });
  const startMainNavigation = async () => {
    await pending;
    context.newPage();
  };
  const navigation = startMainNavigation();
  await Promise.resolve();
  assert.equal(ready, false);
  assert.equal(pageCreated, false);
  releaseRoute();
  await navigation;
  assert.equal(ready, true);
  assert.equal(canonicalId("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(canonicalId("not-a-uuid"), false);
});
test("cleanup preserves mapping defects while deleting duplicate and unreceipted exact names", async () => {
  const priorFetch = global.fetch;
  const deleted = [];
  let listCalls = 0;
  global.fetch = async (url, init = {}) => {
    if (init.method === "DELETE") {
      deleted.push(String(url).split("/").pop());
      return new Response(null, { status: 204 });
    }
    listCalls += 1;
    return new Response(
      JSON.stringify({
        items:
          listCalls === 1
            ? [
                {
                  id: "33333333-3333-4333-8333-333333333333",
                  display_name: "same",
                },
                {
                  id: "44444444-4444-4444-8444-444444444444",
                  display_name: "same",
                },
                {
                  id: "55555555-5555-4555-8555-555555555555",
                  display_name: "unknown",
                },
                { id: "not-a-uuid", display_name: "same" },
              ]
            : [],
      }),
      { status: 200 },
    );
  };
  const actor = {
    token: "token",
    orgId: "11111111-1111-4111-8111-111111111111",
    email: "admin@admin.com",
  };
  try {
    const failures = await cleanup(
      { api: "http://127.0.0.1:8027" },
      actor,
      {
        attempts: [
          { name: "same", key: "k", digest: "d", body: {}, itemIds: [] },
        ],
      },
      new Set(["same", "unknown"]),
      { save: async () => undefined },
    );
    assert.deepEqual(deleted.sort(), [
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ]);
    assert(
      failures.some(
        (error) => error.message === "owned_reconciliation_mapping_failed",
      ),
    );
    assert(
      failures.some((error) => error.message === "owned_cleanup_id_required"),
    );
  } finally {
    global.fetch = priorFetch;
  }
});
test("preflight cleanup does not mask its failure before any attempt can dispatch", async () => {
  assert.deepEqual(
    await cleanup(
      { api: "http://127.0.0.1:8027" },
      undefined,
      { attempts: [] },
      new Set(),
    ),
    [],
  );
  const failures = await cleanup(
    { api: "http://127.0.0.1:8027" },
    undefined,
    { attempts: [{ name: "possible-write", itemIds: [] }] },
    new Set(["possible-write"]),
  );
  assert.deepEqual(
    failures.map((error) => error.message),
    ["owned_cleanup_context_unavailable"],
  );
});
test("production finalizer runs every outer stage after cleanup ledger-save failure", async () => {
  const priorFetch = global.fetch;
  const stages = [];
  global.fetch = async () =>
    new Response(JSON.stringify({ items: [] }), { status: 200 });
  try {
    const failure = await runFinalizer({
      primaryFailure: new Error("preflight_failed"),
      cleanup: () =>
        cleanup(
          { api: "http://127.0.0.1:8027" },
          {
            token: "token",
            orgId: "11111111-1111-4111-8111-111111111111",
            email: "admin@admin.com",
          },
          { attempts: [] },
          new Set(),
          {
            save: async () => {
              throw new Error("ledger_save_required");
            },
          },
        ),
      logout: async () => stages.push("logout"),
      close: async () => stages.push("close"),
      removeFixture: async () => stages.push("fixture"),
      removeProfile: async () => stages.push("profile"),
      removeLedger: async () => stages.push("ledger"),
      shouldRemoveLedger: () => true,
    });
    assert.deepEqual(stages, ["logout", "close", "fixture", "profile"]);
    assert(failure instanceof AggregateError);
    assert(
      failure.errors.some(
        (error) =>
          error.message === "ledger_save_required" ||
          error.errors?.some(
            (nested) => nested.message === "ledger_save_required",
          ),
      ),
    );
    assert(
      failure.errors.some((error) => error.message === "preflight_failed"),
    );
  } finally {
    global.fetch = priorFetch;
  }
});
test("continues artifact cleanup after each independent removal failure", async () => {
  const attempted = [];
  const failures = [];
  await removeArtifact(
    async (target) => {
      attempted.push(target);
      throw new Error("blocked");
    },
    "fixture",
    "fixture_removal_required",
    failures,
  );
  await removeArtifact(
    async (target) => {
      attempted.push(target);
    },
    "profile",
    "profile_removal_required",
    failures,
  );
  await removeArtifact(
    async (target) => {
      attempted.push(target);
      throw new Error("blocked");
    },
    "ledger",
    "ledger_removal_required",
    failures,
  );
  assert.deepEqual(attempted, ["fixture", "profile", "ledger"]);
  assert.deepEqual(
    failures.map((error) => error.message),
    ["fixture_removal_required", "ledger_removal_required"],
  );
});
test("rejects response-loss replay that changes exact request digest or receipt id", () => {
  assert(
    exactRetry(
      { key: "a", digest: "one", id: "i" },
      { key: "a", digest: "one", id: "i" },
    ),
  );
  assert(
    !exactRetry(
      { key: "a", digest: "one", id: "i" },
      { key: "a", digest: "two", id: "i" },
    ),
  );
  assert(
    !exactRetry(
      { key: "a", digest: "one", id: "i" },
      { key: "a", digest: "one", id: "other" },
    ),
  );
});
test("rejects source records with changed parser-owned entry or metadata", () => {
  const x = { entryXml: "<Entry><UUID>BBBBBBBBBBBBBBBBBBBBBB</UUID></Entry>" };
  const valid = JSON.stringify({
    source: "keepass_xml",
    version: 1,
    entry_xml: x.entryXml,
    group_path: ["Acceptance"],
    meta_xml: [
      "<Generator>KeePassXC</Generator>",
      "<DatabaseName>Acceptance</DatabaseName>",
    ],
    excluded_binary_definition_count: 0,
  });
  assert.doesNotThrow(() => assertSource(valid, x));
  assert.throws(
    () => assertSource(valid.replace("KeePassXC", "Other"), x),
    /encrypted_source_preservation_required/,
  );
});
test("real parser and structured command accept an unprotected KeePass XML export", () => {
  const program = `import { parseKeePassXml } from './features/secrets/keepass-xml'; import { prepareStructuredImportCommand } from './features/secrets/structured-import'; const xml='<?xml version="1.0"?><KeePassFile><Meta><Generator>KeePassXC</Generator><DatabaseName>Acceptance</DatabaseName></Meta><Root><Group><UUID>AAAAAAAAAAAAAAAAAAAAAA==</UUID><Name>Acceptance</Name><Entry><UUID>AQAAAAAAAAAAAAAAAAAAAA==</UUID><String><Key>Title</Key><Value>Fixture</Value></String><String><Key>UserName</Key><Value>fixture</Value></String><String><Key>Password</Key><Value>plain</Value></String><String><Key>URL</Key><Value>https://fixture.example.invalid/login</Value></String></Entry></Group></Root></KeePassFile>'; const limits={maxFileBytes:100000,maxRecords:10,maxCellBytes:10000,maxJsonDepth:16}; const record=parseKeePassXml(xml,limits).records[0]; if(record.status!=='supported') throw new Error('real_parser_fixture_rejected'); const prepared=prepareStructuredImportCommand({record,principal:{type:'user'},expectedActor:{userId:'fixture-user',organizationId:'fixture-org'},rowId:'fixture-row',browserFillEnabled:false,includeDeleted:false,includeArchived:false,limits}); if(prepared.status!=='ready'||prepared.command.body.fields[0].field_key!=='import_source_record') throw new Error('real_structured_command_rejected');`;
  const result = spawnSync("pnpm", ["exec", "tsx", "-e", program], {
    cwd: require("node:path").resolve(__dirname, "..", ".."),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || "real_parser_fixture_failed");
});
