import { AI_WORK_DOOR_GROUPS } from "../components/AiWorkOverview";

describe("AI Work overview destinations", () => {
  const hrefs = AI_WORK_DOOR_GROUPS.flatMap((group) =>
    group.doors.map((door) => door.href),
  );

  it("offers every live core destination once", () => {
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/work/conversations",
        "/chat/new",
        "/projects",
        "/tasks",
        "/war-room/all",
        "/agent-connections/skills",
        "/agent-connections/plugins",
        "/agent-connections/mcp-servers",
        "/schedules",
      ]),
    );
  });

  it("does not advertise unbuilt compose, request, import, or automation routes", () => {
    expect(hrefs).not.toEqual(
      expect.arrayContaining([
        "/work/new",
        "/work/requests",
        "/work/import",
        "/work/automations",
      ]),
    );
  });
});
