import { AI_WORK_DOOR_GROUPS } from "../components/AiWorkOverview";
import { aiWorkDestinationItems } from "../components/AiWorkDestinationNavigation";

describe("AI Work overview destinations", () => {
  const hrefs = AI_WORK_DOOR_GROUPS.flatMap((group) =>
    group.doors.map((door) => door.href),
  );

  it("offers every live core destination once", () => {
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/work/conversations",
        "/work/connections",
        "/chat/new",
        "/projects",
        "/tasks",
        "/war-room/all",
        "/agent-connections/skills",
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

  it("keeps all canonical work navigation and only attaches the controller metric to conversations", () => {
    const items = aiWorkDestinationItems({
      value: 17,
      state: "ready",
      description: "AI chats matching this inbox view",
    });

    expect(items.map((item) => item.href)).toEqual(
      expect.arrayContaining([
        "/work",
        "/work/conversations",
        "/work/connections",
        "/agent-connections/plugins",
        "/projects",
        "/tasks",
        "/war-room/all",
        "/schedules",
      ]),
    );
    expect(items.filter((item) => item.value !== undefined)).toEqual([
      expect.objectContaining({ href: "/work/conversations", value: 17 }),
    ]);
  });
});
