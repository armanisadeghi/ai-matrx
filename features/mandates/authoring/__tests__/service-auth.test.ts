import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import { createClient } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import {
  createMandate,
  patchMandateDraftInputs,
  patchMandateGoal,
} from "../service";

jest.mock("@/lib/api/call-api", () => ({
  callApi: jest.fn((config: unknown) => config),
}));

jest.mock("@/utils/supabase/client", () => ({
  createClient: jest.fn(() => ({ client: "supabase" })),
}));

jest.mock("@/utils/supabase/webDb", () => ({
  requireAuthenticatedSupabaseSession: jest.fn(),
}));

const callApiMock = jest.mocked(callApi);
const createClientMock = jest.mocked(createClient);
const requireSessionMock = jest.mocked(requireAuthenticatedSupabaseSession);

describe("mandate authoring authentication boundary", () => {
  const dispatch = jest.fn().mockResolvedValue({
    data: { mandate_key: "feature.job", mandate_id: "mandate-1" },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    dispatch.mockResolvedValue({
      data: { mandate_key: "feature.job", mandate_id: "mandate-1" },
    });
    requireSessionMock.mockResolvedValue({
      access_token: "test-token",
    } as Awaited<ReturnType<typeof requireAuthenticatedSupabaseSession>>);
  });

  it.each([
    [
      "create",
      () =>
        createMandate(dispatch as unknown as AppDispatch, {
          mandateKey: "feature.job",
          label: "Job",
          goal: "Do the job",
          draftInputs: [],
        }),
    ],
    [
      "goal edit",
      () =>
        patchMandateGoal(
          dispatch as unknown as AppDispatch,
          "feature.job",
          "New goal",
        ),
    ],
    [
      "draft-input edit",
      () =>
        patchMandateDraftInputs(
          dispatch as unknown as AppDispatch,
          "feature.job",
          [],
        ),
    ],
  ])("establishes a browser session before the %s request", async (_name, run) => {
    await run();

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(requireSessionMock).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(requireSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
      dispatch.mock.invocationCallOrder[0]!,
    );
  });

  it("does not dispatch POST /mandates when the browser session is absent", async () => {
    requireSessionMock.mockRejectedValueOnce(new Error("sign in required"));

    await expect(
      createMandate(dispatch as unknown as AppDispatch, {
        mandateKey: "feature.job",
        label: "Job",
        goal: "Do the job",
        draftInputs: [],
      }),
    ).rejects.toThrow("sign in required");

    expect(dispatch).not.toHaveBeenCalled();
    expect(callApiMock).not.toHaveBeenCalled();
  });
});
