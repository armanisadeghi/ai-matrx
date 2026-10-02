// The deck page's desktop action bar keeps Progress (formerly "History") as
// its own button. It was folded into the Study menu twice (2026-09-27,
// 2026-09-28) and an independent production check (verify-6, 2026-10-01)
// reported it gone. This reads the desktop bar out of SetDetailView and fails
// when Progress is missing from it or sits inside a dropdown menu.

import { readFileSync } from "node:fs";
import path from "node:path";

const SOURCE = readFileSync(path.join(__dirname, "..", "SetDetailView.tsx"), "utf8");

function desktopRow(): string {
  const start = SOURCE.indexOf('className="hidden items-center justify-between gap-3 md:flex"');
  const end = SOURCE.indexOf('className="mt-2 space-y-2 md:hidden"', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return SOURCE.slice(start, end);
}

describe("deck page desktop action bar", () => {
  it("shows Progress as a button of its own, outside every menu", () => {
    const row = desktopRow();
    const at = row.indexOf('data-deck-action="progress"');
    expect(at).toBeGreaterThan(-1);
    const before = row.slice(0, at);
    const opened = before.split("<DropdownMenuContent").length - 1;
    const closed = before.split("</DropdownMenuContent>").length - 1;
    expect(opened - closed).toBe(0);
  });
});
