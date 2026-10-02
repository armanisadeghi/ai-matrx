/**
 * check:no-custom-store-code — Guard 7 of the Unified Data System (v6 lane INTEGRATION, W1.8).
 *
 * The record store (`custom.*`: tables, fields, records, views, references, and the `custom.*`
 * functions that are its doors) is the one home for every organization's tables. Apps never write
 * their own custom-data code: they reach the store through the two packages `@ai-matrx/records`
 * (client doors) and `@ai-matrx/records-ui` (UI), source in `aidream/apps/shared/records` and
 * `aidream/apps/shared/records-ui`. This guard fails when an app file touches `custom.*` directly:
 *
 *   - switches the client to the schema: `.schema("custom")`
 *   - passes it as an option, registry entry or constant: `schema: "custom"`, `schemaName: "custom"`,
 *     `STORE_SCHEMA = "custom"`
 *   - names a store relation or door in SQL: `from custom.record`, `select custom.x(…)`
 *
 * A bare "custom.x" string is NOT a touch: door names in error sentences, knob keys
 * (`custom.data_home_default_order`) and generated registries carry that text without reaching
 * the store.
 *
 * Every file that does so TODAY is in `TOUCHES_THE_STORE` with its one-line reason, mirroring the
 * census (common-docs projects/data-doctrine-adoption/v6/CENSUS-NO-CUSTOM-CODE.md). The list can
 * only shrink: a new file fails, and an entry whose file no longer touches the store fails as
 * STALE until it is removed. Tests (`__tests__`, `*.test.*`, `*.spec.*`) are out of scope — they
 * stub the store to prove a caller, they do not reach it.
 *
 *   pnpm check:no-custom-store-code              the tree
 *   pnpm check:no-custom-store-code --list       every file that touches the store, with its shapes
 *   pnpm check:no-custom-store-code --self-test  proves the rule fails on a planted in-memory file
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Shipped app source. Scripts, docs, migrations and tests are outside the rule. */
export const APP_ROOTS = [
  "app",
  "features",
  "components",
  "lib",
  "hooks",
  "utils",
  "providers",
  "types",
  "constants",
  "config",
  "packages",
  "middleware.ts",
  "proxy.ts",
  "instrumentation.ts",
];

/** The shapes of a direct touch, tested on comment-stripped text. */
export const SHAPES: ReadonlyArray<readonly [string, RegExp]> = [
  ["schema-switch", /\.schema\(\s*["'`]custom["'`]\s*\)/],
  ["schema-option", /\bschema(?:Name)?\s*:\s*["'`]custom["'`]/i],
  ["schema-constant", /\b\w*schema\w*\s*=\s*["'`]custom["'`]/i],
  ["sql", /\b(?:from|join|into|update|table|function|call|perform|select|exists)\s+custom\.[a-z_]+/i],
];

export function isTest(file: string): boolean {
  return /(^|\/)__tests__\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /(^|\/)__mocks__\//.test(file);
}

/** Drop block comments and whole-line `//` / `*` comments; strings stay intact. */
export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => (/^\s*(\/\/|\*)/.test(l) ? "" : l))
    .join("\n");
}

/** The shapes a file's code uses to reach `custom.*` directly (empty when it does not). */
export function touches(text: string): string[] {
  const code = stripComments(text);
  return SHAPES.filter(([, re]) => re.test(code)).map(([name]) => name);
}

/**
 * Every app file that touches the store directly today, each with why it may (or until when).
 * Mirrors CENSUS-NO-CUSTOM-CODE.md row for row. Never add an entry: move the call into
 * `@ai-matrx/records` (or `-ui`) and import it. Removing an entry is the only allowed edit.
 */
export const TOUCHES_THE_STORE: Record<string, string> = {
  "app/(core)/d/[renderId]/page.tsx":
    "move: doc_render_read → new records door docRenderRead",
  "app/(core)/organizations/[orgId]/tables/page.tsx":
    "ready to move: table_list_everywhere → RecordsClient.tableListEverywhere (the no-organization call needs the door's org argument exposed)",
  "app/(core)/scopes/s/[scopeId]/page.tsx":
    "move: context_scopes → new records door contextScopes (lane SCOPES-ON-THE-STORE)",
  "app/api/stripe/class-checkout/route.ts":
    "move: server-only context_class_for_checkout → new records door contextClassForCheckout (host passes the service-role data source)",
  "features/booking/service.ts":
    "move: public booking lane (booking_public/hold/confirm/manage/cancel/reschedule) → new records booking doors (server-only data source)",
  "features/data-tables/data-source/record-store-grid.ts":
    "move: migrate_retype → RecordsClient.migrateRetype (exists); view_keys → new door viewKeys",
  "features/data-tables/service.ts":
    "ready to move: table_list_everywhere → RecordsClient.tableListEverywhere",
  "features/esign/service.ts":
    "move: sign_request_public → new records door signRequestPublic (server-only data source)",
  "features/files/webhooks/service.ts":
    "ready to move: table_webhook_declare → RecordsClient.tableWebhookDeclare",
  "features/forms/service.ts":
    "move: public form lane (form_public/_asks/_submit/_draft_read/_draft_save) → new records form doors (server-only data source)",
  "features/matrx-envelope/referenceResolvers.ts":
    "move: where_id_opens → new records door whereIdOpens",
  "features/organizations/service/organizationStoreContents.ts":
    "move: organization_contents/organization_clear → new records doors organizationContents/organizationClear",
  "features/portals/portalInviteService.ts":
    "move: portal_invite_accept/portal_share_peek → new records doors portalInviteAccept/portalSharePeek",
  "features/portals/service.ts":
    "move: portal lanes → RecordsClient readRecord(s)/recordUpdate/recordHistory/applicableFields/portalForm(Submit) (exist) + new portalPublic/portalInvitation/portalPrincipalBind/portalMe/ioComments/ioCommentWrite",
  "features/record-change-approvals/applyRecordChange.ts":
    "ready to move: work_approval_decide/read_record → RecordsClient.workApprovalDecide/readRecord",
  "features/record-change-approvals/approvalDecision.ts":
    "ready to move: work_approval_read → RecordsClient.workApprovalRead",
  "features/record-change-approvals/HeldWritesOnTable.tsx":
    "ready to move: work_inbox/work_approval_read → RecordsClient.workInbox/workApprovalRead",
  "features/scheduling/hooks/useArchivedWatchTriggers.ts":
    "ready to move: table_list_everywhere → RecordsClient.tableListEverywhere",
  "features/scopes/service/scopesService.ts":
    "ready to move: scope_table_provision → RecordsClient.scopeTableProvision",
  "features/scopes/service/scopeStore.ts":
    "move: scope writes (context_type/scope/item/value_write, archive/restore, template_apply) → new records scope doors (lane SCOPES-ON-THE-STORE)",
  "features/scopes/service/storeScopeReads.ts":
    "move: context_tree_types/context_tree_type_scopes → new records scope read doors",
  "features/sharing/outside/outsideShareService.ts":
    "move: table_share_outside* / table_share_peek → new records share-outside doors",
  "features/sharing/service/tableTransfer.ts":
    "move: table_transfer_owner/member_personal_tables → new records doors tableTransferOwner/memberPersonalTables",
  "features/unified-data/hub/doors.ts":
    "move: data_home/_items/_tables/_changed_by, hub_changed_by, shares_outside → new records data-home doors",
  "features/unified-data/objectOrganization.ts":
    "move: where_id_opens → new records door whereIdOpens",
  "features/unified-data/record-chat/RecordScopedChat.tsx":
    "ready to move: conversation_scope_bind → RecordsClient.conversationScopeBind",
  "features/unified-data/test-bench/TryEverythingScreen.tsx":
    "move: work_inbox → RecordsClient.workInbox (exists); the document and cadence doors → new records doors",
  "lib/knobs/unifiedDataCampaign.register.ts":
    "justified: a register of campaign entry points; its `why` prose quotes store calls, it calls nothing",
  "lib/organizations/linkOrganizationAdmission.ts":
    "move: tables_shared_with_me → new records door tablesSharedWithMe",
  "utils/permissions/registry.ts":
    "justified: the shareable-resource registry declares which schema each type lives in — data, not a call",
  "utils/permissions/service.ts":
    "move: share_lane_set → new records door shareLaneSet",
};

export interface Finding {
  file: string;
  kind: "new" | "stale";
  says: string;
}

export function judge(files: ReadonlyMap<string, string>, allow: Record<string, string> = TOUCHES_THE_STORE): Finding[] {
  const out: Finding[] = [];
  for (const [file, text] of files) {
    if (isTest(file)) continue;
    const shapes = touches(text);
    if (shapes.length && !(file in allow)) {
      out.push({ file, kind: "new", says: `touches custom.* directly (${shapes.join(", ")}) — call a door from @ai-matrx/records instead` });
    }
  }
  for (const file of Object.keys(allow)) {
    const text = files.get(file);
    if (text === undefined || !touches(text).length) {
      out.push({ file, kind: "stale", says: "no longer touches custom.* — remove it from TOUCHES_THE_STORE (the list only shrinks)" });
    }
  }
  return out;
}

function inRoots(f: string): boolean {
  return APP_ROOTS.some((r) => f === r || f.startsWith(`${r}/`));
}

function tree(): Map<string, string> {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter((f) => /\.(tsx?|mts|cts|mjs|cjs|js)$/.test(f) && inRoots(f) && !f.includes("node_modules/"));
  const files = new Map<string, string>();
  for (const f of listed) {
    try {
      files.set(f, readFileSync(join(REPO, f), "utf8"));
    } catch {
      // Listed by git but deleted in the working tree.
    }
  }
  return files;
}

function selfTest(): void {
  const base = tree();
  const green = judge(base);
  if (green.length) throw new Error(`self-test needs a green tree first:\n${green.map((f) => `  ${f.file}: ${f.says}`).join("\n")}`);
  const plants: Array<[string, string]> = [
    ["features/planted/switch.ts", 'export const read = (c: any) => c.schema("custom").rpc("record_list", {});'],
    ["features/planted/option.ts", 'export const read = (c: any) => c.rpc("view_keys", {}, { schema: "custom" });'],
    ["features/planted/constant.ts", 'const STORE_SCHEMA = "custom";\nexport const read = (c: any) => c.schema(STORE_SCHEMA);'],
    ["app/api/planted/route.ts", "export const sql = `select id from custom.record where table_id = $1`;"],
  ];
  for (const [file, text] of plants) {
    const planted = new Map(base);
    planted.set(file, text);
    const red = judge(planted).find((f) => f.file === file && f.kind === "new");
    if (!red) throw new Error(`a planted direct touch did not fail: ${file}`);
    console.log(`  RED (in memory) [${red.kind}] ${red.file} — ${red.says}`);
  }
  const commentOnly = new Map(base);
  commentOnly.set("features/planted/comment.ts", '// Schema `custom` is revoked from anon; reads go from custom.record through a door.\nexport const x = 1;');
  if (judge(commentOnly).length) throw new Error("a comment alone was read as a touch");
  const test = new Map(base);
  test.set("features/planted/__tests__/x.test.ts", 'c.schema("custom");');
  if (judge(test).length) throw new Error("a test file was judged");
  const first = Object.keys(TOUCHES_THE_STORE)[0];
  if (first) {
    const moved = new Map(base);
    moved.set(first, 'import { listRecords } from "@ai-matrx/records";\nexport const read = listRecords;');
    const stale = judge(moved).find((f) => f.file === first && f.kind === "stale");
    if (!stale) throw new Error("a moved file did not fail as stale");
    console.log(`  RED (in memory) [${stale.kind}] ${stale.file} — ${stale.says}`);
  }
  console.log(`✓ self-test: ${plants.length} planted direct touches fail, a comment and a test do not, a moved file fails as stale; the tree is green`);
}

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) {
  selfTest();
} else if (argv.includes("--list")) {
  for (const [file, text] of tree()) {
    if (isTest(file)) continue;
    const shapes = touches(text);
    if (shapes.length) console.log(`${file}\t${shapes.join(",")}`);
  }
} else {
  const findings = judge(tree());
  if (findings.length) {
    console.log(`✗ ${findings.length} file(s) break "apps never write their own custom-data code":`);
    for (const f of findings) console.log(`    [${f.kind}] ${f.file} — ${f.says}`);
    process.exit(1);
  }
  console.log(`✓ no app file touches custom.* directly beyond the ${Object.keys(TOUCHES_THE_STORE).length} the census lists`);
}
