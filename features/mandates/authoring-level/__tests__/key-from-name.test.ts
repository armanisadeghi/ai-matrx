/**
 * A soft mandate's key is MADE from its name (review 2026-09-25: asking a
 * person for a "lowercase, dot-separated" key "code calls forever" was a
 * developer question put to a user). The made key must satisfy the server's
 * shape — `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$` — for any name a person types.
 */
jest.mock("@/features/shell/components/header/RouteHeader", () => () => null);
jest.mock("@ai-matrx/tap-target/buttons", () => ({ ChevronLeftTapButton: () => null }));

import { keyFromName } from "../NewSoftMandatePage";

const SERVER_SHAPE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

test.each([
  ["Goal writer", "custom.goal_writer"],
  ["  Weekly Sales Recap!! ", "custom.weekly_sales_recap"],
  ["Café résumé", "custom.cafe_resume"],
  ["2024 plan", "custom.job_2024_plan"],
])("%p → %p", (name, key) => {
  expect(keyFromName(name)).toBe(key);
  expect(keyFromName(name)).toMatch(SERVER_SHAPE);
});

test("a taken key is bumped, still in the server's shape", () => {
  expect(keyFromName("Goal writer", 3)).toBe("custom.goal_writer_3");
  expect(keyFromName("Goal writer", 3)).toMatch(SERVER_SHAPE);
});

test("a name with nothing to make a key from makes none (Advanced opens)", () => {
  expect(keyFromName("")).toBe("");
  expect(keyFromName("!!!")).toBe("");
});
