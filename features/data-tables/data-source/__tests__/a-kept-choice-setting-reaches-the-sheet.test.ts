/**
 * A COLUMN'S KEPT "TAKE OTHER VALUES" SETTING REACHES THE SHEET (BREAKER-3 B3-15, re-found by BREAKER-4).
 *
 * The use case: a triage desk's "Priority" choice column takes only Routine / Urgent / Elective. It is
 * changed to Text and back. The store keeps the strict setting beside the kept list
 * (config.list_kept_allow_other); the Sheet's column must carry it so Column settings starts strict
 * again — it started from "Anyone can type a value that isn't listed" and saved the column open.
 */
import { gridColumnFromField } from "../record-store-shape";

const base = {
  id: "f0000000-0000-4000-8000-0000000000b1",
  key: "priority",
  label: "Priority",
  type: "text",
  sort: 20,
  organization_id: "0a54df90-eab8-4d07-ab29-81a45fb41e04",
  created_at: "2026-10-01T08:00:00Z",
  updated_at: "2026-10-01T08:00:00Z",
} as never;

test("a Text column that was a strict choice column carries list_kept_allow_other: false", () => {
  const col = gridColumnFromField({ ...(base as object), config: { list_kept: "6d82210c-47cf-4a0a-ad13-a35daa88b09e", list_kept_allow_other: false } } as never, "t", null);
  expect((col.metadata as { list_kept_allow_other?: unknown }).list_kept_allow_other).toBe(false);
});

test("a column with nothing kept carries nothing extra", () => {
  const col = gridColumnFromField({ ...(base as object), config: {} } as never, "t", null);
  expect(col.metadata as object).not.toHaveProperty("list_kept_allow_other");
});
