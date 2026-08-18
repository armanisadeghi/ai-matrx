import { createAdminClient } from "@/utils/supabase/adminClient";
import { logTranscriptionError } from "../audioErrorLogger";

jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: jest.fn(),
}));
jest.mock("@/lib/organizations/systemOrg", () => ({
  resolveSystemOrgId: jest.fn(),
}));

describe("logTranscriptionError", () => {
  it("defensively rejects a recoverable chunk transport failure at the server boundary", async () => {
    await logTranscriptionError({
      userId: "user-1",
      errorCode: "CHUNK_FAILED",
      errorMessage: "Load failed",
      fileSizeBytes: 20_140,
      chunkIndex: 11,
      attemptNumber: 1,
      apiRoute: "/audio/transcribe",
    });

    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
