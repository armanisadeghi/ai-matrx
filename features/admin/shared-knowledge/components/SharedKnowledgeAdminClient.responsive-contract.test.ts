import { readFileSync } from "node:fs";
import { join } from "node:path";

const sharedKnowledgeShell = readFileSync(
  join(__dirname, "SharedKnowledgeAdminClient.tsx"),
  "utf8",
);
const packDetail = readFileSync(
  join(__dirname, "../packs/PackDetail.tsx"),
  "utf8",
);

describe("Shared Knowledge mobile tab geometry", () => {
  it("keeps every console tab reachable with a 44px touch target", () => {
    expect(
      sharedKnowledgeShell.match(/min-h-11 shrink-0 whitespace-nowrap/g),
    ).toHaveLength(5);
  });

  it("keeps every starter-pack section tab reachable with a 44px touch target", () => {
    expect(
      packDetail.match(/min-h-11 shrink-0 whitespace-nowrap/g),
    ).toHaveLength(5);
  });
});
