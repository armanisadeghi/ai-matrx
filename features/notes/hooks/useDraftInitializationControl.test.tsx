const toastError = jest.fn();
const toastErrorAlreadyCaptured = jest.fn();
const toastDismiss = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), dismiss: (...a: unknown[]) => toastDismiss(...a) },
  toastErrorAlreadyCaptured: (...a: unknown[]) => toastErrorAlreadyCaptured(...a),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { OrganizationContextError } from "@ai-matrx/agents/matrx";
import { useDraftInitializationControl } from "./useDraftInitializationControl";
import { NOTE_FOLDER_CROSS_ORG_MESSAGE } from "../utils/writeErrors";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Control = ReturnType<typeof useDraftInitializationControl>;

/** A surface that renders NOTHING for the error — the 2026-09-18 tab bar. */
function mountSilentSurface() {
  let control: Control | null = null;
  function SilentSurface() {
    control = useDraftInitializationControl();
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<SilentSurface />));
  return { get: () => control as Control, host, unmount: () => act(() => root.unmount()) };
}

async function runAndSwallow(control: Control, operation: () => Promise<void>) {
  // Exactly what every click handler does: `.catch(() => undefined)`.
  await act(async () => { await control.run(operation).catch(() => undefined); });
}

describe("useDraftInitializationControl — a failed + is never silent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("announces a rejected thunk even when the surface renders nothing and the handler swallows it", async () => {
    const surface = mountSilentSurface();
    // RTK hands `.unwrap()` callers a serialized PLAIN OBJECT, not an Error.
    const rejected = { name: "Error", message: "notes_folder_cross_org_legacy_key: reserved in another organization." };
    await runAndSwallow(surface.get(), async () => { throw rejected; });
    expect(surface.host.textContent).toBe("");
    expect(toastErrorAlreadyCaptured).toHaveBeenCalledTimes(1);
    expect(toastErrorAlreadyCaptured.mock.calls[0][0]).toBe(NOTE_FOLDER_CROSS_ORG_MESSAGE);
    expect(toastError).not.toHaveBeenCalled();
    expect(surface.get().error).toBe(NOTE_FOLDER_CROSS_ORG_MESSAGE);
    expect(surface.get().pending).toBe(false);
    surface.unmount();
  });

  it("captures a failure thrown outside a thunk through the capturing toast", async () => {
    const surface = mountSilentSurface();
    await runAndSwallow(surface.get(), async () => { throw new Error("Sign in before starting a new note."); });
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toBe("Sign in before starting a new note.");
    surface.unmount();
  });

  it("leaves 'no organization selected' to the picker the surface renders, without a second announcement", async () => {
    const surface = mountSilentSurface();
    await runAndSwallow(surface.get(), async () => {
      throw new OrganizationContextError("organization_context_required", "Choose the organization this note belongs to.");
    });
    expect(surface.get().organizationRequired).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
    expect(toastErrorAlreadyCaptured).not.toHaveBeenCalled();
    surface.unmount();
  });

  it("clears a standing failure toast once a later + succeeds", async () => {
    const surface = mountSilentSurface();
    await runAndSwallow(surface.get(), async () => { throw new Error("boom"); });
    await runAndSwallow(surface.get(), async () => undefined);
    expect(toastDismiss).toHaveBeenCalled();
    expect(surface.get().error).toBeNull();
    surface.unmount();
  });
});
