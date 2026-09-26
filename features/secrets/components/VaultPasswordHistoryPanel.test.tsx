import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const fetchVaultPasswordHistory = jest.fn();
const revealVaultPasswordHistory = jest.fn();
const restoreVaultPasswordHistory = jest.fn();
const toastError = jest.fn();
const toastSuccess = jest.fn();
let authStateListener:
  ((event: string, session?: { user: { id: string } } | null) => void) | null =
  null;

jest.mock("../vault-service", () => ({
  fetchVaultPasswordHistory: (...args: unknown[]) =>
    fetchVaultPasswordHistory(...args),
  revealVaultPasswordHistory: (...args: unknown[]) =>
    revealVaultPasswordHistory(...args),
  restoreVaultPasswordHistory: (...args: unknown[]) =>
    restoreVaultPasswordHistory(...args),
  VaultRecentAuthRequiredError: class VaultRecentAuthRequiredError extends Error {},
  VaultPasswordHistoryConflictError: class VaultPasswordHistoryConflictError extends Error {},
}));
jest.mock("@/lib/toast", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (listener: typeof authStateListener) => {
        authStateListener = listener;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  }),
}));
jest.mock("./SecretValue", () => ({
  VaultRevealReauthDialog: () => null,
}));
jest.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
  }: {
    open: boolean;
    onConfirm: () => Promise<void>;
  }) =>
    open ? (
      <button onClick={() => void onConfirm()}>Confirm restore</button>
    ) : null,
}));

import { VaultPasswordHistoryPanel } from "./VaultPasswordHistoryPanel";
import type { VaultField } from "../types";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const field: VaultField = {
  id: "field-password",
  credential_item_id: "item-a",
  field_key: "password",
  env_key: null,
  handling: "revealable",
  editable: true,
  inject_into_sandbox: false,
  value_hint: "",
  value_version: 1,
  is_active: true,
  description: null,
  created_at: "2026-09-25T00:00:00Z",
  updated_at: "2026-09-25T00:00:00Z",
};

describe("VaultPasswordHistoryPanel", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    fetchVaultPasswordHistory.mockReset();
    revealVaultPasswordHistory.mockReset();
    restoreVaultPasswordHistory.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    authStateListener = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  test("shows the capture-off state without requesting or rendering a value", async () => {
    fetchVaultPasswordHistory.mockResolvedValue({
      entries: [],
      count: 0,
      capture_cutoff_at: null,
      value_availability: "unavailable",
      next_before_revision: null,
      omitted_count: 0,
      incomplete: false,
    });
    await act(async () => {
      root.render(
        <VaultPasswordHistoryPanel
          itemId="item-a"
          field={field}
          currentUserId="user-a"
        />,
      );
    });
    expect(fetchVaultPasswordHistory).toHaveBeenCalledWith("item-a");
    expect(host.textContent).toContain("No captured password states yet");
    expect(revealVaultPasswordHistory).not.toHaveBeenCalled();
  });

  test("does not discard the initial metadata request on Supabase INITIAL_SESSION", async () => {
    let resolve!: (value: {
      entries: [];
      count: number;
      capture_cutoff_at: null;
      value_availability: "unavailable";
      next_before_revision: null;
      omitted_count: number;
      incomplete: boolean;
    }) => void;
    fetchVaultPasswordHistory.mockReturnValue(
      new Promise((next) => {
        resolve = next;
      }),
    );
    await act(async () => {
      root.render(
        <VaultPasswordHistoryPanel
          itemId="item-a"
          field={field}
          currentUserId="user-a"
        />,
      );
    });
    act(() =>
      authStateListener?.("INITIAL_SESSION", { user: { id: "user-a" } }),
    );
    await act(async () => {
      resolve({
        entries: [],
        count: 0,
        capture_cutoff_at: null,
        value_availability: "unavailable",
        next_before_revision: null,
        omitted_count: 0,
        incomplete: false,
      });
    });
    expect(host.textContent).toContain("No captured password states yet");
    expect(host.textContent).not.toContain("Loading password history");
  });

  test("fences an initial auth event for a different account", async () => {
    let resolve!: (value: {
      entries: [];
      count: number;
      capture_cutoff_at: null;
      value_availability: "unavailable";
      next_before_revision: null;
      omitted_count: number;
      incomplete: boolean;
    }) => void;
    fetchVaultPasswordHistory.mockReturnValue(
      new Promise((next) => {
        resolve = next;
      }),
    );
    await act(async () => {
      root.render(
        <VaultPasswordHistoryPanel
          itemId="item-a"
          field={field}
          currentUserId="user-a"
        />,
      );
    });
    act(() =>
      authStateListener?.("INITIAL_SESSION", { user: { id: "user-b" } }),
    );
    await act(async () => {
      resolve({
        entries: [],
        count: 0,
        capture_cutoff_at: null,
        value_availability: "unavailable",
        next_before_revision: null,
        omitted_count: 0,
        incomplete: false,
      });
    });
    expect(host.textContent).toContain("Your account changed");
    expect(host.textContent).not.toContain("No captured password states yet");
  });

  test("keeps unavailable old values out of the UI and transport", async () => {
    fetchVaultPasswordHistory.mockResolvedValue({
      entries: [
        {
          revision: 2,
          recorded_at: "2026-09-25T00:00:00Z",
          field_id: "field-password",
          capture_started_at: "2026-09-25T00:00:00Z",
          value_availability: "unavailable",
        },
      ],
      count: 1,
      capture_cutoff_at: "2026-09-25T00:00:00Z",
      value_availability: "unavailable",
      next_before_revision: null,
      omitted_count: 0,
      incomplete: false,
    });
    await act(async () => {
      root.render(
        <VaultPasswordHistoryPanel
          itemId="item-a"
          field={field}
          currentUserId="user-a"
        />,
      );
    });
    expect(host.textContent).toContain("Old value unavailable");
    expect(host.textContent).not.toContain("Show old password");
    expect(revealVaultPasswordHistory).not.toHaveBeenCalled();
  });

  test("offers a next page instead of calling loaded history unavailable", async () => {
    fetchVaultPasswordHistory.mockResolvedValue({
      entries: [
        {
          revision: 2,
          recorded_at: "2026-09-25T00:00:00Z",
          field_id: "field-password",
          capture_started_at: "2026-09-25T00:00:00Z",
          value_availability: "unavailable",
        },
      ],
      count: 1,
      capture_cutoff_at: "2026-09-25T00:00:00Z",
      value_availability: "unavailable",
      next_before_revision: 2,
      omitted_count: 0,
      incomplete: false,
    });
    fetchVaultPasswordHistory
      .mockResolvedValueOnce({
        entries: [
          {
            revision: 2,
            recorded_at: "2026-09-25T00:00:00Z",
            field_id: "field-password",
            capture_started_at: "2026-09-25T00:00:00Z",
            value_availability: "unavailable",
          },
        ],
        count: 1,
        capture_cutoff_at: "2026-09-25T00:00:00Z",
        value_availability: "unavailable",
        next_before_revision: 2,
        omitted_count: 0,
        incomplete: true,
      })
      .mockResolvedValueOnce({
        entries: [],
        count: 0,
        capture_cutoff_at: "2026-09-25T00:00:00Z",
        value_availability: "unavailable",
        next_before_revision: null,
        omitted_count: 0,
        incomplete: false,
      });
    await act(async () => {
      root.render(
        <VaultPasswordHistoryPanel
          itemId="item-a"
          field={field}
          currentUserId="user-a"
        />,
      );
    });
    expect(host.textContent).toContain("Load earlier changes");
    await act(async () => {
      (host.querySelector("button") as HTMLButtonElement).click();
    });
    expect(fetchVaultPasswordHistory).toHaveBeenLastCalledWith("item-a", 2);
    expect(host.textContent).not.toContain(
      "Some recorded changes are unavailable",
    );
  });

  test("restores only an available revision older than the chain head after confirmation", async () => {
    fetchVaultPasswordHistory.mockResolvedValue({
      entries: [
        {
          revision: 2,
          recorded_at: "2026-09-25T01:00:00Z",
          field_id: "field-password",
          capture_started_at: "2026-09-25T00:00:00Z",
          value_availability: "available",
        },
        {
          revision: 1,
          recorded_at: "2026-09-25T00:00:00Z",
          field_id: "field-password",
          capture_started_at: "2026-09-25T00:00:00Z",
          value_availability: "available",
        },
      ],
      count: 2,
      capture_cutoff_at: "2026-09-25T00:00:00Z",
      value_availability: "available",
      next_before_revision: null,
      omitted_count: 0,
      incomplete: false,
    } as never);
    restoreVaultPasswordHistory.mockResolvedValue({
      item_id: "item-a",
      field_id: "field-password",
      restored_from_revision: 1,
      history_revision: 3,
    });
    const onItemChanged = jest.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <VaultPasswordHistoryPanel
          itemId="item-a"
          field={field}
          currentUserId="user-a"
          onItemChanged={onItemChanged}
        />,
      );
    });
    expect(host.textContent).toContain("Restore");
    expect(host.querySelectorAll("button")).toHaveLength(3);
    await act(async () => {
      (
        Array.from(host.querySelectorAll("button")).find(
          (button) => button.textContent === "Restore",
        ) as HTMLButtonElement
      ).click();
    });
    expect(host.textContent).toContain("Confirm restore");
    await act(async () => {
      (
        Array.from(host.querySelectorAll("button")).find(
          (button) => button.textContent === "Confirm restore",
        ) as HTMLButtonElement
      ).click();
    });
    expect(restoreVaultPasswordHistory).toHaveBeenCalledWith(
      "item-a",
      "field-password",
      1,
      2,
    );
    expect(onItemChanged).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith(
      "Password restored from its recorded history.",
    );
  });
});
