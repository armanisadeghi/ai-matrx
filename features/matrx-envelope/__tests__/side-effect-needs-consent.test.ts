/**
 * A SIDE EFFECT FOUND IN CONTENT NEVER RUNS ON AN UNEXPLAINED CLICK.
 *
 * The position law ("logged and skipped, never executed — it renders as a
 * button, and only a human click runs it") was honored so literally that the
 * human was never told what the click does: a `directive_v1_delete_*` block
 * pasted into a note rendered an Apply button that deleted server-side, as the
 * user, on ONE click — no dialog, no consequence sentence, no destructive
 * styling, the same neutral "Apply" as a create.
 *
 * `matrxDirectiveHost.confirm` is the single seam every in-content directive
 * executes through, so the gate lives there and every card inherits it. These
 * pin the part that matters: NOTHING REACHES THE SERVER WITHOUT AN EXPLICIT
 * YES, and the question names what changes.
 *
 * (`ProposedDirectivesZone` deliberately does not come through this seam — it
 * calls `confirmDirective` directly and carries the server's own consequence
 * sentence — so an agent proposal is never asked twice.)
 */

const confirmDirective = jest.fn();
const confirmDialog = jest.fn();

jest.mock("@/features/directive-catalog/service", () => ({
  confirmDirective: (...args: unknown[]) => confirmDirective(...args),
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: (...args: unknown[]) => confirmDialog(...args),
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    getState: () => ({}),
    dispatch: jest.fn(),
  }),
}));
jest.mock("@/lib/redux/slices/apiConfigSlice", () => ({
  selectResolvedBaseUrl: () => "https://server.example.test",
}));
jest.mock("@/components/agent-copy/CopyButtons", () => ({
  CopyButtons: () => null,
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: jest.fn(),
}));

import { matrxDirectiveHost } from "@/features/matrx-envelope/directiveHost";

const DELETE_NOTE = {
  __kind: "directive_v1_delete_note",
  items: [{ id: "4127fbc8-0000-4000-8000-000000000001" }],
};

async function apply(shell: { __kind: string; items: Record<string, unknown>[] }) {
  // The host's `confirm` is the package's execute seam (it POSTs /directives/confirm).
  return matrxDirectiveHost.confirm!(shell);
}

describe("a side effect in content needs consent", () => {
  beforeEach(() => {
    confirmDirective.mockReset().mockResolvedValue({ applied: 1, failed: 0 });
    confirmDialog.mockReset();
  });

  it("does NOT reach the server when the person declines", async () => {
    confirmDialog.mockResolvedValue(false);

    await expect(apply(DELETE_NOTE)).rejects.toThrow(/cancelled/i);

    // The whole point: no write was attempted.
    expect(confirmDirective).not.toHaveBeenCalled();
  });

  it("names the consequence — not a generic 'Are you sure?'", async () => {
    confirmDialog.mockResolvedValue(false);
    await apply(DELETE_NOTE).catch(() => undefined);

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    const opts = confirmDialog.mock.calls[0][0] as {
      title: string;
      description: string;
      confirmLabel?: string;
    };
    // It says the verb and the thing, and that the effect is real and elsewhere.
    expect(opts.title.toLowerCase()).toContain("delete");
    expect(opts.title.toLowerCase()).toContain("note");
    expect(opts.description).toMatch(/runs now/i);
    expect(opts.description).toMatch(/not just from this text/i);
    expect(opts.confirmLabel).toBe("Delete");
    // A bare "Are you sure?" is exactly what the law refuses.
    expect(opts.description.trim()).not.toMatch(/^are you sure\??$/i);
  });

  it("executes once the person says yes, passing the slug as the identity", async () => {
    confirmDialog.mockResolvedValue(true);

    await expect(apply(DELETE_NOTE)).resolves.toEqual({ applied: 1, failed: 0 });

    expect(confirmDirective).toHaveBeenCalledTimes(1);
    const [, body] = confirmDirective.mock.calls[0] as [
      string,
      { directive: string; items: unknown[] },
    ];
    expect(body.directive).toBe("directive_v1_delete_note");
    expect(body.items).toHaveLength(1);
  });

  it("asks for a create too — an unexpected new record is also a surprise", async () => {
    confirmDialog.mockResolvedValue(true);

    await apply({
      __kind: "directive_v1_create_task",
      items: [{ title: "Draft the brief" }, { title: "Send it" }],
    });

    const opts = confirmDialog.mock.calls[0][0] as {
      title: string;
      description: string;
    };
    // Plural subject when the batch carries more than one item.
    expect(opts.title.toLowerCase()).toContain("create");
    expect(opts.title).toContain("2");
    expect(confirmDirective).toHaveBeenCalledTimes(1);
  });
});
