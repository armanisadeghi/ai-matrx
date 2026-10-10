// "Set active" restores a version as ONE new version, labeled from the version it restores. Before: the
// store-side restore copied the old note back, so restoring a different layout was labeled "Starting layout".
const readVersionNow = jest.fn(async () => 4);
jest.mock("@ai-matrx/records/versions", () => ({ readVersionNow: (...a: unknown[]) => (readVersionNow as any)(...a) }));
jest.mock("@ai-matrx/records/react", () => ({}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => null }));
jest.mock("../../useStartPage", () => ({ useStartPage: () => ({}) }));

import { restoredNote, setActiveVersion } from "../../useStartLayout";

const docJson = (types: string[]) => JSON.stringify({ schema: 1, widgets: types.map((t, i) => ({ id: `w${i}`, type: t, size: "m", config: {} })) });
const preview = (after: string) => ({ ok: true as const, data: { changes: [{ key: "doc", after }] } });

it("saves the restored layout as one new version labeled from the version it restores", async () => {
  const save = jest.fn(async () => ({ ok: true as const }));
  const client = { restorePreview: jest.fn(async () => preview(docJson(["tasks", "agenda"]))) };
  const result = await setActiveVersion(client as never, "rec-1", 5, null, { currentDoc: null, note: restoredNote(5, "Added Today's meetings"), save });
  expect(result).toEqual({ ok: true });
  expect(save).toHaveBeenCalledTimes(1);
  const [doc, note] = save.mock.calls[0] as unknown as [{ widgets: { type: string }[] }, string];
  expect(note).toBe("Restored v5: Added Today's meetings");
  expect(note).not.toBe("Starting layout");
  expect(doc.widgets.map((w) => w.type)).toEqual(["tasks", "agenda"]);
});

it("reads the record's version now when the preview's read is missing, and writes", async () => {
  const save = jest.fn(async () => ({ ok: true as const }));
  const client = { restorePreview: jest.fn(async () => preview(docJson(["tasks"]))) };
  const result = await setActiveVersion(client as never, "rec-1", 1, null, { currentDoc: null, note: "Restored v1", save });
  expect(result).toEqual({ ok: true });
  expect(save).toHaveBeenCalledTimes(1);
});

it("refuses, writing nothing, when the layout changed since the preview", async () => {
  const save = jest.fn(async () => ({ ok: true as const }));
  const client = { restorePreview: jest.fn(async () => preview(docJson(["tasks"]))) };
  const result = await setActiveVersion(client as never, "rec-1", 2, 3, { currentDoc: null, note: "Restored v2", save });
  expect(result.ok).toBe(false);
  expect(save).not.toHaveBeenCalled();
});

it("labels a restore with just the version when that version had no note", () => {
  expect(restoredNote(3, null)).toBe("Restored v3");
});

import { versionNote } from "../../useStartLayout";

it("a version whose note did not move says what the layout change was", () => {
  const doc = (types: string[]) => JSON.stringify({ schema: 1, widgets: types.map((t, i) => ({ id: `w${i}`, type: t, size: "m", config: {} })) });
  const entry = {
    version: 2, occurred_at: "", operation: "edit", operation_label: "edited", actor: { kind: "user", user_id: null, name: null, on_behalf_of: null },
    changes: [{ key: "doc", field_id: null, label: "Layout", before: doc(["tasks"]), after: doc(["tasks", "agenda"]), rule: null, source: null, absent_reason: null, alternates: null }],
    migration_id: null, undoable: false,
  };
  expect(versionNote(entry as never)).toBe("Added Today's meetings");
  expect(versionNote({ ...entry, changes: [] } as never)).toBe("Saved again, no change");
});
