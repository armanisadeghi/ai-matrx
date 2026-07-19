jest.mock("@/lib/python-client", () => ({
  resolveFilesBaseUrl: () => "https://files.matrxserver.com",
}));

jest.mock("@/utils/permissions/shareLinks", () => ({
  shareLinkUrl: (token: string) => `https://www.aimatrx.com/s/${token}`,
}));

import {
  pythonShareUrl,
  shareUrls,
} from "@/features/files/handler/utils/python-base";

describe("public share URL contract", () => {
  it("uses one clean, directly embeddable URL as the copied public link", () => {
    expect(pythonShareUrl("public-token")).toBe(
      "https://files.matrxserver.com/share/public-token",
    );
  });

  it("keeps public bytes, explicit download, and landing-page URLs distinct", () => {
    expect(shareUrls("public-token")).toEqual({
      public: "https://files.matrxserver.com/share/public-token",
      attachment:
        "https://files.matrxserver.com/share/public-token/download?inline=false",
      page: "https://www.aimatrx.com/s/public-token",
    });
  });
});
