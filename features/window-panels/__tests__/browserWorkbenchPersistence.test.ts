import {
  BROWSER_WORKBENCH_TABS_MAX,
  parseBrowserWorkbenchTabs,
} from "@/features/window-panels/windows/iframe/BrowserWorkbenchWindow";

describe("Browser Workbench restored tabs", () => {
  it("normalizes URLs, rejects invalid/duplicate rows, and caps the tab set", () => {
    const rows = [
      { id: " first ", label: " Example ", url: "example.com" },
      { id: "first", label: "Duplicate", url: "https://duplicate.test" },
      { id: "bad", label: "Bad", url: "https://[invalid" },
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `tab-${index}`,
        label: `Tab ${index}`,
        url: `site-${index}.example`,
      })),
    ];

    const result = parseBrowserWorkbenchTabs(rows);

    expect(result).toHaveLength(BROWSER_WORKBENCH_TABS_MAX);
    expect(result[0]).toEqual({
      id: "first",
      label: "Example",
      url: "https://example.com/",
    });
    expect(new Set(result.map((tab) => tab.id)).size).toBe(result.length);
    expect(result.every((tab) => tab.url.startsWith("https://"))).toBe(true);
  });
});
