/**
 * A SCREEN NEVER SAYS "SENT" WHEN NOTHING WAS SENT (DD-091, law 4).
 *
 * When the invitation row is created but its email fails, the panel must show
 * the honest state WITH its remedy — the accept link the manager can hand over
 * — and never the "Invitation sent" copy. This renders the real shared panel
 * (both org and project Manage pages use it) and reads what a person would see.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  InvitationsPanel,
  type InvitationDeliveryNotice,
} from "./InvitationsPanel";

const NOTICE: InvitationDeliveryNotice = {
  email: "dana@example.com",
  acceptUrl: "https://www.aimatrx.com/invitations/organization/accept/tok-123",
  reason: "Resend: missing API key",
};

/**
 * 🚨 THE SHAPES THAT ACTUALLY ARRIVE. `sendEmail` returns `new Error(...)` and
 * Resend's `{name,message}`; both survive the `fetch` as objects unless
 * something coerces them, and React THROWS on an object child — so the honest
 * banner died in exactly the failure it exists to report (finding I1,
 * 2026-09-11). The declared type says `string`, which TypeScript cannot enforce
 * across a network boundary, so these are cast in deliberately: this is the
 * render-seam guard for that class.
 */
const asNotice = (reason: unknown): InvitationDeliveryNotice =>
  ({ ...NOTICE, reason }) as unknown as InvitationDeliveryNotice;

let container: HTMLDivElement;
let root: Root;

async function render(deliveryNotice: InvitationDeliveryNotice | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <InvitationsPanel
        invitations={[]}
        roleOptions={[{ value: "member", label: "Member" }]}
        inviteAcceptUrl={(token) => `https://www.aimatrx.com/accept/${token}`}
        onInvite={() => {}}
        onCancel={() => {}}
        onResend={() => {}}
        deliveryNotice={deliveryNotice}
        onDismissDeliveryNotice={() => {}}
      />,
    );
  });
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test("REFUSAL: an email that did not go out is shown as exactly that, with the link to send by hand", async () => {
  await render(NOTICE);
  const text = container.textContent ?? "";

  expect(text).toContain("the email could not be sent");
  expect(text).toContain("dana@example.com");
  // The remedy is on screen, not hidden behind a hover or a toast that fades.
  expect(text).toContain(NOTICE.acceptUrl);
  expect(text).toContain("Resend: missing API key");
  expect(text).toContain("Copy invitation link");
  // And the screen never claims the opposite.
  expect(text).not.toContain("Invitation sent");
});

describe.each([
  [
    "an Error instance",
    new Error("EMAIL_FROM is not configured"),
    "EMAIL_FROM is not configured",
  ],
  [
    "Resend's {name,message} object",
    { name: "validation_error", message: "API key is invalid" },
    "API key is invalid",
  ],
  ["a bare {} (an Error after JSON.stringify)", {}, null],
])(
  "REFUSAL: the banner survives %s as the reason",
  (_label, reason, expected) => {
    test("renders without throwing, and shows the sentence when there is one", async () => {
      await render(asNotice(reason));
      const text = container.textContent ?? "";
      // It rendered at all — this is the crash guard.
      expect(
        container.querySelector('[data-testid="invitation-delivery-notice"]'),
      ).not.toBeNull();
      expect(text).toContain("the email could not be sent");
      expect(text).toContain(NOTICE.acceptUrl);
      if (expected) {
        expect(text).toContain(expected);
      } else {
        // Nothing readable in the error — the reason line is omitted rather than
        // printing "[object Object]".
        expect(text).not.toContain("Reason:");
        expect(text).not.toContain("object Object");
      }
    });
  },
);

test("a failed RESEND also says the recipient's earlier link is now dead", async () => {
  await render({ ...NOTICE, wasResend: true });
  const text = container.textContent ?? "";
  expect(text).toContain("no longer works");
});

test("CONTROL: with no failure there is no banner at all", async () => {
  await render(null);
  expect(
    container.querySelector('[data-testid="invitation-delivery-notice"]'),
  ).toBeNull();
  expect(container.textContent ?? "").not.toContain(
    "the email could not be sent",
  );
});
