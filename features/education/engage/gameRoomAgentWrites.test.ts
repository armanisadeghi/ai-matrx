import {
  parseCurrentHostRoomCreation,
  parseLobbyRoomCancellation,
} from "./gameRoomAgentWrites";

const ROOM_ID = "ac0bb9df-3011-4b69-a1f7-2b72f5b2cb8e";

describe("parseLobbyRoomCancellation", () => {
  it("accepts exactly the room currently open", () => {
    expect(parseLobbyRoomCancellation([ROOM_ID], ROOM_ID)).toBe(ROOM_ID);
  });

  it.each([
    ["a non-array", ROOM_ID, ROOM_ID],
    ["an empty list", [], ROOM_ID],
    ["multiple ids", [ROOM_ID, "another-room"], ROOM_ID],
    ["a non-text id", [42], ROOM_ID],
    ["another room", ["another-room"], ROOM_ID],
    ["no loaded room", [ROOM_ID], null],
  ])("refuses %s before approval", (_case, value, currentRoomId) => {
    expect(() => parseLobbyRoomCancellation(value, currentRoomId)).toThrow(
      "Nothing was changed.",
    );
  });
});

describe("parseCurrentHostRoomCreation", () => {
  it("accepts only the current host-composer sentinel", () => {
    expect(() =>
      parseCurrentHostRoomCreation({ source: "current_host_composer" }),
    ).not.toThrow();
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { source: "another_source" },
    { source: "current_host_composer", maxPlayers: 1 },
  ])("refuses a room creation payload outside the visible composer", (value) => {
    expect(() => parseCurrentHostRoomCreation(value)).toThrow(
      "Nothing was changed.",
    );
  });
});
