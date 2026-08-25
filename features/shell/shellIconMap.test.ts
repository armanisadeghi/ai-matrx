import {
  isShellIconName,
  resolveShellIconName,
  shellIconComponents,
} from "./shellIconMap";

describe("shell icon registry", () => {
  it("registers the mobile navigation Back icon", () => {
    expect(isShellIconName("ChevronLeft")).toBe(true);
    expect(resolveShellIconName("ChevronLeft")).toBe("ChevronLeft");
    expect(shellIconComponents.ChevronLeft).toBeDefined();
  });
});
