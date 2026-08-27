import fs from "node:fs";
import path from "node:path";

describe("Files mobile rename host", () => {
  it("mounts the shared rename listener with drawer presentation", () => {
    const pageShell = fs.readFileSync(
      path.join(__dirname, "PageShell.tsx"),
      "utf8",
    );
    const renameHost = fs.readFileSync(
      path.join(__dirname, "../core/RenameDialog/RenameHost.tsx"),
      "utf8",
    );
    const renameDialog = fs.readFileSync(
      path.join(__dirname, "../core/RenameDialog/RenameDialog.tsx"),
      "utf8",
    );

    expect(pageShell).toContain('<RenameHost presentation="drawer" />');
    expect(renameHost).toContain('presentation?: "dialog" | "drawer"');
    expect(renameDialog).toContain('presentation === "drawer"');
    expect(renameDialog).toContain("<DrawerContent");
  });
});
