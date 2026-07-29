import {
  preserveUploadedIdentity,
  shouldInheritActiveScope,
} from "./upload";
import type { NormalizedFile } from "./types";
import { classify } from "./utils/classify";

const hydratedFile: NormalizedFile = {
  origin: "owned",
  capabilities: {
    canRead: true,
    canEdit: true,
    canShare: true,
    canDelete: true,
    requiresAuth: true,
    transportSafeForFetch: false,
  },
  meta: classify({ fileName: "test.jpg", mime: "image/jpeg", sizeBytes: 12 }),
  lifecycle: { refreshable: true, persisted: true },
  scope: {},
  __source: { kind: "file_id", fileId: "hydrated-id" },
};

describe("shouldInheritActiveScope", () => {
  it("keeps personal uploads independent of the active app scope by default", () => {
    expect(shouldInheritActiveScope("personal")).toBe(false);
  });

  it("allows a personal upload to explicitly inherit the active app scope", () => {
    expect(shouldInheritActiveScope("personal", true)).toBe(true);
  });

  it.each(["public", "link", "internal"] as const)(
    "inherits the active app scope for %s uploads by default",
    (visibility) => {
      expect(shouldInheritActiveScope(visibility)).toBe(true);
    },
  );

  it("allows a non-personal upload to explicitly opt out of scope inheritance", () => {
    expect(shouldInheritActiveScope("public", false)).toBe(false);
  });

  it.each([
    "Shared Assets",
    "Shared Assets/feedback-images",
    "/Shared Assets/agent-variables/images/",
    "Private Assets",
    "Private Assets/transcripts",
  ])(
    "keeps the user-library namespace independent of ambient scope: %s",
    (folderPath) => {
      expect(shouldInheritActiveScope("public", undefined, folderPath)).toBe(
        false,
      );
    },
  );

  it("still honors an explicit scoped-write override for a user-library path", () => {
    expect(
      shouldInheritActiveScope("public", true, "Shared Assets/feedback-images"),
    ).toBe(true);
  });
});

describe("preserveUploadedIdentity", () => {
  it("keeps the authoritative creation id when hydration omits identity", () => {
    const error = jest.spyOn(console, "error").mockImplementation();

    const uploaded = preserveUploadedIdentity(
      { ...hydratedFile, fileId: undefined },
      "created-id",
    );

    expect(uploaded.fileId).toBe("created-id");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("hydrated=<missing>"),
    );
    error.mockRestore();
  });

  it("does not report recovery when hydration confirms the creation id", () => {
    const error = jest.spyOn(console, "error").mockImplementation();

    const uploaded = preserveUploadedIdentity(
      { ...hydratedFile, fileId: "created-id" },
      "created-id",
    );

    expect(uploaded.fileId).toBe("created-id");
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
