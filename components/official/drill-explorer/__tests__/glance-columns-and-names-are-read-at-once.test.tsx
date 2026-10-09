/**
 * NAMES LAND FAST (lane DRILL-LIVE-FIX-2 #3; live verifier on release 13e0b6fafe): on all-people by
 * conversation the Agent and Person columns read "…" for 15–40 s. Two causes on the explorer's side:
 *   - each glance column was its OWN ask (by conversation × agent, by conversation × person): two full
 *     scans of the window racing the answer (measured on production: 6.4 s + 3.8 s; one combined ask 3.0 s)
 *   - the name book read its batches of 500 one after another.
 * Red on HEAD: two asks for two columns, and the second batch was asked only after the first came back.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

import { useDrillAttributes } from "../useDrillAttributes";
import { createDrillNameBook } from "../drillNames";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("the glance columns are one ask", () => {
  it("agent and person of each conversation come from ONE ask grouped by all three", async () => {
    const asks: Array<Record<string, unknown>> = [];
    const client = {
      drillAsk: jest.fn(async (q: { question: Record<string, unknown> }) => {
        asks.push(q.question);
        return { ok: true, data: { rows: [{ kind: "group", groups: { conversation: "c1", agent: "a1", person: "p1" }, measures: {}, row_count: 1 }], says: [], total: null, as_of: null } };
      }),
    };
    const held: { got?: ReturnType<typeof useDrillAttributes> } = {};
    function Probe() {
      held.got = useDrillAttributes({
        client: client as never,
        source: { kind: "entity", token: "ai_usage_executions" },
        lane: "platform",
        question: { by: ["conversation"], show: ["cost"], where: [], window: "30d" },
        dimensions: [
          { key: "conversation", label: "Conversation", kind: "relation" },
          { key: "agent", label: "Agent", kind: "relation" },
          { key: "person", label: "Person", kind: "relation" },
          { key: "at", label: "When", kind: "time" },
        ],
        answers: { conversation: [{ groups: { conversation: "c1" }, measures: { cost: 1 }, row_count: 1 }] } as never,
        attributes: ["agent", "person"],
        carried: null,
        resolvers: undefined,
      });
      return null;
    }
    await act(async () => root.render(<Probe />));
    await act(async () => {});
    expect(asks).toHaveLength(1);
    expect(asks[0]).toMatchObject({ by: ["conversation", "agent", "person"], where: { conversation: ["c1"] } });
    expect(held.got?.map((a) => a.read({ conversation: "c1" }))).toEqual(["a1", "p1"]);
  });
});

describe("the name book reads its batches at once", () => {
  it("1,200 ids are three reads in flight together", async () => {
    let inFlight = 0;
    let most = 0;
    const book = createDrillNameBook({
      person: {
        resolve: async (ids: string[]) => {
          inFlight += 1;
          most = Math.max(most, inFlight);
          await new Promise((r) => setTimeout(r, 5));
          inFlight -= 1;
          return { ok: true, names: Object.fromEntries(ids.map((id) => [id, `name ${id}`])) };
        },
      },
    } as never);
    await book.want("person", Array.from({ length: 1200 }, (_, i) => `p${i}`));
    expect(most).toBe(3);
    expect(book.names().person?.p1199).toBe("name p1199");
  });
});
