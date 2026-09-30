jest.mock("@/lib/python-client", () => ({
  resolveFilesBaseUrl: () => "https://files.matrxserver.com",
}));

jest.mock("@/utils/permissions/shareLinks", () => ({
  shareLinkUrl: (token: string) => `https://www.aimatrx.com/s/${token}`,
}));

import {
  fileUrls,
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

describe("durable authenticated file URL contract", () => {
  it("builds durable download + inline URLs from the file id alone", () => {
    expect(fileUrls("3e031c3f-b1e3-425c-ac49-217ad074b1d5")).toEqual({
      download:
        "https://files.matrxserver.com/files/3e031c3f-b1e3-425c-ac49-217ad074b1d5/download",
      // `?inline=1` matches the exact spelling the backend emits on
      // `FileRecord.url` so both spellings share one cache key.
      inline:
        "https://files.matrxserver.com/files/3e031c3f-b1e3-425c-ac49-217ad074b1d5/download?inline=1",
    });
  });

  it("percent-encodes the id so a hostile value cannot escape its path segment", () => {
    expect(fileUrls("a/b?c#d")).toEqual({
      download: "https://files.matrxserver.com/files/a%2Fb%3Fc%23d/download",
      inline: "https://files.matrxserver.com/files/a%2Fb%3Fc%23d/download?inline=1",
    });
    expect(pythonShareUrl("t/k")).toBe("https://files.matrxserver.com/share/t%2Fk");
  });
});
