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
  assertBundleBackend,
  listOwned,
  reconcile,
  cleanup,
  finalFailure,
  recordAttempt,
  removeArtifact,
} = require("./keepass-import-retry-acceptance.cjs");
test("refuses unarmed, remote, or bundle/backend-mismatched runs before browser launch", () => {
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
test("refuses a lease whose checkout, hostname, or compiled backend differs", () => {
  const config = {
    frontend: "http://vault-task3.localhost:3001",
    api: "http://127.0.0.1:8027",
  };
  const lease = parsePreviewLease(
    "ROOT=/worktree\nOWNER_HOST=vault-task3.localhost\nPORT=3001\nPID=123",
  );
  assert.doesNotThrow(() =>
    assertPreviewAttestation(lease, config, {
      worktree: "/worktree",
      commit: "abc",
      currentCommit: "abc",
    }),
  );
  assert.throws(
    () =>
      assertPreviewAttestation({ ...lease, ROOT: "/foreign" }, config, {
        worktree: "/worktree",
        commit: "abc",
        currentCommit: "abc",
      }),
    /preview_checkout_mismatch/,
  );
  assert.throws(
    () =>
      assertPreviewAttestation(
        { ...lease, OWNER_HOST: "foreign.localhost" },
        config,
        { worktree: "/worktree", commit: "abc", currentCommit: "abc" },
      ),
    /preview_host_mismatch/,
  );
  assert.throws(
    () =>
      assertPreviewAttestation(lease, config, {
        worktree: "/worktree",
        commit: "old",
        currentCommit: "new",
      }),
    /preview_commit_mismatch/,
  );
  assert.doesNotThrow(() =>
    assertBundleBackend(["const backend='http://127.0.0.1:8027'"], config.api),
  );
  assert.throws(
    () =>
      assertBundleBackend(["https://server.app.matrxserver.com"], config.api),
    /compiled_backend_mismatch/,
  );
});
test("uses the Fetch Response boolean contract and durably reconciles a dropped response", async () => {
  const priorFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({ items: [{ id: "item-1", display_name: "retry" }] }),
      { status: 200 },
    );
  };
  const ledger = {
    attempts: [
      {
        name: "retry",
        key: "key-1",
        body: { source: "system_import" },
        itemId: "item-1",
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
    assert.equal(reconciled[0].id, "item-1");
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = priorFetch;
  }
});
test("cleanup attempts every delete and reports cleanup before the scenario failure", async () => {
  const priorFetch = global.fetch;
  const deleted = [];
  global.fetch = async (url, init = {}) => {
    const target = String(url);
    if (init.method === "DELETE") {
      deleted.push(target);
      return new Response(null, {
        status: target.endsWith("item-1") ? 500 : 204,
      });
    }
    return new Response(
      JSON.stringify({
        items: target.includes("after")
          ? []
          : [
              { id: "item-1", display_name: "one" },
              { id: "item-2", display_name: "two" },
            ],
      }),
      { status: 200 },
    );
  };
  const ledger = {
    attempts: [
      { name: "one", key: "a", body: {}, itemId: "item-1" },
      { name: "two", key: "b", body: {}, itemId: "item-2" },
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
  const attempt = await recordAttempt(ledger, "retry", "key", body, {
    save: async () => undefined,
  });
  assert.deepEqual(attempt, {
    name: "retry",
    key: "key",
    body: {
      definitionKey: "website_login",
      source: "system_import",
      principal: "user",
      fieldKeys: ["password"],
      loginUrlCount: 1,
      browserFillEnabled: false,
    },
    itemId: null,
  });
  assert.equal(
    JSON.stringify(ledger).includes("plaintext-never-persisted"),
    false,
  );
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
test("rejects response-loss replay that changes command bytes or receipt id", () => {
  assert(
    exactRetry(
      { key: "a", body: "one", id: "i" },
      { key: "a", body: "one", id: "i" },
    ),
  );
  assert(
    !exactRetry(
      { key: "a", body: "one", id: "i" },
      { key: "a", body: "two", id: "i" },
    ),
  );
  assert(
    !exactRetry(
      { key: "a", body: "one", id: "i" },
      { key: "a", body: "one", id: "other" },
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
