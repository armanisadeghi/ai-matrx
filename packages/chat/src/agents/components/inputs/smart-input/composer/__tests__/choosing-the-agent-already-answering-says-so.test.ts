/**
 * The agent list shows "General Chat" as current while the composer pill reads
 * "Custom" (the same agent holds the default-chat job). Pressing Select on it
 * did nothing, silently. It now says who is in the seat.
 */
const info = jest.fn();
jest.mock("../../../../../../host/notify", () => ({ toast: { info: (...a: unknown[]) => info(...a) } }));

import { announceAlreadyAnswering } from "../already-answering";

beforeEach(() => info.mockClear());

it("names the agent and that it is the Custom chat", () => {
  announceAlreadyAnswering({ agentName: "General Chat", isCustom: true });
  expect(info).toHaveBeenCalledTimes(1);
  expect(info.mock.calls[0][0]).toContain("General Chat is your Custom chat");
});

it("names a plain current agent", () => {
  announceAlreadyAnswering({ agentName: "Deep Research", isCustom: false });
  expect(info.mock.calls[0][0]).toBe("Deep Research is already answering this conversation.");
});
