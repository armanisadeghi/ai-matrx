/**
 * Read aloud with no organization selected (RC-B6 verify: every item errored
 * "Select an organization before sending this request."). Speaking happens IN
 * an organization, so the queue holds the item on the one gate (ensureOrgId:
 * join the boot, then ask); the chosen organization lets it proceed, and a
 * declined picker drops the item quietly — never a raw refusal on the item.
 */
jest.mock("@/features/audio/activation", () => ({ activateAudio: jest.fn() }));
jest.mock("@/features/audio/unlock", () => ({ primeAudioOutput: jest.fn() }));
jest.mock("../playbackLock", () => ({ claimPlayback: jest.fn(), releasePlayback: jest.fn() }));

const start = jest.fn();
jest.mock("../adapters/cartesiaAdapter", () => ({ cartesiaAdapter: { start } }));
jest.mock("../adapters/catalogAdapter", () => ({ catalogAdapter: { start } }));

const ensureOrgId = jest.fn();
jest.mock("@/lib/organizations/personalOrg", () => ({ ensureOrgId: (...a: unknown[]) => ensureOrgId(...a) }));

import { OrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";

const flush = () => new Promise((r) => setTimeout(r, 0));

async function loadQueue() {
  let mod: typeof import("../playbackQueue");
  jest.isolateModules(() => {
    mod = require("../playbackQueue");
  });
  return mod!;
}

beforeEach(() => {
  start.mockReset();
  ensureOrgId.mockReset();
  start.mockImplementation(async (_item: unknown, cb: { onPlaying: () => void }) => {
    cb.onPlaying();
    return { stop: async () => {} };
  });
});

it("asks for the organization first, then plays", async () => {
  ensureOrgId.mockResolvedValue("org-chosen");
  const q = await loadQueue();
  const { id } = q.enqueuePlayback({ provider: "cartesia", text: "hello" } as never);
  for (let i = 0; i < 5; i++) await flush();
  expect(ensureOrgId).toHaveBeenCalledWith(null);
  expect(start).toHaveBeenCalledTimes(1);
  expect(q.getPlaybackSnapshot().items.find((x) => x.id === id)?.status).toBe("playing");
});

it("a declined picker drops the item without an error", async () => {
  ensureOrgId.mockRejectedValue(new OrganizationSelectionCancelled());
  const q = await loadQueue();
  const { id } = q.enqueuePlayback({ provider: "cartesia", text: "hello" } as never);
  for (let i = 0; i < 5; i++) await flush();
  expect(start).not.toHaveBeenCalled();
  expect(q.getPlaybackSnapshot().items.find((x) => x.id === id)).toBeUndefined();
});
