/**
 * @jest-environment jsdom
 *
 * A RIGHT-CLICK ON A CHAT ANSWER'S TABLE OFFERS "SAVE TO A TABLE" ON THAT TABLE (lane
 * TABLE-EXPERIENCE A03). The answer's menu is one menu over the whole answer; its content is the
 * answer's text, whose FIRST shape (a bullet list above the table) opened the one overlay — the
 * table the person clicked was never what was saved. RED on HEAD: the overlay's text was the whole
 * answer; GREEN: it is the clicked table's header + rows, read from the rendered DOM.
 */
import "@/features/rich-document/actions/handlers";
import { getAction } from "@ai-matrx/rich-content/rich-document/actions/provider";
import { chatContext } from "@/features/rich-document/test-utils/chatContext";
import { preloadTableShape, tableTextAtTarget } from "../utils/table-at-target";

const ANSWER = `<div>
  <ul><li>Apple</li><li>Strawberry</li><li>Orange</li></ul>
  <p>Fruits provide vitamins.</p>
  <table><thead><tr><th>Fruit</th><th>Color</th></tr></thead>
  <tbody><tr><td>Apple</td><td>Red</td></tr><tr><td>Orange</td><td>Orange</td></tr></tbody></table>
</div>`;

beforeAll(() => preloadTableShape());

it("reads the clicked table with its header and rows, and nothing from the list above it", () => {
  document.body.innerHTML = ANSWER;
  const cell = document.querySelector("td") as HTMLElement;
  const text = tableTextAtTarget(cell)!;
  expect(text).toContain("Fruit");
  expect(text).toContain("Red");
  expect(text).not.toContain("Strawberry");
  expect(tableTextAtTarget(document.querySelector("p"))).toBeNull();
});

it("Save to a table opens the one overlay on the clicked table, not the answer's first shape", () => {
  document.body.innerHTML = ANSWER;
  const cell = document.querySelector("td") as HTMLElement;
  const dispatch = jest.fn();
  const answerText = "- Apple\n- Strawberry\n- Orange\n\nFruits provide vitamins.\n\n| Fruit | Color |\n| --- | --- |\n| Apple | Red |\n";
  const ctx = chatContext("assistant", {
    dispatch,
    content: answerText,
    callbacks: { tableAtTarget: () => tableTextAtTarget(cell) },
  });
  void getAction("save-table-as-data")!.run(ctx);
  const opened = dispatch.mock.calls.map((c) => c[0]).find((a) => a?.payload?.overlayId === "saveToTable");
  expect(opened).toBeDefined();
  expect(opened.payload.data.text).toContain("Red");
  expect(opened.payload.data.text).not.toContain("Strawberry");
});
