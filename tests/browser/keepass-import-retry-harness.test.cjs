const assert = require("node:assert/strict");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const {
  exactRetry,
  localOrigin,
  runtimeConfig,
  assertSource,
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
  assert.throws(
    () =>
      runtimeConfig({
        ...base,
        MATRX_KEEPASS_LOCAL_API: "https://server.app.matrxserver.com",
      }),
    /localhost_api_required/,
  );
  assert.throws(
    () =>
      runtimeConfig({
        ...base,
        NEXT_PUBLIC_BACKEND_URL_PROD: "http://127.0.0.1:9999",
      }),
    /compiled_backend_origin_required/,
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
