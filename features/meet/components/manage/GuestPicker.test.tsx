/**
 * A typed address that belongs to an ACCOUNT is that account (verifier,
 * 2026-09-29): test@test.com was not one of the host's connections, so the
 * picker labelled it "Joins by link as a guest" and Find a time left it out.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DraftInvitee } from "@/features/meet/lib/meeting-draft";
import { GuestPicker } from "./GuestPicker";

const mockLookup = jest.fn();

jest.mock("@/features/messaging/hooks/useUserConnections", () => ({
  useUserConnections: () => ({ connections: [] }),
}));

jest.mock("@/features/organizations/userSearch", () => ({
  searchUserByEmail: (email: string) => mockLookup(email),
}));

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("GuestPicker — a typed email resolves to its account", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockLookup.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function typeAndEnter(email: string, onChange: (g: DraftInvitee[]) => void) {
    await act(async () => {
      root.render(
        <GuestPicker
          guests={[]}
          onChange={onChange}
          organizationId="org-1"
          hostUserId="host-1"
        />,
      );
    });
    const input = container.querySelector("input")!;
    await act(async () => setInputValue(input, email));
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
  }

  it("adds an existing account as that account, not a link guest", async () => {
    mockLookup.mockResolvedValue({ id: "user-test", email: "test@test.com", exists: true });
    const onChange = jest.fn();
    await typeAndEnter("test@test.com", onChange);
    expect(mockLookup).toHaveBeenCalledWith("test@test.com");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      userId: "user-test",
      email: "test@test.com",
    });
  });

  it("keeps an address with no account as an address", async () => {
    mockLookup.mockResolvedValue({ id: "", email: "priya@client.example", exists: false });
    const onChange = jest.fn();
    await typeAndEnter("priya@client.example", onChange);
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      userId: null,
      email: "priya@client.example",
    });
  });
});
