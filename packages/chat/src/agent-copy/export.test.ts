import { downloadFile, downloadUrl } from "./export";

describe("the one download door", () => {
  let clicked: HTMLAnchorElement[];
  const create = jest.fn(() => "blob:test-1");
  const revoke = jest.fn();

  beforeEach(() => {
    clicked = [];
    jest.useFakeTimers();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    create.mockClear();
    revoke.mockClear();
  });

  it("downloadFile saves the bytes under the filename and revokes after a beat, not in the click's tick", () => {
    downloadFile("a.csv", "x,y", "text/csv");
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("a.csv");
    expect(clicked[0].getAttribute("href")).toBe("blob:test-1");
    expect(revoke).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1_000);
    expect(revoke).toHaveBeenCalledWith("blob:test-1");
    expect(document.body.querySelector("a")).toBeNull();
  });

  it("downloadUrl saves a URL that already exists and never makes an object URL", () => {
    downloadUrl("data:image/png;base64,AAAA", "d.png");
    expect(create).not.toHaveBeenCalled();
    expect(clicked[0].download).toBe("d.png");
    expect(clicked[0].target).toBe("");
  });

  it("downloadUrl newTab opens noopener", () => {
    downloadUrl("https://example.test/f.pdf", "f.pdf", { newTab: true });
    expect(clicked[0].target).toBe("_blank");
    expect(clicked[0].rel).toBe("noopener noreferrer");
  });
});
