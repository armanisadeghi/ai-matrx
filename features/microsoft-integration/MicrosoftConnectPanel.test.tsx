/** @jest-environment jsdom */

/**
 * Guards for the Microsoft door.
 *
 * The defect this screen exists to fix is not a bug in a reader — it is that
 * the platform held ZERO Microsoft connections because no screen ever called
 * the authorize endpoint. So the load-bearing assertions are: pressing Connect
 * really asks the server for a URL and really sends the person to Microsoft,
 * and the permission list never promises something the granted scopes cannot
 * do (Mail.ReadBasic returns envelopes, never message bodies).
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MicrosoftConnectPanel } from "@/features/microsoft-integration/MicrosoftConnectPanel";
import {
  MICROSOFT_CAMPAIGN_DESCRIPTORS,
  microsoftReturnMessage,
} from "@/features/microsoft-integration/campaigns";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockList = jest.fn();
const mockStart = jest.fn();
const mockDisconnect = jest.fn();
const mockPreflight = jest.fn();
let searchParams = new URLSearchParams();

jest.mock("@/features/microsoft-integration/service", () => ({
  listMicrosoftConnections: (...args: unknown[]) => mockList(...args),
  startMicrosoftAuthorization: (...args: unknown[]) => mockStart(...args),
  disconnectMicrosoftConnection: (...args: unknown[]) => mockDisconnect(...args),
  preflightMicrosoftConnection: (...args: unknown[]) => mockPreflight(...args),
}));
jest.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

let container: HTMLDivElement;
let root: Root;
const assign = jest.fn();

beforeEach(() => {
  searchParams = new URLSearchParams();
  mockList.mockResolvedValue([]);
  mockStart.mockResolvedValue({
    authorizationUrl: "https://login.microsoftonline.com/organizations/x",
    campaigns: ["identity"],
    requestedScopes: ["User.Read"],
  });
  assign.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function render() {
  await act(async () => {
    root.render(<MicrosoftConnectPanel navigate={assign} />);
  });
}

function buttonWithText(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((node) =>
    (node.textContent ?? "").includes(text),
  );
  if (!button) throw new Error(`No button containing "${text}"`);
  return button as HTMLButtonElement;
}

test("pressing Connect asks the server for a URL and goes to Microsoft", async () => {
  await render();

  await act(async () => {
    buttonWithText("Connect a Microsoft account").click();
  });

  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(mockStart.mock.calls[0][0]).toContain("identity");
  expect(assign).toHaveBeenCalledWith(
    "https://login.microsoftonline.com/organizations/x",
  );
});

test("the person is never sent to a URL this app built itself", async () => {
  mockStart.mockRejectedValueOnce(new Error("server said no"));
  await render();

  await act(async () => {
    buttonWithText("Connect a Microsoft account").click();
  });

  expect(assign).not.toHaveBeenCalled();
});

test("a returned status is explained in a sentence, never a bare code", async () => {
  searchParams = new URLSearchParams("provider=microsoft&microsoft_status=denied");
  await render();

  expect(container.textContent).toContain("You cancelled at Microsoft's sign-in");
});

test("an unknown return code still says something true", () => {
  const unknown = microsoftReturnMessage("weird_code");
  expect(unknown.tone).toBe("error");
  expect(unknown.message).toContain("Nothing was saved");
});

test("the mail permission never promises message bodies", () => {
  const mail = MICROSOFT_CAMPAIGN_DESCRIPTORS.find(
    (descriptor) => descriptor.campaign === "outlook_mail_basic",
  );
  if (!mail) throw new Error("the outlook_mail_basic permission is missing");
  expect(mail.scopes).toEqual(["Mail.ReadBasic"]);
  expect(mail.cannot).toContain("Read the text of an email");
  expect(mail.grants).not.toContain("body");
});

test("every optional permission says what it cannot do", () => {
  for (const descriptor of MICROSOFT_CAMPAIGN_DESCRIPTORS) {
    if (descriptor.alwaysOn) continue;
    expect(descriptor.cannot).toBeTruthy();
    expect(descriptor.scopes.length).toBeGreaterThan(0);
  }
});

test("a failed listing says so instead of showing an empty, reassuring list", async () => {
  mockList.mockRejectedValueOnce(new Error("We couldn't load your Microsoft connections."));
  await render();

  expect(container.textContent).toContain("could not be listed");
  expect(container.textContent).not.toContain("No Microsoft account is connected yet.");
});
