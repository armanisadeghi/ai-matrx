/**
 * GUARD — "+ New Note" in a folder files into THAT folder (verifier round 2).
 *
 * The folder row "+" refused with "This folder cannot be used until its
 * identity is available. Choose a folder and try again." — with or without a
 * workspace — whenever the folder's notes carried `folder_name` with no
 * `folder_id` (older notes; 35 of admin's). The person had just chosen the
 * folder. A name-only folder now files by its NAME through the atomic
 * get-or-create; a folder with an id files by id; an unfiled group stays unfiled.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newNoteFolderDestination } from "../types";

const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

describe("newNoteFolderDestination", () => {
  it("a name-only folder files by its name — never a refusal", () => {
    expect(
      newNoteFolderDestination({ organization_id: ORG, folder_id: null, folder_name: "Kiln logs" }, `pending:${ORG}:Kiln logs`, ORG),
    ).toEqual({ kind: "create", name: "Kiln logs", organizationId: ORG });
  });

  it("a folder with an id files by id", () => {
    expect(
      newNoteFolderDestination({ organization_id: ORG, folder_id: "f-1", folder_name: "Glazes" }, `folder:${ORG}:f-1`, ORG),
    ).toEqual({ kind: "existing", folder: { id: "f-1", organizationId: ORG, name: "Glazes" } });
  });

  it("an unfiled group stays unfiled; a fresh folder is created by its name", () => {
    expect(newNoteFolderDestination({ organization_id: ORG, folder_id: null, folder_name: null }, "Unfiled", ORG)).toEqual({
      kind: "unfiled",
      organizationId: ORG,
    });
    expect(newNoteFolderDestination(undefined, "Draft", ORG)).toEqual({ kind: "create", name: "Draft", organizationId: ORG });
  });

  it("the sidebar's + uses this rule and carries no folder-identity refusal", () => {
    const src = readFileSync(join(__dirname, "..", "components", "NoteSidebar.tsx"), "utf8");
    expect(src).toContain("newNoteFolderDestination(target, folder, organizationId)");
    expect(src).not.toContain("cannot be used until its identity is available");
  });
});
