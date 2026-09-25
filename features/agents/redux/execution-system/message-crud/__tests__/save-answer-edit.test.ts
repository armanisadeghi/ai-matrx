/**
 * RC-B5 — the chat-message save adapter.
 *
 * Forcing functions:
 *   - byte-exactness: the row written by `cx_message_edit` equals the stored
 *     parts with ONLY the edited text segment changed — tool calls, kind
 *     payloads, thinking, citations and sibling text segments are the same
 *     values, in the same order;
 *   - a no-op save calls no RPC at all (no history entry, no status flip);
 *   - the projection the editor opens on is exactly `extractFlatText`.
 * Red against the replaced path (`buildContentBlocksForSave` merges every
 * text segment into one; the rich-document chat adapter wrapped the whole
 * answer as a single text part and dropped the tool call).
 */

import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { hydrateMessages, type MessageRecord } from "../../messages/messages.slice";
import { extractFlatText } from "../../messages/messages.selectors";
import { saveAnswerEdit, saveMessageDisplayEdit } from "../save-answer-edit.thunk";
import { chatMessageAdapter } from "@/features/rich-document/actions/sources/chat-message";
import { projectAnswerText, spliceAnswerText, spliceDisplayEdit } from "../answer-text-splice";
import { commitInlineContentEdit, flushPendingInlineEdit } from "../commit-inline-edit.thunk";
import { removeThinkingContent } from "@ai-matrx/print/markdown";
import { listIslands, tokenizeSource } from "@ai-matrx/content-ir/source";
import { planSave } from "@/components/rich-editor/core/save-plan";

const rpc = jest.fn();
const rpcReturns = jest.fn();
/** What the DATABASE row holds — the adapter's truth (null = same as the Redux record). */
let dbContent: unknown = null;
let reduxContent: unknown = null;

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => {
      rpc(...args);
      return { returns: rpcReturns };
    },
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { content: dbContent ?? reduxContent }, error: null }),
          }),
        }),
      }),
    }),
  },
}));

jest.mock("../invalidate-conversation-cache.thunk", () => ({
  invalidateConversationCache: () => ({ type: "test/invalidate-cache" }),
}));

jest.mock("@/lib/output-feedback/service", () => ({
  saveOutputFeedback: jest.fn(async () => undefined),
}));

const CONVERSATION_ID = "c-rc-b5";
const MESSAGE_ID = "m-rc-b5";

// A real answer shape: thinking, two cited text segments, a tool call between
// paragraphs, a kind payload in a fence, a math block.
const STORED = [
  { type: "thinking", text: "The user wants the boiling point by altitude." },
  {
    type: "text",
    text: "Water boils at 100 °C at sea level",
    citations: [{ url: "https://example.org/boiling", cited_text: "100 °C" }],
  },
  { type: "text", text: ", and lower at altitude.\n\n## Why\n\nPressure drops as you climb." },
  { type: "tool_call", id: "call-1", name: "unit_convert", arguments: { value: 100, from: "C", to: "F" } },
  {
    type: "text",
    text: 'That is 212 °F.\n\n$$T_b \\approx 100 - \\frac{h}{300}$$\n\n```json\n{"__kind":"key_value","items":[{"key":"Sea level","value":"100 °C"}]}\n```',
    metadata: { __ir: { version: 1 } },
  },
];

function record(content: unknown = STORED): MessageRecord {
  return {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    agentId: null,
    role: "assistant",
    content: structuredClone(content) as MessageRecord["content"],
    contentHistory: null,
    userContent: null,
    position: 2,
    source: "server",
    status: "active",
    isVisibleToModel: true,
    isVisibleToUser: true,
    metadata: {},
    createdAt: "2026-09-25T00:00:00.000Z",
    deletedAt: null,
    _clientStatus: "complete",
  };
}

function store(content?: unknown) {
  reduxContent = structuredClone(content ?? STORED);
  const s = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
  s.dispatch(hydrateMessages({ conversationId: CONVERSATION_ID, messages: [record(content)] }));
  return s;
}

beforeEach(() => {
  dbContent = null;
  rpc.mockReset();
  rpcReturns.mockReset();
  rpcReturns.mockImplementation(async () => {
    const [, args] = rpc.mock.calls[rpc.mock.calls.length - 1] as [string, { p_new_content: unknown }];
    return {
      data: {
        ...{ content: args.p_new_content, content_history: [{ content: STORED }] },
        user_content: null,
        status: "edited",
        agent_id: null,
        metadata: {},
        is_visible_to_model: true,
        is_visible_to_user: true,
      },
      error: null,
    };
  });
});

describe("answer projection", () => {
  test("is the stored bytes; the view is the same text with its display scrub", () => {
    expect(removeThinkingContent(projectAnswerText(STORED).text)).toBe(extractFlatText(record()));
  });

  test("keeps the bytes the view normalizes, so a one-word edit rewrites nothing else", async () => {
    const stored = [
      { type: "text", text: "Step one.\n\n\n## Next\n\nStep two.  \n" },
    ];
    // The display projection collapses the blank-line run and trims — writing
    // THAT back (the replaced path) silently rewrote untouched bytes.
    expect(extractFlatText(record(stored))).toBe("Step one.\n\n## Next\n\nStep two.");
    const s = store(stored);
    const edited = projectAnswerText(stored).text.replace("Step two", "Step 2");
    await s
      .dispatch(saveAnswerEdit({ conversationId: CONVERSATION_ID, messageId: MESSAGE_ID, newText: edited }))
      .unwrap();
    const [, args] = rpc.mock.calls[0] as [string, { p_new_content: unknown }];
    expect(args.p_new_content).toEqual([{ type: "text", text: "Step one.\n\n\n## Next\n\nStep 2.  \n" }]);
  });
});

describe("saveAnswerEdit — byte-exact splice", () => {
  test("a one-paragraph edit changes only that text segment", async () => {
    const s = store();
    const before = projectAnswerText(STORED).text;
    const edited = before.replace("Pressure drops as you climb.", "Air pressure falls as you climb.");
    const result = await s
      .dispatch(saveAnswerEdit({ conversationId: CONVERSATION_ID, messageId: MESSAGE_ID, newText: edited }))
      .unwrap();

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as [string, { p_message_id: string; p_new_content: unknown[] }];
    expect(fn).toBe("cx_message_edit");
    expect(args.p_message_id).toBe(MESSAGE_ID);
    const expected = structuredClone(STORED) as Array<Record<string, unknown>>;
    expected[2] = { ...expected[2], text: ", and lower at altitude.\n\n## Why\n\nAir pressure falls as you climb." };
    expect(args.p_new_content).toEqual(expected);
    expect(JSON.stringify(args.p_new_content)).toBe(JSON.stringify(expected));
    expect(result).toEqual({ written: true, storedText: edited });
  });

  test("an edit inside the cited segment keeps its citations and every other part", () => {
    const before = projectAnswerText(STORED).text;
    const plan = spliceAnswerText(STORED, before.replace("at sea level", "at sea-level pressure"));
    expect(plan.changed).toBe(true);
    const next = (plan as { content: Array<Record<string, unknown>> }).content;
    expect(next).toHaveLength(STORED.length);
    expect(next[1]).toEqual({ ...STORED[1], text: "Water boils at 100 °C at sea-level pressure" });
    for (const i of [0, 2, 3, 4]) expect(next[i]).toBe(STORED[i]);
  });

  test("an edit that retypes protected content inside a text part is still byte-placed", () => {
    const before = projectAnswerText(STORED).text;
    const plan = spliceAnswerText(STORED, before.replace("212 °F", "212 degrees Fahrenheit"));
    const next = (plan as { content: Array<Record<string, unknown>> }).content;
    expect(projectAnswerText(next).text).toBe(before.replace("212 °F", "212 degrees Fahrenheit"));
    expect(next[3]).toBe(STORED[3]);
    expect(next[4].metadata).toBe(STORED[4].metadata);
  });

  test("text owned by a non-text part, and the breaks around it, are refused — never guessed", () => {
    const withResult = [
      { type: "text", text: "Here is what the search returned:" },
      { type: "tool_result", tool_use_id: "call-2", text: "3 results" },
      { type: "text", text: "The first one is the best match." },
    ];
    const before = projectAnswerText(withResult).text;
    expect(before).toBe("Here is what the search returned:\n3 results\nThe first one is the best match.");

    const intoResult = spliceAnswerText(withResult, before.replace("3 results", "4 results"));
    expect(intoResult.changed).toBe(false);
    expect("error" in intoResult ? intoResult.error : "").toMatch(/not text/);

    const acrossBreak = spliceAnswerText(withResult, before.replace("returned:\n3", "returned: 3"));
    expect(acrossBreak.changed).toBe(false);
    expect("error" in acrossBreak ? acrossBreak.error : "").toMatch(/line break|not text/);

    const ok = spliceAnswerText(withResult, before.replace("best match", "closest match"));
    expect(ok.changed).toBe(true);
    const next = (ok as { content: unknown[] }).content;
    expect(next[0]).toBe(withResult[0]);
    expect(next[1]).toBe(withResult[1]);
    expect(next[2]).toEqual({ type: "text", text: "The first one is the closest match." });
  });
});

describe("saveAnswerEdit — a no-op save writes nothing", () => {
  test("unchanged text calls no RPC and reports the stored text", async () => {
    const s = store();
    const result = await s
      .dispatch(
        saveAnswerEdit({
          conversationId: CONVERSATION_ID,
          messageId: MESSAGE_ID,
          newText: projectAnswerText(STORED).text,
        }),
      )
      .unwrap();
    expect(rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ written: false, storedText: projectAnswerText(STORED).text });
    const row = s.getState().messages.byConversationId[CONVERSATION_ID].byId[MESSAGE_ID];
    expect(row.status).toBe("active");
  });
});

describe("an answer with inline reasoning edits in place — the reasoning is a locked island", () => {
  const withReasoning = [
    {
      type: "text",
      text: "<thinking>\nThe shop cares about cash flow more than total interest.\n</thinking>\n\nTake the 5-year term if cash is tight.",
    },
  ];

  test("the stored reasoning section is an island the editor locks", () => {
    const stored = projectAnswerText(withReasoning).text;
    const islands = listIslands(tokenizeSource(stored)).map((island) => island.raw);
    expect(islands.some((raw) => raw.startsWith("<thinking>") && raw.includes("cash flow"))).toBe(true);
  });

  test("an edit beside it saves without consent and writes the reasoning back verbatim", async () => {
    const stored = projectAnswerText(withReasoning).text;
    const edited = stored.replace("if cash is tight", "if monthly cash is tight");
    const plan = planSave(stored, edited);
    expect(plan.changed).toBe(true);
    expect(plan.needsConsent).toEqual([]);
    const s = store(withReasoning);
    await s
      .dispatch(saveAnswerEdit({ conversationId: CONVERSATION_ID, messageId: MESSAGE_ID, newText: plan.text }))
      .unwrap();
    const [, args] = rpc.mock.calls[0] as [string, { p_new_content: Array<{ text: string }> }];
    expect(args.p_new_content[0].text).toBe(
      "<thinking>\nThe shop cares about cash flow more than total interest.\n</thinking>\n\nTake the 5-year term if monthly cash is tight.",
    );
  });
});

describe("the database row is the truth, not the loaded Redux copy", () => {
  // Live 2026-09-25: an answer streamed this session is committed client-side
  // as ONE text part with inline <reasoning>; the server stored a thinking
  // part + a text part. Splicing against Redux wrote the client shape over the
  // row and dropped the thinking part.
  const serverRow = [
    { type: "thinking", text: "Checking the scheduler table." },
    { type: "text", text: "I re-ran the query just now. There are 97 live tasks." },
  ];
  const clientCopy = [
    { type: "text", text: "\n<reasoning>\nChecking the scheduler table.\n</reasoning>\n\nI re-ran the query just now. There are 97 live tasks." },
  ];

  test("the splice is computed on the stored parts", async () => {
    const s = store(clientCopy);
    dbContent = serverRow;
    const opened = projectAnswerText(serverRow).text;
    await s
      .dispatch(
        saveAnswerEdit({
          conversationId: CONVERSATION_ID,
          messageId: MESSAGE_ID,
          newText: opened.replace("re-ran the query", "ran the query again"),
          openedText: opened,
        }),
      )
      .unwrap();
    const [, args] = rpc.mock.calls[0] as [string, { p_new_content: unknown }];
    expect(args.p_new_content).toEqual([
      serverRow[0],
      { type: "text", text: "I ran the query again just now. There are 97 live tasks." },
    ]);
  });

  test("a row that changed since the editor opened is refused, nothing written", async () => {
    const s = store(serverRow);
    const opened = projectAnswerText(serverRow).text;
    dbContent = [serverRow[0], { type: "text", text: "Someone else rewrote this answer." }];
    const result = await s.dispatch(
      saveAnswerEdit({
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        newText: opened.replace("97", "98"),
        openedText: opened,
      }),
    );
    expect(saveAnswerEdit.rejected.match(result)).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("in-body edits (code block, table, decision) splice against the STORED text", () => {
  // Stored bytes the view normalizes: a 3-blank-line run, trailing spaces,
  // an inline reasoning section, a trailing newline.
  const storedText =
    "<thinking>\nPick a fast default.\n</thinking>\n\nUse this helper:  \n\n\n\n```python\ndef total(p, r, n):\n    return p * (1 + r) ** n\n```\n\n\n| Term | Rate |  \n|---|---|\n| 5y | 7.5% |\n";
  const stored = [{ type: "text", text: storedText }];

  test("the display text really is normalized (the trap)", () => {
    const display = extractFlatText(record(stored));
    expect(display).not.toContain("\n\n\n");
    expect(display).not.toContain("<thinking>");
    expect(display.endsWith("\n")).toBe(false);
  });

  test("a code-block edit changes only its span; every other stored byte is kept", async () => {
    jest.useFakeTimers();
    try {
      const s = store(stored);
      const display = extractFlatText(record(stored));
      const edited = display.replace("return p * (1 + r) ** n", "return round(p * (1 + r) ** n, 2)");
      s.dispatch(
        commitInlineContentEdit({
          conversationId: CONVERSATION_ID,
          messageId: MESSAGE_ID,
          newText: edited,
          previousText: display,
        }),
      );
      s.dispatch(flushPendingInlineEdit(MESSAGE_ID));
      jest.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(rpc).toHaveBeenCalledTimes(1);
      const [, args] = rpc.mock.calls[0] as [string, { p_new_content: Array<{ text: string }> }];
      expect(args.p_new_content).toEqual([
        { type: "text", text: storedText.replace("return p * (1 + r) ** n", "return round(p * (1 + r) ** n, 2)") },
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  test("a table edit keeps the trailing spaces and blank-line runs around it", () => {
    const display = extractFlatText(record(stored));
    const result = spliceDisplayEdit(storedText, display, display.replace("| 5y | 7.5% |", "| 5y | 7.25% |"));
    expect(result).toEqual({ text: storedText.replace("| 5y | 7.5% |", "| 5y | 7.25% |") });
  });

  test("a display that no longer matches the stored text refuses instead of guessing", () => {
    const result = spliceDisplayEdit(storedText, "Something else entirely.", "Something else, edited.");
    expect("error" in result).toBe(true);
  });
});

describe("every display-text editor saves through the one door (old full-screen editor, HTML preview, adapters)", () => {
  test("an assistant row keeps every stored byte outside the edited span", async () => {
    const storedText = "Intro line.  \n\n\n\nKeep 7.5% APR.\n";
    const s = store([{ type: "text", text: storedText }]);
    const display = extractFlatText(record([{ type: "text", text: storedText }]));
    await saveMessageDisplayEdit(s.dispatch, s.getState, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      previous: display,
      next: display.replace("7.5%", "7.25%"),
    });
    const [, args] = rpc.mock.calls[0] as [string, { p_new_content: unknown }];
    expect(args.p_new_content).toEqual([{ type: "text", text: "Intro line.  \n\n\n\nKeep 7.25% APR.\n" }]);
  });
});

describe("verify-RC-B5 F1: a display-text editor never drops inline reasoning", () => {
  // Row fcf00f0a, live: the old full-screen editor opened on the display text
  // (reasoning scrubbed), "roughly"→"nearly" was saved as the stored answer,
  // and the <thinking> section vanished from the row.
  const tokyo = [
    { type: "thinking", text: "Provider reasoning." },
    {
      type: "text",
      text: "<thinking>check the 2025 figure against the TMG press release</thinking>\nTokyo gained roughly 81,000 residents between 2024 and 2025.",
    },
  ];

  test("through the adapter WITH its base, the reasoning survives and only the word changes", async () => {
    const s = store(tokyo);
    const display = extractFlatText(record(tokyo));
    expect(display).toBe("Tokyo gained roughly 81,000 residents between 2024 and 2025.");
    await chatMessageAdapter.edit!({
      newContent: display.replace("roughly", "nearly"),
      previousContent: display,
      source: { type: "chat-message", conversationId: CONVERSATION_ID, messageId: MESSAGE_ID },
      dispatch: s.dispatch,
    });
    const [, args] = rpc.mock.calls[0] as [string, { p_new_content: unknown }];
    expect(args.p_new_content).toEqual([
      tokyo[0],
      {
        type: "text",
        text: "<thinking>check the 2025 figure against the TMG press release</thinking>\nTokyo gained nearly 81,000 residents between 2024 and 2025.",
      },
    ]);
  });

  test("through the adapter WITHOUT a base (the old side door), nothing is written", async () => {
    const s = store(tokyo);
    const display = extractFlatText(record(tokyo));
    await expect(
      chatMessageAdapter.edit!({
        newContent: display.replace("roughly", "nearly"),
        source: { type: "chat-message", conversationId: CONVERSATION_ID, messageId: MESSAGE_ID },
        dispatch: s.dispatch,
      }),
    ).rejects.toThrow(/did not say what text it opened on/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
