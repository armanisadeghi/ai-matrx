import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { VaultLoginExportDialog } from "./VaultLoginExportDialog";
import {
  downloadVaultLoginCsv,
  getVaultExportActor,
  previewVaultLoginCsv,
  VaultLoginExportTransportError,
} from "../vault-service";
import { OrganizationContextError } from "@/lib/api/organization-context";
import type { OrganizationState } from "@/features/organizations/useOrganizationRequired";

const actor = {
  userId: "user-1",
  organizationId: "11111111-1111-4111-8111-111111111111",
  email: "admin@admin.com",
};
let authListener:
  | ((event: string, session?: { user: { id: string } } | null) => void)
  | undefined;
let selectedOrganization = actor.organizationId;
let organizationState: OrganizationState = "ready";
const signInWithPasswordMock = jest.fn();
const getClaimsMock = jest.fn();

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = jest.fn();
}

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => selectedOrganization,
}));
jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => ({ organizationState }),
}));
jest.mock(
  "@/features/organizations/components/OrganizationRequiredNotice",
  () => ({
    OrganizationContextNotice: ({
      state,
      what,
    }: {
      state: string;
      what?: string;
    }) => <div data-testid="organization-context-notice">{state}:{what}</div>,
  }),
);
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
      signInWithPassword: signInWithPasswordMock,
      getClaims: getClaimsMock,
    },
  }),
}));
jest.mock("../vault-service", () => ({
  ...jest.requireActual("../vault-service"),
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
    definition_key: "website_login",
  },
  {
    id: "item-2",
    display_name: "OAuth connection",
    definition_key: "oauth_token_set",
  },
] as never;

function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((node) =>
    node.textContent?.includes(text),
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error(`${text} missing`);
  return found;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

async function selectProfile(label: string): Promise<void> {
  const trigger = document.querySelector("#vault-export-profile");
  if (!(trigger instanceof HTMLElement)) throw new Error("profile trigger missing");
  await act(async () => trigger.click());
  const option = [...document.querySelectorAll('[role="option"]')].find((node) =>
    node.textContent?.includes(label),
  );
  if (!(option instanceof HTMLElement)) throw new Error(`${label} option missing`);
  await act(async () => option.click());
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
    selectedOrganization = actor.organizationId;
    organizationState = "ready";
    previewMock.mockReset();
    downloadMock.mockReset();
    signInWithPasswordMock.mockReset();
    getClaimsMock.mockReset();
    createObjectUrl.mockClear();
    revokeObjectUrl.mockClear();
    getActorMock.mockResolvedValue(actor);
    previewMock.mockResolvedValue({
      profile: "matrx_login_csv_v1",
      revision: "a".repeat(64),
      items: [
        { item_id: "item-1", title: "Example login", eligible: true },
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

  async function requestConfirmation() {
    previewMock.mockRejectedValue(new VaultLoginExportTransportError("recent_auth_required"));
    await render();
    const selection = document.querySelector('[role="checkbox"]');
    if (!(selection instanceof HTMLElement)) throw new Error("selection missing");
    await act(async () => selection.click());
    await act(async () => button("Review selected logins").click());
    const password = document.querySelector("#vault-export-password");
    if (!(password instanceof HTMLInputElement)) throw new Error("password missing");
    password.value = "test-only-password";
  }

  test("refuses to sign back into a stale account before confirmation", async () => {
    await requestConfirmation();
    getActorMock.mockResolvedValue({ ...actor, userId: "other-user" });
    await act(async () => button("Confirm identity").click());
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Your account or organization changed");
  });

  test("fresh same-account password confirmation returns to an empty selection", async () => {
    await requestConfirmation();
    signInWithPasswordMock.mockResolvedValue({ data: { user: { id: actor.userId }, session: { access_token: "test-token" } }, error: null });
    getClaimsMock.mockResolvedValue({ data: { claims: { amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null });
    await act(async () => button("Confirm identity").click());
    expect(getClaimsMock).toHaveBeenCalledWith("test-token");
    expect(document.querySelector("#vault-export-password")).toBeNull();
    expect(document.body.textContent).toContain("0 selected of 1 shown");
    expect(downloadMock).not.toHaveBeenCalled();
  });

  test("refuses a different user returned by password confirmation", async () => {
    await requestConfirmation();
    signInWithPasswordMock.mockResolvedValue({ data: { user: { id: "other-user" }, session: { access_token: "test-token" } }, error: null });
    getClaimsMock.mockResolvedValue({ data: { claims: { amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null });
    await act(async () => button("Confirm identity").click());
    expect(document.body.textContent).toContain("We could not verify your identity");
    expect(document.querySelector("#vault-export-password")).toBeNull();
    expect(document.body.textContent).toContain("0 selected of 1 shown");
    expect(downloadMock).not.toHaveBeenCalled();
  });

  test("invalidates the export after the post-confirmation context changes", async () => {
    await requestConfirmation();
    getActorMock.mockReset();
    getActorMock
      .mockResolvedValueOnce(actor)
      .mockResolvedValueOnce({
        ...actor,
        organizationId: "22222222-2222-4222-8222-222222222222",
      });
    signInWithPasswordMock.mockResolvedValue({
      data: { user: { id: actor.userId }, session: { access_token: "test-token" } },
      error: null,
    });
    getClaimsMock.mockResolvedValue({
      data: { claims: { amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] } },
      error: null,
    });
    await act(async () => button("Confirm identity").click());
    expect(document.querySelector("#vault-export-password")).toBeNull();
    expect(document.body.textContent).toContain(
      "Your account or organization changed",
    );
    expect(document.body.textContent).toContain("0 selected of 1 shown");
  });

  test("invalidates the export when the password AMR is missing", async () => {
    await requestConfirmation();
    signInWithPasswordMock.mockResolvedValue({
      data: { user: { id: actor.userId }, session: { access_token: "test-token" } },
      error: null,
    });
    getClaimsMock.mockResolvedValue({ data: { claims: { amr: [] } }, error: null });
    await act(async () => button("Confirm identity").click());
    expect(document.querySelector("#vault-export-password")).toBeNull();
    expect(document.body.textContent).toContain("We could not verify your identity");
    expect(document.body.textContent).toContain("0 selected of 1 shown");
  });

  test("late sign-in after account invalidation does not restore export", async () => {
    await requestConfirmation();
    const pending = deferred<unknown>();
    signInWithPasswordMock.mockReturnValue(pending.promise);
    await act(async () => button("Confirm identity").click());
    await act(async () => authListener?.("SIGNED_OUT", null));
    getClaimsMock.mockResolvedValue({ data: { claims: {} }, error: null });
    await act(async () => pending.resolve({ data: { user: { id: actor.userId }, session: { access_token: "test-token" } }, error: null }));
    expect(document.body.textContent).toContain("Your account changed");
    expect(document.querySelector("#vault-export-password")).toBeNull();
    expect(downloadMock).not.toHaveBeenCalled();
  });

  test.each(["cancel", "unmount", "organization"])("discards a pending download after %s", async (action) => {
    const pending = deferred<Blob>();
    downloadMock.mockReturnValue(pending.promise);
    await render();
    const selection = document.querySelector('[role="checkbox"]');
    if (!(selection instanceof HTMLElement)) throw new Error("selection missing");
    await act(async () => selection.click());
    await act(async () => button("Review selected logins").click());
    const boxes = document.querySelectorAll('[role="checkbox"]');
    const acknowledgement = boxes[boxes.length - 1];
    if (!(acknowledgement instanceof HTMLElement)) throw new Error("acknowledgement missing");
    await act(async () => acknowledgement.click());
    await act(async () => button("Download CSV").click());
    const signal = downloadMock.mock.calls[0]?.[2];
    if (action === "cancel") await act(async () => button("Cancel").click());
    else if (action === "unmount") await act(async () => root.render(null));
    else {
      selectedOrganization = "22222222-2222-4222-8222-222222222222";
      await render();
    }
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(new Blob(["test-only-csv"])));
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

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
    expect(document.body.textContent).toContain("1 eligible of 1 selected");
    expect(button("Download CSV").disabled).toBe(true);
  });

  test.each(["resolving", "required", "unavailable"] as const)(
    "does not offer login export controls while organization context is %s",
    async (state) => {
      organizationState = state;
      await render();

      expect(document.querySelector("#vault-export-profile")).toBeNull();
      expect(document.querySelectorAll('[role="checkbox"]')).toHaveLength(0);
      expect(previewMock).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain(`${state}:Vault login exports`);
    },
  );

  test("returns to the organization gate when context disappears while reviewing", async () => {
    previewMock.mockImplementation(async () => {
      organizationState = "required";
      throw new OrganizationContextError("organization_context_required");
    });
    await render();
    const checkbox = document.querySelector('[role="checkbox"]');
    if (!(checkbox instanceof HTMLElement)) throw new Error("selection missing");
    await act(async () => checkbox.click());
    await act(async () => button("Review selected logins").click());
    await render();

    expect(document.querySelector("#vault-export-profile")).toBeNull();
    expect(document.querySelectorAll('[role="checkbox"]')).toHaveLength(0);
    expect(document.body.textContent).toContain("required:Vault login exports");
    expect(document.body.textContent).not.toContain("Export preview");
  });

  test("binds the NordPass destination to preview and clears a prior preview when changed", async () => {
    await render();
    const checkbox = document.querySelector('[role="checkbox"]');
    if (!(checkbox instanceof HTMLElement)) throw new Error("selection missing");
    await act(async () => checkbox.click());
    await act(async () => button("Review selected logins").click());
    expect(document.body.textContent).toContain("Export preview");
    await selectProfile("NordPass CSV");
    expect(document.body.textContent).not.toContain("Export preview");
    expect(document.body.textContent).toContain(
      "Targets NordPass's documented import template and carries ordinary login fields only.",
    );
    await act(async () => button("Review selected logins").click());
    expect(previewMock).toHaveBeenLastCalledWith(
      { profile: "nordpass_csv_v1", item_ids: ["item-1"] },
      actor,
      expect.any(AbortSignal),
    );
  });

  test.each([
    [
      "Google Password Manager CSV",
      "Google's CSV format has no title or notes columns. The preview lists those omissions before download.",
      "google_password_manager_csv_v1",
    ],
    [
      "Keeper CSV",
      "Uses Keeper's ordinary-login CSV columns for title, URL, username, password, and notes; folder, shared-folder, and custom-field columns are blank.",
      "keeper_csv_v1",
    ],
    [
      "LastPass CSV",
      "Uses LastPass's ordinary-login CSV columns for title, URL, username, password, and notes; grouping, favorite, and TOTP use the ordinary-login defaults.",
      "lastpass_csv_v1",
    ],
  ])("binds %s to a fresh preview", async (label, detail, profile) => {
    await render();
    const checkbox = document.querySelector('[role="checkbox"]');
    if (!(checkbox instanceof HTMLElement)) throw new Error("selection missing");
    await act(async () => checkbox.click());
    await act(async () => button("Review selected logins").click());
    expect(document.body.textContent).toContain("Export preview");

    await selectProfile(label);

    expect(document.body.textContent).not.toContain("Export preview");
    expect(document.body.textContent).toContain(detail);
    await act(async () => button("Review selected logins").click());
    expect(previewMock).toHaveBeenLastCalledWith(
      { profile, item_ids: ["item-1"] },
      actor,
      expect.any(AbortSignal),
    );
  });

  test("shows Google title and notes omissions in the export preview", async () => {
    previewMock.mockResolvedValue({
      profile: "matrx_login_csv_v1",
      revision: "b".repeat(64),
      items: [
        {
          item_id: "item-1",
          title: "Example login",
          eligible: true,
          omissions: { title_omitted: 1, item_notes_omitted: 1 },
        },
      ],
    });
    await render();
    const checkbox = document.querySelector('[role="checkbox"]');
    if (!(checkbox instanceof HTMLElement)) throw new Error("selection missing");
    await act(async () => checkbox.click());
    await selectProfile("Google Password Manager CSV");
    await act(async () => button("Review selected logins").click());

    expect(document.body.textContent).toContain(
      "Omitted: 1 title omitted, 1 item notes omitted",
    );
  });

  test("rechecks actor and revokes the object URL after download", async () => {
    downloadMock.mockResolvedValue(new Blob(["csv"], { type: "text/csv" }));
    await render();
    const checkbox = document.querySelector('[role="checkbox"]');
    if (!(checkbox instanceof HTMLElement)) throw new Error("selection missing");
    await act(async () => checkbox.click());
    await act(async () => button("Review selected logins").click());
    const acknowledgements = document.querySelectorAll('[role="checkbox"]');
    await act(async () => {
      const acknowledgement = acknowledgements[acknowledgements.length - 1];
      if (acknowledgement instanceof HTMLElement) acknowledgement.click();
    });
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
    const pending = deferred<Awaited<ReturnType<typeof previewVaultLoginCsv>>>();
    previewMock.mockReturnValue(pending.promise);
    await render();
    const checkbox = document.querySelector('[role="checkbox"]');
    if (!(checkbox instanceof HTMLElement)) throw new Error("selection missing");
    await act(async () => checkbox.click());
    await act(async () => button("Review selected logins").click());
    const signal = previewMock.mock.calls[0]?.[2];
    await act(async () => authListener?.("SIGNED_OUT", null));
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ profile: "matrx_login_csv_v1", revision: "a".repeat(64), items: [] }));
    expect(document.body.textContent).toContain("Your account changed");
    expect(document.body.textContent).toContain("0 selected of 1 shown");
  });

  test("offers only currently loaded website logins for selection", async () => {
    await render();
    expect(document.body.textContent).toContain("Showing 1 website logins from 2 credentials");
    expect(document.body.textContent).not.toContain("OAuth connection");
    expect(document.querySelectorAll('[role="checkbox"]')).toHaveLength(1);
  });

  test("shows a wrong-password error during identity confirmation", async () => {
    previewMock.mockRejectedValue(
      new VaultLoginExportTransportError("recent_auth_required"),
    );
    signInWithPasswordMock.mockResolvedValue({ data: {}, error: new Error("wrong password") });
    await render();
    const checkbox = document.querySelector('[role="checkbox"]');
    if (!(checkbox instanceof HTMLElement)) throw new Error("selection missing");
    await act(async () => checkbox.click());
    await act(async () => button("Review selected logins").click());
    const password = document.querySelector("#vault-export-password");
    if (!(password instanceof HTMLInputElement)) throw new Error("password missing");
    await act(async () => {
      password.value = "wrong-password";
      password.dispatchEvent(new Event("input", { bubbles: true }));
      button("Confirm identity").click();
    });
    expect(document.body.textContent).toContain("That password could not confirm your identity");
  });
});
