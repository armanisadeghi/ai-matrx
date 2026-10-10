import { applyAgentEdit, catalogForAgent, readForAgent } from "../../tools/agentEdits";
import { START_CLIENT_TOOLS } from "../../tools/start-tools";
import { defaultStartDoc } from "../defaultDoc";

const doc = defaultStartDoc(null);

it("declares the seven tools Slice 2 promised", () => {
  expect(START_CLIENT_TOOLS.map((t) => t.name)).toEqual([
    "start_read_page", "start_list_widgets", "start_add_widget", "start_remove_widget",
    "start_move_widget", "start_resize_widget", "start_configure_widget",
  ]);
});

it("reads the page and the catalog with describe lines", () => {
  const read = readForAgent(doc, 0);
  expect(read.widgets[0]).toMatchObject({ id: "w_kpis", type: "kpis", position: 0, describe: "Your counts (6)" });
  expect(catalogForAgent().find((w) => w.type === "recent")?.fields[0]?.options?.length).toBeGreaterThan(0);
});

it("adds, configures, moves, resizes and removes through the doc verbs", () => {
  const added = applyAgentEdit(doc, "start_add_widget", { type: "recent", config: { kind: "note" }, position: 1 });
  expect(added.ok && added.result).toMatchObject({ ok: true, position: 1 });
  if (!added.ok) return;
  const id = added.result.id as string;
  expect(added.doc.widgets[1]).toMatchObject({ type: "recent", size: "m", config: { kind: "note" } });
  const resized = applyAgentEdit(added.doc, "start_resize_widget", { id, size: "l" });
  expect(resized.ok && resized.doc.widgets[1]!.size).toBe("l");
  const moved = applyAgentEdit(added.doc, "start_move_widget", { id, position: 99 });
  expect(moved.ok && moved.doc.widgets[moved.doc.widgets.length - 1]!.id).toBe(id);
  const removed = applyAgentEdit(added.doc, "start_remove_widget", { id });
  expect(removed.ok && removed.doc.widgets.some((w) => w.id === id)).toBe(false);
});

it("refuses by name: unknown type, a size the widget does not allow, a bad choice, a missing id", () => {
  expect(applyAgentEdit(doc, "start_add_widget", { type: "weather" })).toMatchObject({ ok: false });
  expect(applyAgentEdit(doc, "start_add_widget", { type: "kpis", size: "s" })).toEqual({ ok: false, error: '"kpis" allows sizes l.' });
  expect(applyAgentEdit(doc, "start_configure_widget", { id: "w_recent_chats", config: { kind: "galaxy" } })).toMatchObject({ ok: false });
  expect(applyAgentEdit(doc, "start_configure_widget", { id: "w_recent_chats", config: { colour: "x" } })).toMatchObject({ ok: false });
  expect(applyAgentEdit(doc, "start_remove_widget", { id: "nope" })).toMatchObject({ ok: false });
});
