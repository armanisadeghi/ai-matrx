/**
 * A soft mandate's key is MADE from its name, in the seat's namespace. The made
 * key must pass the SERVER's rule, not only its regex: the first version made
 * `custom.<words>`, matched the shape, and every create was refused because
 * aidream forbids `custom` as a generic namespace. So this test carries the
 * server's forbidden namespaces and Holder words (aidream
 * aidream/services/mandates/service.py `_FORBIDDEN_MANDATE_NAMESPACES`,
 * `_FORBIDDEN_HOLDER_JOB_WORDS`) and the server side pins that the two seat
 * namespaces are accepted (`test_soft_mandate_seat_namespaces_are_accepted`).
 */
import { keyFromName, softMandateNamespace } from "../soft-key";

const SERVER_SHAPE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;
const SERVER_FORBIDDEN_NAMESPACES = new Set([
  "system", "platform", "core", "shared", "common", "misc", "miscellaneous", "generic",
  "general", "utility", "utilities", "helper", "helpers", "default", "builtin", "custom",
  "temp", "temporary", "test", "testing", "demo", "sample", "other", "unknown",
]);
const HOLDER_SUFFIX =
  /_(?:agent|assistant|bot|model|worker|runner|handler|processor|manager|service|task|job|helper)$/;
const HOLDER_WORDS = /^(?:agent|assistant|bot|model|worker|runner|handler|processor|manager|service|task|job|helper)$/;

function serverAccepts(key: string): boolean {
  if (!SERVER_SHAPE.test(key)) return false;
  const [namespace, ...jobs] = key.split(".");
  if (SERVER_FORBIDDEN_NAMESPACES.has(namespace)) return false;
  if (key.split(/[._]/).includes("internal")) return false;
  return jobs.every((part) => !HOLDER_WORDS.test(part) && !HOLDER_SUFFIX.test(part));
}

const personal = softMandateNamespace("user");
const org = softMandateNamespace("organization");

test.each([
  ["Goal writer", personal, "personal.goal_writer"],
  ["  Weekly Sales Recap!! ", personal, "personal.weekly_sales_recap"],
  ["Café résumé", personal, "personal.cafe_resume"],
  ["2024 plan", personal, "personal.mandate_2024_plan"],
  ["Research assistant", personal, "personal.research"],
  ["Dispatch summary", org, "organization.dispatch_summary"],
])("%p in %p → %p, and the server accepts it", (name, namespace, key) => {
  expect(keyFromName(name, 1, namespace)).toBe(key);
  expect(serverAccepts(keyFromName(name, 1, namespace))).toBe(true);
});

test("a taken key is bumped, still accepted", () => {
  expect(keyFromName("Goal writer", 3, personal)).toBe("personal.goal_writer_3");
  expect(serverAccepts(keyFromName("Goal writer", 3, personal))).toBe(true);
});

test("a name with nothing to make a key from makes none (Advanced opens)", () => {
  expect(keyFromName("", 1, personal)).toBe("");
  expect(keyFromName("!!!", 1, personal)).toBe("");
  expect(keyFromName("Agent", 1, personal)).toBe("");
});
