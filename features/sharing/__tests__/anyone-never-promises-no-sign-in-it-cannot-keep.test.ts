// The Public tab's "Anyone" choice once said "no sign-in" for every type — a mandate,
// agent or workflow set to Anyone is NOT readable signed out (no /p/e page; for a mandate
// `anon` has no SELECT grant at all). The words must follow what the platform delivers.
import { anyoneReachWords } from "@/features/sharing/components/tabs/PublicAccessTab";
import { hasPublicPage } from "@/utils/permissions/publicLane";

describe("the Anyone choice never promises a signed-out read it cannot deliver", () => {
  it("a type with no public page (mandate) never says 'no sign-in'", () => {
    expect(hasPublicPage("mandate")).toBe(false);
    const words = anyoneReachWords("mandate", { publicPage: hasPublicPage("mandate"), noLoginLink: false });
    expect(words).not.toMatch(/no sign-in/i);
    expect(words).toContain("Everyone signed in to AI Matrx");
    expect(words).toContain("cannot open it");
  });

  it("a link-shareable type without a page (workflow) points at the no-login link", () => {
    const words = anyoneReachWords("workflow", { publicPage: hasPublicPage("workflow"), noLoginLink: true });
    expect(words).not.toMatch(/no sign-in/i);
    expect(words).toContain("no-login link");
  });

  it("a type with a real public page (note) says the law's words: anyone, signed in or not", () => {
    expect(anyoneReachWords("note", { publicPage: hasPublicPage("note"), noLoginLink: true })).toBe(
      "Anyone, signed in or not, opens this note at its address as a viewer.",
    );
  });

  it("a table row (access ladder T-40) has its own page, so it says the same", () => {
    expect(hasPublicPage("record")).toBe(true);
    expect(anyoneReachWords("record", { publicPage: hasPublicPage("record"), noLoginLink: true })).toBe(
      "Anyone, signed in or not, opens this record at its address as a viewer.",
    );
  });
});
