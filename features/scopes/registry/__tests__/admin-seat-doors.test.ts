/**
 * THE ADMIN SEAT'S DOORS: a record the admin does not own opens at its admin
 * twin inside /administration, and at the user route everywhere else.
 */
import { adminTwinHref, ADMIN_TWIN_HREF } from "../adminTwins";
import { resolveEntityDoors } from "@/components/official/entity-ref/doors";

const ID = "0b00eba0-5b28-457e-8d53-002feb40d6cc";

function visit(path: string) {
  window.history.pushState({}, "", path);
}

afterEach(() => visit("/"));

describe("adminTwinHref", () => {
  it("maps conversation and sch_task to their admin pages on the seat", () => {
    expect(adminTwinHref("conversation", ID, true)).toBe(
      `/administration/chat/cx-dashboard/conversations/${ID}`,
    );
    expect(adminTwinHref("sch_task", ID, true)).toBe(
      `/administration/automation/scheduling/tasks/${ID}`,
    );
  });
  it("answers null off the seat and for a token with no twin", () => {
    expect(adminTwinHref("conversation", ID, false)).toBeNull();
    expect(adminTwinHref("note", ID, true)).toBeNull();
  });
  it("every twin is an /administration route", () => {
    for (const make of Object.values(ADMIN_TWIN_HREF)) {
      expect(make(ID).startsWith("/administration/")).toBe(true);
    }
  });
});

describe("resolveEntityDoors reads the seat at request time", () => {
  it("conversation -> user route on a user page", () => {
    visit("/chat");
    expect(resolveEntityDoors("conversation", ID).href).toBe(`/chat/${ID}`);
  });
  it("conversation -> admin twin inside /administration", () => {
    visit("/administration/users/agent-review");
    expect(resolveEntityDoors("conversation", ID).href).toBe(
      `/administration/chat/cx-dashboard/conversations/${ID}`,
    );
  });
  it("an explicit href override still wins", () => {
    visit("/administration/x");
    expect(resolveEntityDoors("conversation", ID, "/custom").href).toBe("/custom");
  });
});
