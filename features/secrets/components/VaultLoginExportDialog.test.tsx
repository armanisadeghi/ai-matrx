import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { VaultLoginExportDialog } from "./VaultLoginExportDialog";
import {
  downloadVaultLoginCsv,
  getVaultExportActor,
  previewVaultLoginCsv,
  VaultLoginExportTransportError,
} from "../vault-service";

const actor = {
  userId: "user-1",
  organizationId: "11111111-1111-4111-8111-111111111111",
  email: "admin@admin.com",
};
let authListener:
  | ((event: string, session?: { user: { id: string } } | null) => void)
  | undefined;

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => actor.organizationId,
}));
jest.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => false,
}));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (listener: typeof authListener) => {
        authListener = listener;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
      signInWithPassword: jest.fn(),
      getClaims: jest.fn(),
    },
  }),
}));
jest.mock("../vault-service", () => ({
  getVaultExportActor: jest.fn(),
  previewVaultLoginCsv: jest.fn(),
  downloadVaultLoginCsv: jest.fn(),
  VaultLoginExportTransportError: class VaultLoginExportTransportError extends Error {
    constructor(public code: string) {
      super(code);
    }
  },
}));

const getActorMock = jest.mocked(getVaultExportActor);
const previewMock = jest.mocked(previewVaultLoginCsv);
const downloadMock = jest.mocked(downloadVaultLoginCsv);

const items = [
  {
    id: "item-1",
    display_name: "Example login",
  },
  {
    id: "item-2",
    display_name: "Skipped login",
  },
] as never;

function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((node) =>
    node.textContent?.includes(text),
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error(`${text} missing`);
  return found;
}

describe("VaultLoginExportDialog", () => {
  let host: HTMLDivElement;
  let root: Root;
  const createObjectUrl = jest.fn(() => "blob:login-export");
  const revokeObjectUrl = jest.fn();

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    getActorMock.mockReset();
    previewMock.mockReset();
    downloadMock.mockReset();
    getActorMock.mockResolvedValue(actor);
    previewMock.mockResolvedValue({
      profile: "matrx_login_csv_v1",
      revision: "a".repeat(64),
      items: [
        { item_id: "item-1", title: "Example login", eligible: true },
        {
          item_id: "item-2",
          title: "Skipped login",
          eligible: false,
          reason: "not_website_login",
          omissions: { attachments: 1 },
        },
      ],
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function render() {
    await act(async () => {
      root.render(
        <VaultLoginExportDialog open onOpenChange={jest.fn()} items={items} />,
      );
    });
  }

  test("reviews exactly selected loaded items before allowing a plaintext download", async () => {
    await render();
    const checkbox = document.querySelector('[role="checkbox"]');
    if (!(checkbox instanceof HTMLElement)) throw new Error("selection missing");
    await act(async () => checkbox.click());
    await act(async () => button("Review selected logins").click());

    expect(previewMock).toHaveBeenCalledWith(
      { profile: "matrx_login_csv_v1", item_ids: ["item-1"] },
      actor,
      expect.any(AbortSignal),
    );
    expect(document.body.textContent).toContain("1 eligible of 2 selected");
    expect(document.body.textContent).toContain("attachments");
    expect(button("Download CSV").disabled).toBe(true);
  });

  test("rechecks actor and revokes the object URL after download", async () => {
    downloadMock.mockResolvedValue(new Blob(["csv"], { type: "text/csv" }));
    await render();
    const checkbox = document.querySelector('[role="checkbox"]');
    if (!(checkbox instanceof HTMLElement)) throw new Error("selection missing");
    await act(async () => checkbox.click());
    await act(async () => button("Review selected logins").click());
    const acknowledgements = document.querySelectorAll('[role="checkbox"]');
    await act(async () => acknowledgements[acknowledgements.length - 1]?.click());
    await act(async () => button("Download CSV").click());

    expect(downloadMock).toHaveBeenCalledWith(
      expect.objectContaining({ item_ids: ["item-1"] }),
      actor,
      expect.any(AbortSignal),
    );
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:login-export");
  });

  test("clears selection and requires current-account confirmation on the export 401", async () => {
    previewMock.mockRejectedValue(
      new VaultLoginExportTransportError("recent_auth_required"),
    );
    await render();
    const checkbox = document.querySelector('[role="checkbox"]');
    if (!(checkbox instanceof HTMLElement)) throw new Error("selection missing");
    await act(async () => checkbox.click());
    await act(async () => button("Review selected logins").click());

    const email = document.querySelector("#vault-export-email");
    expect(email).toBeInstanceOf(HTMLInputElement);
    expect((email as HTMLInputElement).value).toBe("admin@admin.com");
    expect((email as HTMLInputElement).readOnly).toBe(true);
  });

  test("cancels the pending export when the authenticated account changes", async () => {
    await render();
    const checkbox = document.querySelector('[role="checkbox"]');
    if (!(checkbox instanceof HTMLElement)) throw new Error("selection missing");
    await act(async () => checkbox.click());
    await act(async () => button("Review selected logins").click());
    await act(async () => authListener?.("SIGNED_OUT", null));
    expect(document.body.textContent).toContain("Your account changed");
    expect(document.body.textContent).toContain("0 selected of 2 loaded");
  });
});
