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
  acceptUrl:
    "https://www.aimatrx.com/invitations/organization/accept/tok-123?email=dana%40example.com",
  reason: "Resend: missing API key",
};

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
