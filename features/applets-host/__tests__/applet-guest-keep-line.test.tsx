import { renderToStaticMarkup } from "react-dom/server";

import { AppletGuestKeepLine, guestKeepLineShown } from "@/features/applets-host/AppletGuestKeepLine";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/applets/post-tracker", useSearchParams: () => new URLSearchParams() }));
jest.mock("@/hooks/auth/useLoginHref", () => ({ useLoginHref: (p: string) => p }));

describe("the guest account line", () => {
  it("shows for a returning guest holding the reminder count (revisit, no save needed)", () => {
    expect(guestKeepLineShown({ saved: 3, reminderAt: 3, ceiling: 25 })).toBe(true);
    expect(guestKeepLineShown({ saved: 2, reminderAt: 3, ceiling: 25 })).toBe(false);
  });

  it("says in one line what happened at the ceiling, and offers the account button", () => {
    const html = renderToStaticMarkup(<AppletGuestKeepLine status={{ saved: 25, reminderAt: 3, ceiling: 25 }} />);
    expect(html).toContain("You&#x27;ve reached 25 records as a guest — create a free account to keep going; this entry stays here.");
    expect(html).toContain("Create free account");
  });

  it("below the ceiling keeps the keep-these line", () => {
    const html = renderToStaticMarkup(<AppletGuestKeepLine status={{ saved: 3, reminderAt: 3, ceiling: 25 }} />);
    expect(html).toContain("your 3 records come with you");
  });
});
