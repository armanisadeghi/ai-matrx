/**
 * REGRESSION GUARD — a reloaded user bubble keeps the keys the server stamped.
 *
 * The server mints a remark's handle (`c1`) while the turn resolves and writes
 * it into `content` only; the pristine `user_content` never gets it. The card
 * showed the handle right after send and lost it on reload. Real stored shape
 * (admin@admin.com bakery plan chat, message 739db117), trimmed of prose.
 */
import { persistedBodyBlocks } from "../messages.selectors";
import type { MessageRecord } from "../messages.slice";

const item = (extra: Record<string, unknown>) => ({
  id: "res_bf64d88e",
  kind: "comment",
  body: "Mention a specific target margin here.",
  quote: "etail price.",
  target: { message_id: "5a531779" },
  ...extra,
});
const part = (items: unknown[]) => ({ type: "input_remarks", items, metadata: {} });

function record(userItem: unknown, contentItem: unknown): MessageRecord {
  return {
    id: "739db117",
    conversationId: "8e922e0a",
    role: "user",
    content: [part([contentItem])],
    userContent: [part([userItem])],
  } as unknown as MessageRecord;
}

function remarkItems(r: MessageRecord): Array<Record<string, unknown>> {
  const blocks = persistedBodyBlocks(r, { isSelfRendered: (p) => p.type === "text" }) as Array<{ type: string; data?: { payload?: { items?: unknown[] } } }>;
  const b = blocks.find((x) => x.type === "input_remarks");
  return (b?.data?.payload?.items ?? []) as Array<Record<string, unknown>>;
}

it("shows the handle the server stamped into content on the person's own copy", () => {
  const items = remarkItems(record(item({}), item({ handle: "c2" })));
  expect(items).toHaveLength(1);
  expect(items[0]!.handle).toBe("c2");
});

it("never overwrites what the person's copy already says", () => {
  const items = remarkItems(record(item({ body: "mine" }), item({ body: "server", handle: "c2" })));
  expect(items[0]!.body).toBe("mine");
  expect(items[0]!.handle).toBe("c2");
});

it("leaves a row with no stamp untouched", () => {
  const items = remarkItems(record(item({}), item({})));
  expect(items[0]!.handle).toBeUndefined();
});
