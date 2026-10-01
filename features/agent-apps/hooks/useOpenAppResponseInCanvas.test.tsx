/**
 * kind-never-raw S5: the agent-app "Open in canvas" door — a kind answer on a
 * persisted message binds through the artifact path as its kind; a guest run
 * opens the kind's canvas type over its value; kindless stays HTML.
 */
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const openCanvas = jest.fn();
const openArtifact = jest.fn(async () => ({ ok: true }));
let state: unknown = {};
jest.mock("@/lib/redux/hooks", () => ({ useAppStore: () => ({ getState: () => state }) }));
jest.mock("@/features/canvas/hooks/useCanvas", () => ({ useCanvas: () => ({ open: openCanvas }) }));
const toastInfo = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { info: (...a: unknown[]) => toastInfo(...a) } }));
jest.mock("@/features/canvas/hooks/useOpenArtifactInCanvas", () => ({
  useOpenArtifactInCanvas: () => ({ openArtifact }),
}));

import { useOpenAppResponseInCanvas } from "./useOpenAppResponseInCanvas";

const SET_JSON = JSON.stringify({
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" }],
});

let door: ReturnType<typeof useOpenAppResponseInCanvas>;
function Probe() {
  door = useOpenAppResponseInCanvas();
  return null;
}
beforeAll(() => {
  const host = document.createElement("div");
  act(() => createRoot(host).render(<Probe />));
});
beforeEach(() => {
  openCanvas.mockClear();
  openArtifact.mockClear();
  toastInfo.mockClear();
});

it("a kind answer on a persisted message opens as its kind artifact", async () => {
  state = { messages: { byConversationId: { c1: { orderedIds: ["m1"], byId: { m1: { role: "assistant" } } } } } };
  await door(SET_JSON, "Study app", "c1");
  expect(openArtifact).toHaveBeenCalledWith(
    expect.objectContaining({ canvasType: "flashcards", title: "Cell biology", messageId: "m1" }),
  );
  expect(toastInfo).not.toHaveBeenCalled();
  expect(openCanvas).not.toHaveBeenCalled();
});

it("a guest kind answer opens the kind's canvas type over its value", async () => {
  state = { messages: { byConversationId: {} } };
  await door(SET_JSON, "Study app", null);
  expect(openCanvas).toHaveBeenCalledWith(expect.objectContaining({ type: "flashcards" }));
  // Nothing fails silently: an unsaved open says so, in one short line.
  expect(toastInfo).toHaveBeenCalledTimes(1);
  const line = String(toastInfo.mock.calls[0][0]);
  expect(line.length).toBeLessThanOrEqual(60);
  expect(line.toLowerCase()).toContain("not saved");
});

it("a kindless answer keeps the HTML canvas", async () => {
  await door("<p>Hi</p>", "App", "c1");
  expect(openCanvas).toHaveBeenCalledWith(expect.objectContaining({ type: "html", data: { html: "<p>Hi</p>" } }));
});
