const mockListForEntity = jest.fn();

jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    listForEntity: (...args: unknown[]) => mockListForEntity(...args),
    listForSources: jest.fn(),
  },
}));

jest.mock("@/features/education/library/service", () => ({
  fetchEducationLibraryPage: jest.fn(),
}));

jest.mock("@/features/education/media/service", () => ({
  studyMediaService: { listByIds: jest.fn() },
}));

import { readKit } from "../kitService";

describe("readKit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects when the authoritative lineage read fails instead of claiming the kit is empty", async () => {
    mockListForEntity.mockResolvedValue({
      ok: false,
      error: { message: "JWT expired" },
    });

    await expect(readKit("file", "kit-1")).rejects.toThrow(
      "Could not read generated artifacts for file:kit-1",
    );
  });
});
