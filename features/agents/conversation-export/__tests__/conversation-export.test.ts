/**
 * The WHOLE conversation as ONE Alchemy source (Arman, 2026-09-26: the
 * Conversation menu shows "a full alchemy set for it, including the export for
 * ai"). The transcript Markdown is the one prose source every format is built
 * from; JSON is the structured twin (the ordered messages with roles); PDF,
 * Word and EPUB carry the page chrome; bytes come from @ai-matrx/alchemy's one
 * engine per format (print for documents) — the app builds no document itself.
 *
 * THE USE CASE: a pool-service owner finishes a long planning chat with the
 * assistant and downloads it as Word for her crew; every message she and the
 * assistant wrote must be in the file, in order, under who said it.
 *
 * Break it names: a format built from a second source (JSON from Markdown,
 * documents without chrome) → "payload" red; a Word file missing a message or
 * its speaker → "every message" red; the old app-side engine back → "one
 * engine" red; the header and the answer menu offering different rows →
 * "one catalogue" red.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { buildConversationMarkdown } from "../conversation-markdown";
import {
  conversationDocumentSource,
  conversationFromState,
  conversationPayloadFor,
  conversationSections,
} from "../conversation-transfer";
import { CONVERSATION_TRANSFER_ROWS } from "../conversation-transfer-rows";

jest.mock("@/lib/toast", () => ({
  toast: { loading: jest.fn(() => "t"), success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));
jest.mock("@/features/agents/redux/execution-system/messages/messages.selectors", () => ({
  extractFlatText: (r: { text: string }) => r.text,
}));
jest.mock("@/features/agents/redux/execution-system/conversations/conversations.selectors", () => ({
  selectConversationTitle: () => () => "Pool route plan",
}));
jest.mock("../load-full-history", () => ({
  loadFullConversationHistory: async () => ({ complete: true, loaded: 4 }),
}));
jest.mock("@/features/agents/message-pins/pinned-messages-store", () => ({
  isMessagePinned: (id: string) => id === "m2",
}));
jest.mock("@/components/agent-copy/alchemy-session", () => ({ openAlchemySession: jest.fn(() => true) }));

const MESSAGES = [
  { id: "m1", role: "user", text: "Plan Tuesday's pool route for the Irvine crew.", createdAt: "2026-09-25T09:00:00Z" },
  { id: "m2", role: "assistant", text: "| Stop | Pool |\n|---|---|\n| 1 | Chen residence |\n| 2 | Oakwood HOA |", createdAt: "2026-09-25T09:00:05Z" },
  { id: "m3", role: "user", text: "Move Oakwood HOA before lunch and add a chlorine check.", createdAt: "2026-09-25T09:01:00Z" },
  { id: "m4", role: "assistant", text: 'Done — Oakwood is stop 1.\n\n<!--MATRX_TRUST_V1 {"confidence":"inferred","groundedIn":"none","citations":[]}-->', createdAt: null },
  { id: "sys", role: "system", text: "hidden system prompt", createdAt: null },
];

function state() {
  return {
    messages: {
      byConversationId: {
        c1: {
          orderedIds: MESSAGES.map((m) => m.id),
          byId: Object.fromEntries(MESSAGES.map((m) => [m.id, m])),
        },
      },
    },
  } as never;
}

describe("buildConversationMarkdown", () => {
  it("writes a titled transcript with one section per turn", () => {
    const md = buildConversationMarkdown({
      title: "Quarterly plan",
      exportedAt: new Date("2026-09-25T10:00:00Z"),
      messages: [
        { role: "user", text: "What changed in Q3?", createdAt: "2026-09-25T09:00:00Z" },
        { role: "assistant", text: "| Month | Rev |\n|---|---|\n| Jul | 10 |", createdAt: null },
        { role: "assistant", text: "   " },
        { role: "system", text: "hidden system prompt" },
      ],
      assistantLabel: "Analyst",
    });
    expect(md.startsWith("# Quarterly plan\n")).toBe(true);
    expect(md).toContain("## You");
    expect(md).toContain("## Analyst");
    expect(md).not.toContain("hidden system prompt");
    expect(md.match(/## Analyst/g)).toHaveLength(1);
  });

  it("marks pinned messages so a reader sees what mattered", () => {
    const md = buildConversationMarkdown({ title: "t", messages: [{ role: "assistant", text: "Keep this", pinned: true }] });
    expect(md).toContain("## Assistant (pinned)");
  });
});

describe("the conversation is ONE source; each format reads the right representation (payload)", () => {
  const conv = conversationFromState(state(), "c1");

  it("holds the ordered messages with their roles — never the system prompt", () => {
    expect(conv.messages.map((m) => [m.role, m.author])).toEqual([
      ["user", "You"],
      ["assistant", "Assistant"],
      ["user", "You"],
      ["assistant", "Assistant"],
    ]);
    expect(conv.messages[1]?.pinned).toBe(true);
    expect(conv.markdown).not.toContain("hidden system prompt");
    // Storage plumbing never reaches a reader (live: a tutor answer's trust comment did).
    expect(conv.markdown).not.toContain("MATRX_TRUST_V1");
    expect(conv.messages[3]?.text).toBe("Done — Oakwood is stop 1.");
    expect(conv.fileBase).toBe("Pool-route-plan");
  });

  it("JSON is the structured twin; prose formats are the transcript; documents carry the page chrome", () => {
    const json = conversationPayloadFor(conv, "json");
    if (json.kind !== "json") throw new Error(`expected a JSON payload, got ${json.kind}`);
    const value = json.value as { messages: { role: string }[] };
    expect(value.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    for (const f of ["plain", "markdown", "rich-html"]) {
      expect(conversationPayloadFor(conv, f)).toEqual({ kind: "markdown", text: conv.markdown });
    }
    for (const f of ["pdf", "docx", "epub"]) {
      const p = conversationPayloadFor(conv, f) as { text: string };
      expect(p.text).toMatch(/^---\ntitle: "Pool route plan"/);
      expect(p.text).toContain('footer: "Page {page} of {pages}"');
    }
    const html = conversationPayloadFor(conv, "html") as { text: string };
    expect(html.text.startsWith("# Pool route plan")).toBe(true);
  });

  it("a partial history says so at the top — never passed off as the whole conversation", () => {
    expect(conversationFromState(state(), "c1", false).markdown).toMatch(/^# Pool route plan\n\n> Earlier messages could not be loaded/);
  });

  it("offers one section per message so the preparation workspace can choose messages", () => {
    const sections = conversationSections(conv);
    expect(sections.map((s) => s.path)).toEqual(["/messages/0", "/messages/1", "/messages/2", "/messages/3"]);
    expect(sections[0]?.label).toMatch(/^1\. You: Plan Tuesday/);
  });

  it("gives the transcript page chrome without touching the markdown", () => {
    const src = conversationDocumentSource("# T\n\nbody\n", 'Plan "A"');
    expect(src).toContain('title: "Plan \'A\'"');
    expect(src.endsWith("# T\n\nbody\n")).toBe(true);
  });
});

describe("every message reaches the file (the one Alchemy engine, real print)", () => {
  it("Word: every message and its speaker, in order, with a real table", async () => {
    const conv = conversationFromState(state(), "c1");
    const { capture, createDraft, sealDraft } = await import("@ai-matrx/alchemy/operate");
    const signal = new AbortController().signal;
    const { snapshot } = await capture(conversationPayloadFor(conv, "docx"), signal);
    const artifact = await sealDraft(createDraft(snapshot), "docx", { filename: `${conv.fileBase}.docx` }, signal);
    expect(artifact.file?.filename).toBe("Pool-route-plan.docx");
    const zip = await JSZip.loadAsync(artifact.file!.bytes);
    const doc = await zip.file("word/document.xml")!.async("string");
    const text = doc.replace(/<[^>]+>/g, "");
    const at = (s: string) => text.indexOf(s);
    expect(at("Plan Tuesday")).toBeGreaterThan(-1);
    expect(at("Chen residence")).toBeGreaterThan(at("Plan Tuesday"));
    expect(at("Move Oakwood HOA before lunch")).toBeGreaterThan(at("Chen residence"));
    expect(text).toContain("Assistant (pinned)");
    expect(doc).toMatch(/<w:tbl[ >]/);
    expect(text).not.toContain("hidden system prompt");
  }, 60_000);
});

describe("one catalogue, one engine", () => {
  const root = join(__dirname, "..", "..", "..", "..");

  it("the old app-side conversation engine is gone", () => {
    expect(existsSync(join(root, "features/agents/conversation-export/export-conversation.ts"))).toBe(false);
  });

  it("the header menu and the answer menu both render THE catalogue", () => {
    const header = readFileSync(join(root, "features/agents/components/chat/ConversationPageMenu.tsx"), "utf8");
    const answer = readFileSync(join(root, "features/rich-document/actions/handlers/conversation-section.ts"), "utf8");
    for (const src of [header, answer]) expect(src).toContain("CONVERSATION_TRANSFER_ROWS");
  });

  it("the catalogue is the full set: copy ×3, Copy for AI, seven downloads, five destinations", () => {
    const by = (g: string) => CONVERSATION_TRANSFER_ROWS.filter((r) => r.group === g);
    expect(by("copy").map((r) => (r as { format: string }).format)).toEqual(["plain", "markdown", "rich-html"]);
    expect(by("prepare")).toHaveLength(1);
    expect(by("download").map((r) => (r as { format: string }).format)).toEqual(["plain", "markdown", "html", "json", "pdf", "docx", "epub"]);
    expect(by("send").map((r) => (r as { destination: string }).destination)).toEqual([
      "matrx:notes",
      "matrx:document",
      "matrx:task",
      "matrx:chat",
      "email-markdown",
    ]);
  });
});
