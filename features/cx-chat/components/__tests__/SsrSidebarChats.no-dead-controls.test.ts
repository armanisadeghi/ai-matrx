// DD-157 guard — the deprecated `cx-chat` sidebar (SsrSidebarChats) is
// documented inert: the "own conversations" Redux selectors are hardcoded
// stubs (see the file's header comment) and its rename/delete mutations
// resolved to permanent no-ops. Law 4 ("a control is absent or honest, never
// dead") forbids shipping a menu item whose click can never do anything.
//
// This is a source-level guard rather than a rendered-DOM test because the
// repo has no @testing-library/react, and Radix's DropdownMenuContent only
// mounts into a portal when opened — asserting on it without RTL would be
// brittle. Reading the compiled source for the removed identifiers is a
// direct, deterministic proof that the dead controls are gone and cannot
// silently come back.
//
// Proven RED against the pre-fix file (git show HEAD~1 back to
// c5e7... — see B-70 report) before this fix landed: the source contained
// `Pencil`, `Trash2`, `InlineRename`, `DeleteConfirm`,
// `renameConversationMutation`, and `deleteConversationMutation`, and the
// assertions below failed.

import fs from "fs";
import path from "path";

const SOURCE_PATH = path.join(__dirname, "..", "SsrSidebarChats.tsx");
const source = fs.readFileSync(SOURCE_PATH, "utf8");

describe("SsrSidebarChats — no dead Rename/Delete controls (DD-157)", () => {
  it("does not import the Rename/Delete-only icons", () => {
    expect(source).not.toMatch(/\bPencil\b/);
    expect(source).not.toMatch(/\bTrash2\b/);
  });

  it("does not define the inline rename or delete-confirm UI", () => {
    expect(source).not.toMatch(/InlineRename/);
    expect(source).not.toMatch(/DeleteConfirm/);
  });

  it("does not dispatch the no-op rename/delete mutations", () => {
    expect(source).not.toMatch(/renameConversationMutation/);
    expect(source).not.toMatch(/deleteConversationMutation/);
  });

  it("does not render a Rename or Delete dropdown menu item", () => {
    // The Share item is real (opens ShareModal); Rename/Delete text as a
    // DropdownMenuItem label must not appear anywhere in the source.
    expect(source).not.toMatch(/>\s*Rename\s*</);
    expect(source).not.toMatch(/>\s*Delete\s*</);
  });

  it("still renders the real Share control", () => {
    expect(source).toMatch(/>\s*Share\s*</);
    expect(source).toMatch(/ShareModal/);
  });
});
