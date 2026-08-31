import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import {
  putMandateBinding,
  removeMandateBinding,
} from "../overrides";

jest.mock("@/lib/api/call-api", () => ({
  callApi: jest.fn((config: unknown) => config),
}));

jest.mock("../service", () => ({
  invalidateMandateCache: jest.fn(),
}));

const callApiMock = jest.mocked(callApi);
const TARGET_ORGANIZATION_ID = "39c38960-d30c-4840-b0c1-c9960de95582";

function dispatchWith(data: unknown): AppDispatch {
  return jest.fn().mockResolvedValue({ data }) as unknown as AppDispatch;
}

describe("mandate binding organization context", () => {
  beforeEach(() => callApiMock.mockClear());

  it.each([
    ["PUT", async (dispatch: AppDispatch) =>
      putMandateBinding(
        dispatch,
        "podcast.multihost_script",
        { principalType: "org", organizationId: TARGET_ORGANIZATION_ID },
        { agentId: "agent-1", configOverrides: null },
      )],
    ["DELETE", async (dispatch: AppDispatch) =>
      removeMandateBinding(dispatch, "podcast.multihost_script", {
        principalType: "org",
        organizationId: TARGET_ORGANIZATION_ID,
      })],
  ])(
    "binds the %s request header scope to the target organization",
    async (method, invoke) => {
      await invoke(dispatchWith(method === "PUT" ? { notes: [] } : {}));

      expect(callApiMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method,
          scopeOverrides: { organization_id: TARGET_ORGANIZATION_ID },
          body: expect.objectContaining({
            organization_id: TARGET_ORGANIZATION_ID,
          }),
        }),
      );
    },
  );

  it("keeps personal bindings on the ambient request organization", async () => {
    await removeMandateBinding(dispatchWith({}), "podcast.multihost_script", {
      principalType: "user",
    });

    expect(callApiMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ scopeOverrides: expect.anything() }),
    );
  });
});
