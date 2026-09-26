/**
 * Final verification (2026-09-26): after editing a saved Source its screen said
 * "Not saved" — it read `kept_at` off the EDITED version (a manual_curation row
 * never carries it). Saved is a property of the Source, i.e. of its head.
 */
import { sourceKeptAt } from "@/features/sources/currentVersion";

describe("sourceKeptAt", () => {
  it("an edited Source is saved when its head is", () => {
    expect(
      sourceKeptAt({ id: "edit", kept_at: null }, "head", "2026-09-26T10:00:00Z"),
    ).toBe("2026-09-26T10:00:00Z");
  });

  it("viewing the head itself reads its own kept_at", () => {
    expect(sourceKeptAt({ id: "head", kept_at: "k" }, "head", undefined)).toBe("k");
  });

  it("while the head's own value is unread, it is unknown — never 'Not saved'", () => {
    expect(sourceKeptAt({ id: "edit", kept_at: null }, "head", undefined)).toBeUndefined();
  });
});
