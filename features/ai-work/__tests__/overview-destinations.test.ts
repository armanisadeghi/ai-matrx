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
        "/work/new",
        "/work/requests",
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

  it("does not advertise unbuilt import or automation routes", () => {
    expect(hrefs).not.toEqual(
      expect.arrayContaining(["/work/import", "/work/automations"]),
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
        "/work/new",
        "/work/requests",
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
    expect(items.find((item) => item.href === "/work/conversations")).toEqual(
      expect.objectContaining({ label: "Conversations" }),
    );
    expect(
      items.find((item) => item.href === "/agent-connections/plugins"),
    ).toEqual(expect.objectContaining({ label: "Connection setup" }));
    expect(items.find((item) => item.href === "/work/connections")).toEqual(
      expect.objectContaining({ label: "Sync status" }),
    );
  });
});
