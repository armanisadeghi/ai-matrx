/**
 * THE USE CASE (lane HANDOVER, 2026-09-27). admin@admin.com opens /trash: seventy kinds of things
 * are in it (Agent 55, Note 134, Table 557, …). Each kind was a chip, seven rows of them, and the
 * first archived item sat at the bottom of a 1600x900 screen. RED on the list before the lane: no
 * picker, one chip per kind. A few kinds (an organization's Trash) stay chips.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc } }));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));

const LIST_UNDER_TEST = process.env.TRASH_LIST_UNDER_TEST ?? "../components/TrashList";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TrashList } = require(LIST_UNDER_TEST) as typeof import("../components/TrashList");

const KINDS = ["Agent", "Note", "Table", "Record", "Field", "Workflow", "Mandate", "Folder", "Project", "Task", "Deal", "Scope"];
let kinds = KINDS;

function answer(fn: string) {
  if (fn === "trash_counts")
    return { data: kinds.map((label, i) => ({ artifact_kind: label.toLowerCase(), label, n: i + 1 })), error: null };
  if (fn === "trash_list") return { data: [], error: null };
  if (fn === "lifecycle_user_notice") return { data: null, error: null };
  return { data: [], error: null };
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string) => answer(fn));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
async function flush() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}
const chipLabels = () =>
  Array.from(container.querySelectorAll("button"))
    .map((b) => b.textContent ?? "")
    .filter((t) => KINDS.some((k) => t.startsWith(k)));

test("twelve kinds are one searchable picker, not twelve chips", async () => {
  kinds = KINDS;
  await act(async () => {
    root.render(<TrashList scope={{ mode: "personal" }} />);
  });
  await flush();
  expect(container.querySelector('[role="combobox"]')).not.toBeNull();
  expect(chipLabels()).toEqual([]);
});

test("three kinds stay chips", async () => {
  kinds = KINDS.slice(0, 3);
  await act(async () => {
    root.render(<TrashList scope={{ mode: "personal" }} />);
  });
  await flush();
  expect(container.querySelector('[role="combobox"]')).toBeNull();
  expect(chipLabels()).toHaveLength(3);
});
