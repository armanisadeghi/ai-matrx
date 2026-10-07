/**
 * THE durable-id seam (@ai-matrx/kit/ids).
 *
 * 1. Behavior: every id the stream mints for a record the database never saw
 *    answers "no durable id"; a real row id passes through unchanged.
 * 2. Census: client-temp ids are minted ONLY through `mintClientTempId`. A
 *    hand-built `client-assistant-…` template elsewhere is a second door into
 *    the class (an id `durableRecordId` might not recognise). The census reads
 *    the source tree and fails on any new member; its self-test proves the
 *    pattern catches the exact template process-stream used before 2026-10-01.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  CLIENT_TEMP_ID_PREFIX,
  durableRecordId,
  isClientTempId,
  mintClientTempId,
} from "@ai-matrx/kit/ids";

describe("durableRecordId", () => {
  it.each([
    mintClientTempId("assistant", "req_e61282d2-70ce-45f9-bac3-ebbd3f78d7e1"),
    mintClientTempId(
      "assistant",
      "req_4f0b9c1e-2d3a-4c5b-9e8f-7a6b5c4d3e2f",
      "iter2",
    ),
    mintClientTempId("tool-call", "toolu_01H8ZQ"),
    "",
    null,
    undefined,
  ])("answers null for %p", (id) => {
    expect(durableRecordId(id)).toBeNull();
  });

  it.each([
    "263550e7-eb60-4e8e-97ee-e19297126ebe",
    "993b734d-bd03-45bb-9bdd-0458025c89fb",
  ])("passes the row id %s through", (id) => {
    expect(durableRecordId(id)).toBe(id);
  });

  it("marks what it mints as client-temp, and a row id as not", () => {
    expect(isClientTempId(mintClientTempId("assistant", "req_1"))).toBe(true);
    expect(isClientTempId("263550e7-eb60-4e8e-97ee-e19297126ebe")).toBe(false);
  });
});

// ── Census ────────────────────────────────────────────────────────────────

const REPO = join(__dirname, "..", "..");
const ROOTS = ["features", "../aidream/apps/shared/chat/src", "lib", "components", "app", "hooks", "providers", "utils"];
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "test-utils"]);
const THIS_SEAM = join("lib", "ids", "durable-record-id.ts");

/** Rule A — a literal that hand-builds a client-temp record id. */
const HAND_BUILT_TEMP_ID = new RegExp(
  `[\`"']${CLIENT_TEMP_ID_PREFIX}(assistant|tool-call|user|inbox|message)-`,
);

/**
 * Rule B — a message id minted from a literal template (`inbox_${…}`,
 * `msg-${…}`): non-UUID ids must come from `mintClientTempId`. `tempId` /
 * `dbId` count only in the execution system, where they name message rows.
 */
const LITERAL_MESSAGE_ID = /\b(clientTempId|messageId)\s*[:=]\s*[`"'][^`"']/;
const LITERAL_EXEC_TEMP_ID = /\b(tempId|dbId)\s*[:=]\s*[`"'][^`"']/;
const EXEC_SYSTEM = join("features", "agents", "redux");

/**
 * Rule C — a chat message id handed to a DATABASE key (an RPC argument, a
 * provenance column, an association end, a `.eq`/`.in` filter). A file that
 * does this must go through `durableRecordId`, or sit in the reviewed
 * baseline below with the reason its ids are always durable. The baseline
 * only shrinks: a stale entry fails too.
 */
const MESSAGE_ID_TO_DB_KEY =
  /\b(p_message_id|p_source_message_id|source_message_id|sourceMessageId|producedByMessageId|message_id|p_source_id|source_id|entity_id|entityId)\b\s*[:=]\s*\{?\s*[\w.?]*\bmessageId\b/;
const MESSAGE_ID_DB_FILTER =
  /\.(eq|in)\(\s*["'](id|message_id|source_id|entity_id)["']\s*,\s*[\w.?]*messageId\b/;

const CANVAS_KEY =
  "canvas metadata: the transcript key de-duplicates canvas items locally; every canvas DB write goes through ensureArtifactPersisted / materializeBlocks, gated by isRealSourceId (= durableRecordId)";
const NOT_A_DB_KEY = "names the message in agent context JSON, not a database key";
const DB_ORIGIN = "message ids here come from database rows, never the live transcript";
const OTHER_MESSAGE = "a different 'message' (email / SMS / Google), not a chat message";
const SERVER_ROUTE =
  "server route keyed by the caller's id; every client caller is guarded at its own door";

const RULE_C_BASELINE: Record<string, string> = {
  "app/(dev)/demos/tasks-widgets/_client.tsx": "dev demo with fixed fixture ids",
  "app/api/artifacts/route.ts": SERVER_ROUTE,
  "app/api/feedback/user-review-notify/route.ts": SERVER_ROUTE,
  "app/api/messages/[conversationId]/messages/[id]/route.ts": SERVER_ROUTE,
  "components/mardown-display/blocks/artifact/ArtifactBlock.tsx": CANVAS_KEY,
  "components/mardown-display/blocks/diagram/InteractiveDiagramBlock.tsx": CANVAS_KEY,
  "components/mardown-display/blocks/mermaid/MermaidBlock.tsx": CANVAS_KEY,
  "features/canvas/hooks/useOpenArtifactInCanvas.ts": CANVAS_KEY,
  "features/html-pages/components/HtmlInlinePreview.tsx":
    "publishes only through HTMLPageService.createPage, which applies durableRecordId to sourceMessageId",
  "features/canvas/services/canvasArtifactService.ts":
    "called only by ensureArtifactPersisted / materializeBlocks after isRealSourceId (= durableRecordId), or with ids read from canvas rows",
  "features/canvas/artifact-types/persistence/flashcards-canonical-adapter.ts": DB_ORIGIN,
  "features/artifacts/lib/artifacts-scope.ts": DB_ORIGIN,
  "features/canvas/materialization/materializeMessageArtifacts.ts":
    "materializes only server-reserved message ids (process-stream materializeTargets)",
  "features/agents/decision-review/service.ts": DB_ORIGIN,
  "features/masterwork/oracle/service.ts":
    "Rulebook capture: capture.ts passes durableRecordId(messageId)",
  "../aidream/apps/shared/chat/src/agents/components/messages-display/assistant/AssistantMessageFooter.tsx":
    NOT_A_DB_KEY,
  "features/context-menu-v3/utils/resolveMarkdownContext.ts": NOT_A_DB_KEY,
  "features/rich-document/actions/handlers/ask.ts": NOT_A_DB_KEY,
  "features/tasks/widgets/TaskTapButton.tsx": "usage example inside a doc comment",
  "features/crm/gmail/reviewed-send-contract.ts": OTHER_MESSAGE,
  "features/marketing/google/service.ts": OTHER_MESSAGE,
  "lib/sms/receive.ts": OTHER_MESSAGE,
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|js)$/.test(name) && !/\.test\.(ts|tsx|js)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function isComment(line: string): boolean {
  return /^\s*(\/\/|\*|\/\*)/.test(line);
}

/** Rules A + B over one file's text; returns offending 1-based line numbers. */
function mintOffenses(rel: string, text: string): number[] {
  const hits: number[] = [];
  text.split("\n").forEach((line, i) => {
    if (isComment(line)) return;
    if (
      HAND_BUILT_TEMP_ID.test(line) ||
      LITERAL_MESSAGE_ID.test(line) ||
      (rel.startsWith(EXEC_SYSTEM) && LITERAL_EXEC_TEMP_ID.test(line))
    ) {
      hits.push(i + 1);
    }
  });
  return hits;
}

/** Rule C over one file's text: does it hand a message id to the DB unguarded? */
function dbKeyOffense(text: string): boolean {
  if (/\bdurableRecordId\b/.test(text)) return false;
  return text
    .split("\n")
    .some((line) => MESSAGE_ID_TO_DB_KEY.test(line) || MESSAGE_ID_DB_FILTER.test(line));
}

/**
 * Rule D — the two fields never cross: a `durableMessageId` is never fed the
 * transcript key (`durableMessageId={messageId}`). The only producer is
 * `durableRecordId(...)`.
 */
const TRANSCRIPT_KEY_AS_DURABLE = /\bdurableMessageId\s*[=:]\s*\{?\s*(messageId|transcriptMessageId)\b/;

const ALL_FILES = ROOTS.flatMap((root) => sourceFiles(join(REPO, root))).map(
  (file) => ({ rel: relative(REPO, file), text: readFileSync(file, "utf8") }),
);

describe("client-temp id census", () => {
  it("self-test: rules A and B catch every pre-2026-10-01 hand-built id", () => {
    const planted = [
      "    const tempId = `client-assistant-${requestId}`;",
      '        dbId = "client-tool-call-" + callId;',
      "          const tempId = `inbox_${item.injection_id}`;",
      "    clientTempId: `msg-${Date.now()}`,",
    ];
    for (const line of planted) {
      expect(mintOffenses("features/agents/redux/x.ts", line)).toEqual([1]);
    }
    expect(
      mintOffenses(
        "features/agents/redux/x.ts",
        'const tempId = mintClientTempId("inbox", item.injection_id);',
      ),
    ).toEqual([]);
  });

  it("self-test: rule C catches the shapes the 2026-10-01 re-verify found", () => {
    // kind-record-service: the produced_by read on platform.associations.
    expect(dbKeyOffense('      .eq("source_id", args.messageId)')).toBe(true);
    // store-kind-record: the produced_by edge write.
    expect(dbKeyOffense("      p_source_id: args.messageId,")).toBe(true);
    // TasksBlock: the task association end.
    expect(dbKeyOffense("            entityId={messageId}")).toBe(true);
    // html publish provenance.
    expect(dbKeyOffense("      sourceMessageId: messageId ?? undefined,")).toBe(true);
    // Guarded through the seam: not an offense.
    expect(
      dbKeyOffense(
        'const id = durableRecordId(messageId);\n      .eq("source_id", args.messageId)',
      ),
    ).toBe(false);
  });

  it("self-test: rule D catches the transcript key fed into the durable field", () => {
    expect(TRANSCRIPT_KEY_AS_DURABLE.test("          durableMessageId={messageId}")).toBe(true);
    expect(TRANSCRIPT_KEY_AS_DURABLE.test("    durableMessageId: messageId,")).toBe(true);
    expect(
      TRANSCRIPT_KEY_AS_DURABLE.test(
        "  const durableMessageId = durableRecordId(messageId) ?? undefined;",
      ),
    ).toBe(false);
  });

  it("no durable-id field is fed the transcript key (rule D)", () => {
    const offenders: string[] = [];
    for (const { rel, text } of ALL_FILES) {
      text.split("\n").forEach((line, i) => {
        if (!isComment(line) && TRANSCRIPT_KEY_AS_DURABLE.test(line)) {
          offenders.push(`${rel}:${i + 1}`);
        }
      });
    }
    // Remedy: pass durableRecordId(messageId) ?? undefined (or ctx.durableMessageId).
    expect(offenders).toEqual([]);
  });

  it("no source file mints a message id outside the seam (rules A + B)", () => {
    const offenders: string[] = [];
    for (const { rel, text } of ALL_FILES) {
      if (rel === THIS_SEAM) continue;
      for (const line of mintOffenses(rel, text)) offenders.push(`${rel}:${line}`);
    }
    // Remedy: mint through mintClientTempId (@ai-matrx/kit/ids).
    expect(offenders).toEqual([]);
  });

  it("no message id reaches a database key without the seam (rule C)", () => {
    const offenders = ALL_FILES.filter(({ text }) => dbKeyOffense(text)).map(
      ({ rel }) => rel,
    );
    const unreviewed = offenders.filter((rel) => !(rel in RULE_C_BASELINE));
    // Remedy: pass durableRecordId(messageId) at the DB key, or — only when the
    // ids there are durable by construction — add the file with its reason.
    expect(unreviewed).toEqual([]);
    const stale = Object.keys(RULE_C_BASELINE).filter((rel) => !offenders.includes(rel));
    // A baseline entry that no longer offends is deleted (the list only shrinks).
    expect(stale).toEqual([]);
  });
});
