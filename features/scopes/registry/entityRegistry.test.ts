import { getEntityInfo } from "./entityRegistry";

describe("entityRegistry content-role resolution", () => {
  it("treats a null content_role as an expected unclassified entity", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const info = getEntityInfo("youtube_search");

    expect(info.contentRole).toBe("destination");
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("preserves an explicitly classified content role", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const info = getEntityInfo("web_page");

    expect(info.contentRole).toBe("source");
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
