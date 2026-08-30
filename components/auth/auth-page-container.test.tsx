import { renderToStaticMarkup } from "react-dom/server";

import AuthPageContainer from "./auth-page-container";

jest.mock("@/components/branding/MatrixLogo", () => ({
  __esModule: true,
  default: () => <div>Logo</div>,
}));

describe("AuthPageContainer", () => {
  it("puts an actionable error before the form and exposes it as an alert", () => {
    const markup = renderToStaticMarkup(
      <AuthPageContainer
        title="Create your account"
        message={{ type: "error", message: "Try again later" }}
      >
        <form aria-label="Signup form" />
      </AuthPageContainer>,
    );

    expect(markup).toContain('role="alert"');
    expect(markup.indexOf("Try again later")).toBeLessThan(
      markup.indexOf("Signup form"),
    );
  });
});
