// An unowned action item must stay unowned when it becomes a task. On
// 2026-09-27 every unowned item defaulted to the clicking host, listed under
// their meeting name "Grace Hopper", so it read as a real, different person.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultTaskOwner, taskOwnerChoices } from "./task-owner";

describe("task owner for a meeting action item", () => {
  it("an item the meeting named nobody for stays unowned", () => {
    expect(defaultTaskOwner({ assigneeUserId: null })).toBeNull();
  });

  it("an item the meeting named an account for keeps that account", () => {
    expect(defaultTaskOwner({ assigneeUserId: "u-2" })).toBe("u-2");
  });

  it("marks the viewer '(you)' under their meeting name, once", () => {
    const choices = taskOwnerChoices(
      [
        { userId: "me", isAgent: false, name: "Grace Hopper" },
        { userId: "me", isAgent: false, name: "Grace Hopper" },
        { userId: "u-2", isAgent: false, name: "Ada Lovelace" },
        { userId: "bot", isAgent: true, name: "Note-taker" },
        { userId: null, isAgent: false, name: "A guest" },
      ],
      "me",
    );
    expect(choices).toEqual([
      { userId: "me", name: "Grace Hopper (you)" },
      { userId: "u-2", name: "Ada Lovelace" },
    ]);
  });

  it("offers the viewer as 'Me' when they were not there", () => {
    expect(taskOwnerChoices([], "me")).toEqual([{ userId: "me", name: "Me" }]);
  });

  it("the action-items screen uses these rules, not a clicker default", () => {
    const source = readFileSync(
      join(__dirname, "..", "components/record/ActionItemsSection.tsx"),
      "utf8",
    );
    expect(source).toContain("defaultTaskOwner(item)");
    expect(source).not.toMatch(/assigneeUserId \?\? userId/);
  });
});
