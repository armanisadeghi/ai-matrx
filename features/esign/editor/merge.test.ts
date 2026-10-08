import { emptyDraft, newRecipient } from "./model";
import { mergeDrafts, takeTheirs } from "./merge";
import type { EnvelopeDraftV1 } from "../contract/draft";

function base(): EnvelopeDraftV1 {
  const d = emptyDraft("Lease");
  const a = newRecipient([], { key: "a", full_name: "Alice", email: "a@example.com" });
  const b = newRecipient([a], { key: "b", full_name: "Bob", email: "b@example.com" });
  return { ...d, recipients: [a, b] };
}

describe("mergeDrafts — two tabs editing one draft (CONTRACT §15)", () => {
  it("keeps both sides' edits to different items and scalars", () => {
    const b = base();
    const mine = { ...b, title: "Lease v2", recipients: b.recipients.map((r) => (r.key === "a" ? { ...r, full_name: "Alice A" } : r)) };
    const theirs = { ...b, message: "Please sign", recipients: b.recipients.map((r) => (r.key === "b" ? { ...r, full_name: "Bob B" } : r)) };
    const { merged, conflicts } = mergeDrafts(b, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.title).toBe("Lease v2");
    expect(merged.message).toBe("Please sign");
    expect(merged.recipients.map((r) => r.full_name)).toEqual(["Alice A", "Bob B"]);
  });

  it("names a conflict when both changed the same item, keeps mine, and Take theirs restores theirs", () => {
    const b = base();
    const mine = { ...b, recipients: b.recipients.map((r) => (r.key === "a" ? { ...r, email: "mine@example.com" } : r)) };
    const theirs = { ...b, recipients: b.recipients.map((r) => (r.key === "a" ? { ...r, email: "theirs@example.com" } : r)) };
    const { merged, conflicts } = mergeDrafts(b, mine, theirs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ array: "recipients", id: "a", label: "Alice" });
    expect(merged.recipients[0].email).toBe("mine@example.com");
    expect(takeTheirs(merged, conflicts).recipients[0].email).toBe("theirs@example.com");
  });

  it("honours their delete of an item I did not touch, and keeps an item only I added", () => {
    const b = base();
    const c = newRecipient(b.recipients, { key: "c", full_name: "Cy", email: "c@example.com" });
    const mine = { ...b, recipients: [...b.recipients, c] };
    const theirs = { ...b, recipients: b.recipients.filter((r) => r.key !== "b") };
    const { merged, conflicts } = mergeDrafts(b, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.recipients.map((r) => r.key)).toEqual(["a", "c"]);
  });

  it("a delete on their side against my edit is a conflict; Take theirs deletes", () => {
    const b = base();
    const mine = { ...b, recipients: b.recipients.map((r) => (r.key === "b" ? { ...r, full_name: "Bobby" } : r)) };
    const theirs = { ...b, recipients: b.recipients.filter((r) => r.key !== "b") };
    const { merged, conflicts } = mergeDrafts(b, mine, theirs);
    expect(conflicts).toMatchObject([{ array: "recipients", id: "b", theirs: null }]);
    expect(merged.recipients.map((r) => r.key)).toEqual(["a", "b"]);
    expect(takeTheirs(merged, conflicts).recipients.map((r) => r.key)).toEqual(["a"]);
  });
});
