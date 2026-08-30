import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("membership copy mobile control contract", () => {
  it("keeps shared standalone copy/export triggers at 44px on mobile", () => {
    expect(source("components/agent-copy/ExportMenu.tsx")).toContain(
      '"h-11 w-11 shrink-0 lg:h-7 lg:w-7"',
    );
    expect(source("components/agent-copy/AiCopyMenu.tsx")).toContain(
      '"shrink-0"',
    );
    expect(
      source("features/matrx-envelope/components/ReferencesBulkCopyButton.tsx"),
    ).toContain('"h-11 w-11 shrink-0 lg:h-6 lg:w-6"');
  });

  it("keeps invitation row actions at 44px on mobile", () => {
    const invitations = source("components/membership/InvitationsPanel.tsx");
    expect(invitations).toContain('className="h-11 lg:h-8"');
    expect(invitations).toContain('className="h-11 min-w-11 px-0 text-red-600');
  });
});
