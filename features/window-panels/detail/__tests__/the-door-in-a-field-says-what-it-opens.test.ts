// 🚨 A DOOR IN A FIELD SAYS WHAT IT OPENS (chair, 2026-09-18).
//
// `DetailBody` renders a field whose value names another record through the host's
// `doors.RefCell` port, and that port was bound to `MatrxUuidCell` — which takes
// no display name and can only show a truncated id. So a field whose text was
// "Acme Robotics" printed `9e1d77aa…`: an identity the UI names, showing nothing a
// person can read, one click short of a dead end.
//
// The primitive now hands the name over (`DetailField.ref.name`, else the field's
// own text). The HOST's half is which component renders it, and the rule that
// matters is that it is the platform's ONE named-door primitive — `EntityRef`,
// which resolves the route and the peek from the same registries — and not a
// second one invented here.
//
// Red before the binding: `RefCell` was `MatrxUuidCell` unconditionally and took
// no `name` at all.

import { readFileSync } from "node:fs";
import path from "node:path";

const SOURCE = readFileSync(path.resolve(__dirname, "../DetailHost.tsx"), "utf8");

describe("the host's RefCell binding", () => {
  it("renders the platform's named-door primitive when it is given a name", () => {
    expect(SOURCE).toMatch(/function RefCell\([\s\S]*?name\?: string \| null;/);
    expect(SOURCE).toContain("<EntityRef token={token} id={value} name={name} />");
    expect(SOURCE).toContain(
      'from "@/components/official/entity-ref/EntityRef"',
    );
  });

  it("keeps the uuid cell — and its copy control — when there is no name to show", () => {
    expect(SOURCE).toContain("if (name && name !== value)");
    expect(SOURCE).toContain("<MatrxUuidCell value={value} label={label} token={token} />");
  });

  it("invents no second door resolver", () => {
    const refCell = SOURCE.slice(SOURCE.indexOf("function RefCell("));
    const body = refCell.slice(0, refCell.indexOf("\n}\n") + 3);
    expect(body).not.toMatch(/href=|router\.|resolveEntityDoors|useRouter/);
  });
});
