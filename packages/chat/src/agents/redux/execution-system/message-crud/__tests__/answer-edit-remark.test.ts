/**
 * THE EDIT STAGER (Turn References ruling 3) — every saved edit to an agent
 * answer stages ONE coalesced `edit` remark chip in that conversation's
 * composer, through the REAL `saveAnswerEdit` / `commitInlineContentEdit`
 * thunks over the real root reducer (only the database and the knob read are
 * stand-ins).
 *
 * Forcing functions:
 *   1. first edit → one edit chip whose diff is base → now;
 *   2. edit again → the SAME chip, base unchanged (text as of the last send);
 *   3. revert to the base → the chip is removed;
 *   4. after a send, the next edit mints a new chip whose base is the text at
 *      that send — the sent chip is never mutated;
 *   5. a decision choice (inline path) → the chip carries the person's words
 *      ("I chose SQLite.") and the prompt, origin "choice";
 *   6. a plain edit after a choice falls back to the lossless diff;
 *   7. the knob off → no chip.
 *
 * (5) is also the witness that resolving a real decision saves at all: the
 * whole `<decision>` island is replaced edge to edge, which the display-edit
 * splice refused as "crosses the edge of protected content" until 2026-10-03.
 *
 * Use case: Priya edits the agent's caching recommendation for her team's
 * reporting service, then picks SQLite in its decision block.
 */

import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@host/lib/redux/rootReducer";
import { hydrateMessages, type MessageRecord } from "../../messages/messages.slice";
import { saveAnswerEdit } from "../save-answer-edit.thunk";
import { commitInlineContentEdit, flushPendingInlineEdit } from "../commit-inline-edit.thunk";
import { markResourcesSubmitted } from "../../instance-resources/instance-resources.slice";
import { REMARKS_BLOCK_TYPE, remarkSourceOf, type EditRemark } from "../../instance-resources/remarks";
import { remarkDiff } from "../../instance-resources/remark-diff";
import { remarkChipTitle } from "../../instance-resources/remarks";
import { remarkKindDisplay } from "../../../../components/context-items/remark-display";
import { MousePointerClick, PencilLine } from "lucide-react";

const rpc = jest.fn();
let dbContent: unknown = null;

jest.mock("../../../../../host/db", () => ({
  supabase: {
    rpc: (...args: unknown[]) => {
      rpc(...args);
      const [, p] = args as [string, { p_new_content: unknown }];
      return {
        returns: async () => {
          dbContent = p.p_new_content;
          return {
            data: {
              content: p.p_new_content,
              content_history: [],
              user_content: null,
              status: "edited",
              agent_id: null,
              metadata: {},
              is_visible_to_model: true,
              is_visible_to_user: true,
            },
            error: null,
          };
        },
      };
    },
    schema: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.is = () => chain;
      chain.single = async () => ({ data: { content: dbContent }, error: null });
      return { from: () => chain };
    },
  },
}));

jest.mock("../invalidate-conversation-cache.thunk", () => ({
  invalidateConversationCache: () => ({ type: "test/invalidate-cache" }),
}));
jest.mock("../../../../../host/notify", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

let knobOn = true;
jest.mock("../../instance-resources/remark-knob", () => ({
  remarksAutoIncludeEnabled: async () => knobOn,
}));

const CID = "5e1d2c3b-4a59-4687-9a1b-2c3d4e5f6a7b";
const MID = "7f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2f10";
const ORIGINAL =
  "For the reporting service I recommend Redis.\n\nIt keeps hot rows in memory.\n\nReview again in Q3.";

function record(text: string): MessageRecord {
  return {
    id: MID,
    conversationId: CID,
    agentId: null,
    role: "assistant",
    content: [{ type: "text", text }] as MessageRecord["content"],
    contentHistory: null,
    userContent: null,
    position: 2,
    source: "server",
    status: "active",
    isVisibleToModel: true,
    isVisibleToUser: true,
    metadata: {},
    createdAt: "2026-10-03T00:00:00.000Z",
    deletedAt: null,
    _clientStatus: "complete",
  };
}

function makeStore(text = ORIGINAL) {
  dbContent = [{ type: "text", text }];
  const s = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
  s.dispatch(hydrateMessages({ conversationId: CID, messages: [record(text)] }));
  return s;
}
type S = ReturnType<typeof makeStore>;

function editChips(s: S): { id: string; remark: EditRemark }[] {
  const bucket = s.getState().instanceResources.byConversationId[CID] ?? {};
  return Object.values(bucket)
    .filter((r) => r.blockType === REMARKS_BLOCK_TYPE)
    .flatMap((r) => {
      const src = remarkSourceOf(r);
      return src?.remark.kind === "edit" ? [{ id: r.resourceId, remark: src.remark }] : [];
    });
}

/** The inline path writes fire-and-forget: wait until its chip lands. */
async function settle(s: S) {
  for (let i = 0; i < 100 && editChips(s).length === 0; i++) await new Promise((r) => setTimeout(r, 5));
}

async function save(s: S, newText: string) {
  await s.dispatch(saveAnswerEdit({ conversationId: CID, messageId: MID, newText })).unwrap();
}

beforeEach(() => {
  rpc.mockReset();
  knobOn = true;
});

test("first edit stages one chip with the diff from the base", async () => {
  const s = makeStore();
  const edited = ORIGINAL.replace("Redis", "SQLite");
  await save(s, edited);
  const chips = editChips(s);
  expect(chips).toHaveLength(1);
  expect(chips[0].remark).toMatchObject({ before: ORIGINAL, after: edited, origin: "text", projection: null });
  expect(remarkDiff(chips[0].remark.before, chips[0].remark.after)).toBe(
    "- For the reporting service I recommend Redis.\n+ For the reporting service I recommend SQLite.\n  ",
  );
});

test("editing again updates the same chip and keeps the base", async () => {
  const s = makeStore();
  await save(s, ORIGINAL.replace("Redis", "SQLite"));
  const [first] = editChips(s);
  const twice = ORIGINAL.replace("Redis", "SQLite").replace("Q3", "Q4");
  await save(s, twice);
  const chips = editChips(s);
  expect(chips).toHaveLength(1);
  expect(chips[0].id).toBe(first.id);
  expect(chips[0].remark).toMatchObject({ before: ORIGINAL, after: twice });
});

test("reverting to the base removes the chip", async () => {
  const s = makeStore();
  await save(s, ORIGINAL.replace("Redis", "SQLite"));
  expect(editChips(s)).toHaveLength(1);
  await save(s, ORIGINAL);
  expect(editChips(s)).toHaveLength(0);
});

test("after a send, the next edit is a new chip based on the sent text", async () => {
  const s = makeStore();
  const sentText = ORIGINAL.replace("Redis", "SQLite");
  await save(s, sentText);
  const [sent] = editChips(s);
  s.dispatch(markResourcesSubmitted(CID));
  const later = sentText.replace("Q3", "Q4");
  await save(s, later);
  const chips = editChips(s);
  expect(chips).toHaveLength(2);
  const fresh = chips.find((c) => c.id !== sent.id)!;
  expect(fresh.remark).toMatchObject({ before: sentText, after: later });
  expect(chips.find((c) => c.id === sent.id)!.remark).toMatchObject({ before: ORIGINAL, after: sentText });
});

describe("decision choice through the inline path", () => {
  // The shape the model emits (parseDecisionXml).
  const XML =
    '<decision prompt="Cache strategy">\n<option label="SQLite">Use SQLite</option>\n<option label="Redis">Use Redis</option>\n</decision>';
  const WITH_DECISION = `Pick a cache.\n\n${XML}\n\nThen deploy.`;

  test("the chip carries the person's words and the prompt", async () => {
    const s = makeStore(WITH_DECISION);
    s.dispatch(
      commitInlineContentEdit({
        conversationId: CID,
        messageId: MID,
        newText: WITH_DECISION.replace(XML, "Use SQLite"),
        previousText: WITH_DECISION,
        remark: { origin: "choice", projection: "I chose SQLite.", quote: "Cache strategy" },
      }),
    );
    s.dispatch(flushPendingInlineEdit(MID));
    await settle(s);
    const chips = editChips(s);
    expect(chips).toHaveLength(1);
    expect(chips[0].remark).toMatchObject({
      origin: "choice",
      projection: "I chose SQLite.",
      quote: "Cache strategy",
    });
  });

  test("a plain edit after the choice falls back to the diff", async () => {
    const s = makeStore(WITH_DECISION);
    s.dispatch(
      commitInlineContentEdit({
        conversationId: CID,
        messageId: MID,
        newText: WITH_DECISION.replace(XML, "Use SQLite"),
        previousText: WITH_DECISION,
        remark: { origin: "choice", projection: "I chose SQLite.", quote: "Cache strategy" },
      }),
    );
    s.dispatch(flushPendingInlineEdit(MID));
    await settle(s);
    await save(s, "Pick a cache now.\n\nUse SQLite\n\nThen deploy.");
    const chips = editChips(s);
    expect(chips).toHaveLength(1);
    expect(chips[0].remark).toMatchObject({ before: WITH_DECISION, projection: null, origin: "text" });
  });
});

test("knob off: an edit stages nothing", async () => {
  knobOn = false;
  const s = makeStore();
  await save(s, ORIGINAL.replace("Redis", "SQLite"));
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(editChips(s)).toHaveLength(0);
});

describe("task-list ticks are interactions, not diffs", () => {
  // Live walk 2026-10-05: ticking two boxes in "Ingredient Checklist" gave one
  // chip labelled "- [ ] → + [x]" with a pencil — it named neither item.
  const LIST = "Ingredient Checklist\n\n- [ ] 2 cups flour\n- [ ] 1 tsp salt\n- [ ] 2 tbsp sugar\n\nMix well.";
  const tick = (text: string, item: string) => text.replace(`- [ ] ${item}`, `- [x] ${item}`);

  test("two ticks: one chip, named by the items, origin kind", async () => {
    const s = makeStore(LIST);
    const one = tick(LIST, "2 cups flour");
    await save(s, one);
    const two = tick(one, "2 tbsp sugar");
    await save(s, two);
    const chips = editChips(s);
    expect(chips).toHaveLength(1);
    expect(chips[0].remark).toMatchObject({
      before: LIST,
      after: two,
      origin: "kind",
      projection: "I checked off: 2 cups flour, 2 tbsp sugar.",
    });
    expect(remarkChipTitle(chips[0].remark)).toBe("I checked off: 2 cups flour, 2 tbsp sugar.");
  });

  test("unticking one of them renames the chip; unticking all removes it", async () => {
    const s = makeStore(LIST);
    const two = tick(tick(LIST, "2 cups flour"), "2 tbsp sugar");
    await save(s, two);
    await save(s, two.replace("- [x] 2 tbsp sugar", "- [ ] 2 tbsp sugar"));
    expect(editChips(s)[0].remark.projection).toBe("I checked off: 2 cups flour.");
    await save(s, LIST);
    expect(editChips(s)).toHaveLength(0);
  });

  test("a tick plus typed words is a real edit: the diff carries both", async () => {
    const s = makeStore(LIST);
    const one = tick(LIST, "2 cups flour");
    await save(s, one);
    await save(s, one.replace("Mix well.", "Mix very well."));
    const [chip] = editChips(s);
    expect(chip.remark).toMatchObject({ projection: null, origin: "text", before: LIST });
  });

  test("the chip shows the interaction icon, an ordinary edit the pencil", () => {
    expect(remarkKindDisplay("edit", "kind").icon).toBe(MousePointerClick);
    expect(remarkKindDisplay("edit", "text").icon).toBe(PencilLine);
  });
});
