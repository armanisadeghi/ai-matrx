/** @jest-environment node */
import { NextRequest } from "next/server";
import { GET } from "./route";

test("renders a neutral no-state GitHub refresh notice without a popup outcome", async () => {
  const response = await GET(
    new NextRequest(
      "https://www.aimatrx.com/api/github/oauth/complete?github_notice=refresh&return_url=%2Fcode",
    ),
  );
  const html = await response.text();
  expect(html).toContain("Return to AI Matrx");
  expect(html).toContain("If you changed repository access in GitHub, refresh your GitHub connection in AI Matrx to load it.");
  expect(html).not.toContain("color:#f87171");
  expect(html).not.toContain("github_oauth_complete");
  expect(html).not.toContain("github_oauth_error");
  expect(html).not.toContain("window.close");
});
