import { renderToStaticMarkup } from "react-dom/server";

import AuthPageContainer from "../auth-page-container";
import { SubmitButton } from "@/components/submit-button";

jest.mock("@/components/branding/MatrixLogo", () => ({ __esModule: true, default: () => <div>Logo</div> }));

describe("auth page: a guest's records come with them", () => {
  it("shows the one line above the form when a note is given, nothing otherwise", () => {
    const withNote = renderToStaticMarkup(
      <AuthPageContainer title="Create your account" note="Your 3 records come with you.">
        <form aria-label="Signup form" />
      </AuthPageContainer>,
    );
    expect(withNote).toContain("Your 3 records come with you.");
    expect(withNote.indexOf("Your 3 records")).toBeLessThan(withNote.indexOf("Signup form"));
    const without = renderToStaticMarkup(
      <AuthPageContainer title="Create your account">
        <form aria-label="Signup form" />
      </AuthPageContainer>,
    );
    expect(without).not.toContain("auth-guest-note");
  });
});

describe("SubmitButton before the page's script has loaded (server HTML = the pre-hydration state)", () => {
  it("a button that needs script says it is getting ready and is disabled — never a silent press", () => {
    const html = renderToStaticMarkup(<SubmitButton needsScript>Sign up</SubmitButton>);
    expect(html).toContain("Getting ready…");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Sign up");
  });

  it("a button that works without script is untouched", () => {
    const html = renderToStaticMarkup(<SubmitButton>Google</SubmitButton>);
    expect(html).toContain("Google");
    expect(html).not.toContain("Getting ready");
  });
});
