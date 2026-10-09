import { runStreamOwnerId } from "../hooks/useRunStream";

describe("runStreamOwnerId — whose scheduler feed a task's runs arrive on", () => {
  it("a user page joins the viewer's own feed", () => {
    expect(
      runStreamOwnerId({ viewerId: "admin-1", taskOwnerId: "owner-9", adminSeat: false }),
    ).toBe("admin-1");
  });
  it("the admin seat joins the task OWNER's feed, never the admin's own", () => {
    expect(
      runStreamOwnerId({ viewerId: "admin-1", taskOwnerId: "owner-9", adminSeat: true }),
    ).toBe("owner-9");
  });
  it("the admin seat with no owner known joins nothing", () => {
    expect(
      runStreamOwnerId({ viewerId: "admin-1", taskOwnerId: null, adminSeat: true }),
    ).toBeNull();
  });
});
