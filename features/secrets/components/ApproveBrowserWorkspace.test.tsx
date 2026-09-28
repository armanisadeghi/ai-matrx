import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const KEY = "900de8a5f008672ba127e944bbd888fb128456015e6fddd6a47b6c4d3c658181";
let mockParams = new URLSearchParams(`key=${KEY}&label=Chrome%20on%20Mac`);
let mockWorksHere = true;

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockParams,
}));

jest.mock("../passkey-approval", () => ({
  PASSKEY_RP_ID: "aimatrx.com",
  passkeysWorkHere: () => mockWorksHere,
  approveBrowserWithPasskey: jest.fn(),
  addAccountPasskey: jest.fn(),
}));

jest.mock("../vault-service", () => ({
  getVaultFillStepUpMethods: jest.fn(),
}));

import { ApproveBrowserWorkspace, shortFingerprint } from "./ApproveBrowserWorkspace";
import {
  addAccountPasskey,
  approveBrowserWithPasskey,
} from "../passkey-approval";
import { getVaultFillStepUpMethods } from "../vault-service";

const methods = getVaultFillStepUpMethods as jest.Mock;
const approve = approveBrowserWithPasskey as jest.Mock;
const addPasskey = addAccountPasskey as jest.Mock;

let container: HTMLDivElement;
let root: Root;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render() {
  await act(async () => {
    root.render(<ApproveBrowserWorkspace />);
  });
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );
  if (!found) throw new Error(`no button "${text}" in: ${container.textContent}`);
  return found as HTMLButtonElement;
}

beforeEach(() => {
  mockParams = new URLSearchParams(`key=${KEY}&label=Chrome%20on%20Mac`);
  mockWorksHere = true;
  methods.mockReset();
  approve.mockReset();
  addPasskey.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("shows the same short code the extension shows", () => {
  expect(shortFingerprint(KEY)).toBe("900D E8A5 F008 672B");
});

test("a person with a passkey approves this key and is sent back to the extension", async () => {
  methods.mockResolvedValue({ password: false, passkey: true });
  approve.mockResolvedValue({ expiresAt: "2026-09-28T23:20:00Z" });
  await render();
  expect(container.textContent).toContain("Turn on password filling in Chrome on Mac");
  expect(container.textContent).toContain("900D E8A5 F008 672B");
  await act(async () => button("Approve with passkey").click());
  expect(approve).toHaveBeenCalledWith({ keyThumbprint: KEY, label: "Chrome on Mac" });
  expect(container.querySelector('[data-testid="approve-browser-done"]')?.textContent).toContain(
    "Go back to the AI Matrx extension",
  );
});

test("a refused approval shows the server's sentence and keeps the button", async () => {
  methods.mockResolvedValue({ password: true, passkey: true });
  approve.mockRejectedValue(new Error("That passkey belongs to a different AI Matrx account."));
  await render();
  await act(async () => button("Approve with passkey").click());
  expect(container.textContent).toContain("belongs to a different AI Matrx account");
  expect(button("Approve with passkey").disabled).toBe(false);
});

test("a person with neither a password nor a passkey is told so and can add a passkey", async () => {
  methods
    .mockResolvedValueOnce({ password: false, passkey: false })
    .mockResolvedValueOnce({ password: false, passkey: true });
  addPasskey.mockResolvedValue(undefined);
  await render();
  expect(container.textContent).toContain("no password or passkey yet");
  await act(async () => button("Add a passkey").click());
  expect(addPasskey).toHaveBeenCalledTimes(1);
  expect(button("Approve with passkey")).toBeTruthy();
});

test("a password person without a passkey is offered both ways", async () => {
  methods.mockResolvedValue({ password: true, passkey: false });
  await render();
  expect(container.textContent).toContain("type your AI Matrx password in the extension instead");
  expect(button("Add a passkey")).toBeTruthy();
});

test("off aimatrx.com the page says passkeys work only there and links to it", async () => {
  mockWorksHere = false;
  await render();
  expect(methods).not.toHaveBeenCalled();
  expect(container.textContent).toContain("work only on aimatrx.com");
  expect(container.querySelector("a")?.getAttribute("href")).toMatch(
    /^https:\/\/www\.aimatrx\.com\//,
  );
  expect(container.textContent).not.toContain("Approve with passkey");
});

test("a link without a key says what to do instead of offering a button", async () => {
  mockParams = new URLSearchParams("");
  await render();
  expect(container.textContent).toContain("missing the browser to approve");
  expect(container.querySelectorAll("button")).toHaveLength(0);
});
