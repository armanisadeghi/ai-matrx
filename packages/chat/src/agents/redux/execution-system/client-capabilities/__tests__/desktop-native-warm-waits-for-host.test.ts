// The desktop-presence warm reads the host's db, so it must wait for the chat host:
// on /p this module loaded before <ChatProvider> rendered and announced
// "No chat host is configured" on every page load (2026-10-07).
const mockPresence = jest.fn(() => Promise.resolve(null));
jest.mock("../desktop-presence", () => ({ getLiveDesktopInstance: mockPresence }));
jest.mock("../registry", () => ({ registerClientCapability: jest.fn() }));
let configured = false;
const listeners: Array<() => void> = [];
jest.mock("../../../../../host/configure", () => ({
  isChatHostConfigured: () => configured,
  onChatHostConfigured: (l: () => void) => {
    listeners.push(l);
    return () => listeners.splice(listeners.indexOf(l), 1);
  },
}));

it("warms only once a chat host is configured", () => {
  jest.useFakeTimers();
  jest.isolateModules(() => {
    require("../desktop-native.provider");
  });
  jest.runAllTimers();
  expect(mockPresence).not.toHaveBeenCalled();
  configured = true;
  for (const l of [...listeners]) l();
  jest.runAllTimers();
  expect(mockPresence).toHaveBeenCalledTimes(1);
  expect(listeners).toHaveLength(0);
});
