// "Set active" must write even when the preview's version read is missing (a remount between preview and
// press, or a failed read). Before: restoreAt got seenVersion null and refused, writing nothing.
const restoreAt = jest.fn(async (_c: unknown, args: { seenVersion: number | null }) =>
  args.seenVersion === null
    ? { ok: false as const, error: { code: "version_unread", message: "Could not check for changes" } }
    : { ok: true as const, data: {} },
);
jest.mock("@ai-matrx/records/versions", () => ({
  readVersionNow: jest.fn(async () => 4),
  restoreAt: (c: unknown, a: { seenVersion: number | null }) => restoreAt(c, a),
}));
jest.mock("@ai-matrx/records/react", () => ({}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => null }));
jest.mock("../../useStartPage", () => ({ useStartPage: () => ({}) }));

import { setActiveVersion } from "../../useStartLayout";

it("reads the record's version now when the preview's read is missing, and writes", async () => {
  const result = await setActiveVersion({} as never, "rec-1", 1, null);
  expect(result).toEqual({ ok: true });
  expect(restoreAt).toHaveBeenLastCalledWith({}, { record_id: "rec-1", version: 1, seenVersion: 4 });
});

it("keeps the preview's version when it has one (a change since then is still refused by restoreAt)", async () => {
  await setActiveVersion({} as never, "rec-1", 2, 3);
  expect(restoreAt).toHaveBeenLastCalledWith({}, { record_id: "rec-1", version: 2, seenVersion: 3 });
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
