/**
 * G18 review (2026-10-07): a builder run was lost when the panel re-rendered
 * right after its confirm — the run lived in component state. It lives here
 * now: the outcome lands whether or not a panel is mounted, a repeat of the
 * same block is known ("already ran once"), and a changed input clears it.
 */
import {
  alreadyApplied,
  blockKey,
  clearBuilderOutcome,
  getBuilderRun,
  resetBuilderRunForTests,
  runBuilder,
} from "@/features/directive-catalog/builderRunStore";
import type { DirectiveApplyResult } from "@/features/directive-catalog/types";

const applied = {
  receipts: [{ status: "applied", directive_class: "create", noun: "task", resource_ids: ["r1"] }],
} as unknown as DirectiveApplyResult;

beforeEach(() => resetBuilderRunForTests());

it("keeps a run's outcome outside any component, and knows a repeat", async () => {
  const key = blockKey("directive_v1_create_task", [{ title: "G18" }]);
  expect(alreadyApplied(key)).toBe(false);
  let release!: (r: DirectiveApplyResult) => void;
  const pending = runBuilder("directive_v1_create_task", key, "G18", () => new Promise((r) => (release = r)), () => ({ raw: "x" }));
  expect(getBuilderRun().executing).toBe(true);
  // No panel is mounted (it remounted mid-run); the run still lands.
  release(applied);
  await pending;
  expect(getBuilderRun()).toMatchObject({ executing: false, sentTitle: "G18", slug: "directive_v1_create_task" });
  expect(getBuilderRun().result).toBe(applied);
  expect(alreadyApplied(key)).toBe(true);
});

it("an error clears when the inputs change", async () => {
  await runBuilder("directive_v1_delete_task", "k", null, () => Promise.reject(new Error("Nothing was applied — id is required.")), (e) => ({ raw: (e as Error).message }));
  expect(getBuilderRun().error?.raw).toContain("id is required");
  clearBuilderOutcome();
  expect(getBuilderRun().error).toBeNull();
});
