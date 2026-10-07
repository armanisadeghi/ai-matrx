/**
 * "Try one prompt", through the REAL `useToolAction` and screen-run client
 * (only the HTTP call `requestRaw` and the canvas open are faked):
 *  - it opens with one FREE probe per engine (`models: [engine]`,
 *    `max_cost_usd` 0.0001) and shows each engine's exact price — or
 *    "Stored · free" when a stored answer came back;
 *  - the Ask button names the total and pays only for the selected, unstored
 *    engines in ONE call without max_cost_usd;
 *  - each answer says whether it names the brand and opens whole in the
 *    `ai-visibility-answer` canvas tab, keyed by its run.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const opened: { kind: string; key: string; data: { engine: string; answer: string } }[] = [];
jest.mock("@/features/canvas/host/openCanvasItem", () => ({
  openCanvasItem: (_c: unknown, input: (typeof opened)[number]) => {
    opened.push(input);
    return "id";
  },
}));
jest.mock("@ai-matrx/canvas/react", () => ({
  useOptionalCanvas: () => ({}),
  defineCanvasKind: (k: unknown) => k,
}));
const fullAnswer = jest.fn(async () => "FULL ANSWER naming All Green");
jest.mock("../try-prompt/full-answer", () => ({ readFullAnswer: () => fullAnswer() }));

const requestRaw = jest.fn();
jest.mock("@ai-matrx/chat/host/server/python-client", () => ({
  requestRaw: (...args: unknown[]) => requestRaw(...args),
}));

import { TryOnePrompt } from "../try-prompt/TryOnePrompt";

// Platform cost reaches the screen in the viewer's unit (points); pin the rate.
jest.mock("@/components/cost/pointsRate.client", () => ({ usePointsRate: () => 10000 }));

type Call = { tool_name: string; arguments: Record<string, unknown> };
const calls = (): Call[] => requestRaw.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));
const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const ok = (output: unknown) =>
  reply({ call_id: "c", tool_name: "seo_ai_visibility", status: "ok", output, error: null, approval: null });
const overMax = (usd: string) =>
  reply({
    call_id: "c",
    tool_name: "seo_ai_visibility",
    status: "error",
    output: null,
    approval: null,
    error: {
      error_type: "over_max_cost",
      message: `This seo_ai_visibility.try_prompt call is estimated at $${usd} (1,686 points), above your max_cost_usd of $0.0001 (2 points); nothing was spent.`,
      suggested_action: null,
    },
  });
const PRICE: Record<string, string> = { chat_gpt: "0.0843", claude: "0.05", gemini: "0.04" };
const result = (model: string, extra: Record<string, unknown> = {}) => ({
  model,
  model_name: `${model}-model`,
  answer: `${model} says try All Green`,
  answer_truncated: false,
  mentioned: true,
  cited_urls: ["https://a.example", "https://b.example"],
  run_id: `run-${model}`,
  reused: false,
  ...extra,
});
const envelope = (results: unknown[]) => ({
  __kind: "seo.tool_envelope",
  status: "ok",
  data: { prompt: "Q", highlight_brand: null, brand_terms: ["All Green"], results },
  cost: { class: "paid", charged_usd: 0.1743, reused: false },
  notices: [],
});

let root: Root;
let host: HTMLDivElement;
const settle = async () => {
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
};
async function render(questions: string[]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<TryOnePrompt siteId="site-1" questions={questions} onClose={() => {}} />);
  });
  await settle();
}
const text = () => host.textContent ?? "";
const row = (engine: string) => host.querySelector(`[data-engine="${engine}"]`)?.textContent ?? "";
const button = (label: string, scope: ParentNode = host) =>
  [...scope.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;

beforeEach(() => {
  requestRaw.mockReset();
  opened.length = 0;
  fullAnswer.mockClear();
  // Perplexity has a stored answer (free); the other three are priced.
  requestRaw.mockImplementation(async (_p: string, init: { body: string }) => {
    const { arguments: a } = JSON.parse(init.body) as Call;
    const models = a.models as string[];
    if (a.max_cost_usd !== undefined) {
      return models[0] === "perplexity"
        ? ok(envelope([result("perplexity", { reused: true, mentioned: false })]))
        : overMax(PRICE[models[0]]);
    }
    return ok(envelope(models.map((m) => result(m, m === "chat_gpt" ? { answer_truncated: true } : {}))));
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("prices every engine for free, then asks only the selected unstored ones in one paid call", async () => {
  await render(["Who recycles laptops in LA?"]);

  const probes = calls();
  expect(probes).toHaveLength(4);
  for (const engine of ["chat_gpt", "claude", "gemini", "perplexity"]) {
    expect(probes.map((c) => c.arguments)).toContainEqual({
      action: "try_prompt",
      site_id: "site-1",
      prompt: "Who recycles laptops in LA?",
      models: [engine],
      max_cost_usd: 0.0001,
    });
  }
  expect(row("chat_gpt")).toContain("843 points");
  expect(row("claude")).toContain("500 points");
  expect(row("perplexity")).toContain("Stored · free");
  expect(row("perplexity")).toContain("Doesn't name you");

  // Deselect Gemini: the button names exactly what it will spend.
  await act(async () => { button("Gemini", host.querySelector('[data-engine="gemini"]')!)!.click(); });
  const ask = button("Ask 2 engines");
  expect(ask?.textContent).toContain("1,343 points");

  await act(async () => { ask!.click(); });
  await settle();
  const paid = calls().filter((c) => c.arguments.max_cost_usd === undefined);
  expect(paid.map((c) => c.arguments)).toEqual([
    { action: "try_prompt", site_id: "site-1", prompt: "Who recycles laptops in LA?", models: ["chat_gpt", "claude"] },
  ]);
  expect(row("chat_gpt")).toContain("Names you");
  expect(row("chat_gpt")).toContain("2 cited");
  expect(row("gemini")).toContain("400 points"); // never asked
  expect(text()).toContain("Nothing to ask");
});

it("opens an answer whole in the answer canvas tab, reading a cut answer in full first", async () => {
  await render(["Who recycles laptops in LA?"]);
  await act(async () => { button("Ask 3 engines")!.click(); });
  await settle();

  await act(async () => { button("Read answer", host.querySelector('[data-engine="chat_gpt"]')!)!.click(); });
  await settle();
  expect(fullAnswer).toHaveBeenCalledTimes(1);
  expect(opened.at(-1)).toMatchObject({
    kind: "ai-visibility-answer",
    key: "run-chat_gpt",
    data: { engine: "ChatGPT", answer: "FULL ANSWER naming All Green" },
  });

  await act(async () => { button("Read answer", host.querySelector('[data-engine="claude"]')!)!.click(); });
  await settle();
  expect(fullAnswer).toHaveBeenCalledTimes(1); // not cut: the tool's text is the whole answer
  expect(opened.at(-1)).toMatchObject({ key: "run-claude", data: { answer: "claude says try All Green" } });
});

it("with no panel questions asks nothing until a question is typed", async () => {
  await render([]);
  expect(calls()).toHaveLength(0);
  expect(text()).not.toContain("Ask");
});
