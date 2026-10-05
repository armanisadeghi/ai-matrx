import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AccountExportSection } from "./AccountExportSection";

const mockExport = jest.fn();
const mockDownload = jest.fn();
jest.mock("./service", () => ({ exportPersonalAccount: () => mockExport() }));
jest.mock("@/utils/file-operations/utils", () => ({ downloadBlob: (...args: unknown[]) => mockDownload(...args) }));

describe("account download control", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { jest.clearAllMocks(); mockDownload.mockReturnValue(true); });
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  async function clickDownload() {
    await act(async () => root.render(<AccountExportSection />));
    const button = Array.from(container.querySelectorAll("button")).find(candidate => candidate.textContent?.includes("Download account data"));
    if (!button) throw new Error("Account download button is missing.");
    await act(async () => { button.click(); });
    return button;
  }
  it("downloads the completed archive only after the read succeeds", async () => {
    mockExport.mockResolvedValue({ manifest: { exportedAt: "2026-10-05T12:00:00.000Z" }, identity: { id: "person" } });
    const button = await clickDownload();
    expect(mockDownload).toHaveBeenCalledWith(expect.any(Blob), "ai-matrx-account-2026-10-05.json");
    expect(button.disabled).toBe(false);
  });
  it("shows a retryable error with no download after a failed source", async () => {
    mockExport.mockRejectedValue(new Error("Couldn’t read billing data."));
    const button = await clickDownload();
    expect(container.textContent).toContain("Couldn’t read billing data.");
    expect(mockDownload).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
  });
  it("reports a browser download failure instead of claiming success", async () => {
    mockExport.mockResolvedValue({ manifest: { exportedAt: "2026-10-05T12:00:00.000Z" } });
    mockDownload.mockReturnValue(false);
    await clickDownload();
    expect(container.textContent).toContain("Couldn’t download account data. Try again.");
  });
});
