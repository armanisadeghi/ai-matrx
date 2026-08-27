import { readFileSync } from "node:fs";
import { join } from "node:path";

const fileMenu = readFileSync(join(__dirname, "FileContextMenu.tsx"), "utf8");
const folderMenu = readFileSync(
  join(__dirname, "../FolderContextMenu/FolderContextMenu.tsx"),
  "utf8",
);
const renameDialog = readFileSync(
  join(__dirname, "../RenameDialog/RenameDialog.tsx"),
  "utf8",
);

describe("Files row action responsive contract", () => {
  it("keeps a canonical Move picker when a file host supplies no callback", () => {
    expect(fileMenu).toContain("const handleMove = useCallback(async () => {");
    expect(fileMenu).toContain(
      'const target = await openFolderPicker({ title: "Move to…" });',
    );
    expect(fileMenu).toContain("onClick={() => void handleMove()}");
  });

  it("keeps file and folder action dialogs at the tablet touch floor", () => {
    expect(fileMenu.match(/className="max-lg:min-h-11"/g)).toHaveLength(4);
    expect(folderMenu.match(/max-lg:min-h-11/g)).toHaveLength(2);
    expect(renameDialog.match(/max-lg:min-h-11/g)).toHaveLength(2);
  });
});
