/**
 * THE ACCOUNT SWITCHER SAYS WHAT WILL ACTUALLY HAPPEN.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R2, N5). The "Use a different Google
 * account" item promised "it becomes a second connected account". The hub
 * resolves the connection it is about to write by PROVIDER SUBJECT and owner
 * (`exchange_and_store_connection`: `filters = {provider, provider_subject,
 * deleted_at__isnull}` plus the owner leg, then an upsert on the row it finds),
 * so signing in with an identity this owner already has connected REFRESHES that
 * same account — no second row, no second card in Settings. The promise was
 * false in exactly the case a person is most likely to hit: they pick the
 * account they were already using.
 *
 * The copy lives in one exported function per line, so the dialog and any future
 * consent surface read the same words and this test can hold them to the server's
 * behaviour.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  newAccountChoiceDescription,
  newAccountFootnote,
} from "../ConnectorConsentDialog";

describe("the 'different account' copy", () => {
  it("says a login already connected here is refreshed, not duplicated", () => {
    const description = newAccountChoiceDescription("Google");
    expect(description).toContain("Google asks you to sign in");
    expect(description).toMatch(/refresh/i);
    expect(description).not.toContain("second connected account");
  });

  it("promises a second account only for a login that is new here", () => {
    const footnote = newAccountFootnote("Google");
    expect(footnote).toMatch(/refresh/i);
    expect(footnote).toContain("Nothing you have already connected");
    // The unconditional "this adds a second Google account" is the false half.
    expect(footnote).not.toMatch(/^Nothing you have already connected changes — this adds a second/);
  });

  it("leaves no copy of the old promise in the dialog's own code", () => {
    // Comment lines may still QUOTE the retired promise — that is the record of
    // why it changed. What must not survive is a line the dialog renders.
    const code = readFileSync(
      path.join(__dirname, "..", "ConnectorConsentDialog.tsx"),
      "utf8",
    )
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join("\n");
    expect(code).not.toContain("second connected account");
  });
});
