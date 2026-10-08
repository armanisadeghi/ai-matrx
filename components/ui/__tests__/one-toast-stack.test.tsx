/**
 * ── ONE TOAST STACK (2026-10-08) ─────────────────────────────────────────────
 *
 * Owner: "notifications and toasts are doing strange things, including moving
 * the UI around". Two toast stacks shared the bottom-right corner — sonner and a
 * Radix stack behind `components/ui/use-toast` — each sliding on its own
 * clearance variable, the Radix one holding ONE toast at a time. The Radix
 * stack is gone: the legacy object API renders through `@/lib/toast` (sonner).
 *
 * 🚨 RED-THEN-GREEN: restore the Radix reducer in `use-toast.ts` and the sonner
 * calls below never happen; re-mount `<Toaster />` from `components/ui/toaster`
 * in `app/layout.tsx` and the last case fails.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const calls: { kind: string; args: unknown[] }[] = [];

jest.mock("sonner", () => {
  const record =
    (kind: string) =>
    (...args: unknown[]) => {
      calls.push({ kind, args });
      return "sonner-id";
    };
  return {
    __esModule: true,
    Toaster: () => null,
    toast: Object.assign(record("plain"), {
      dismiss: record("dismiss"),
      error: record("error"),
      warning: record("warning"),
      success: record("success"),
      info: record("info"),
      message: record("message"),
      loading: record("loading"),
      custom: record("custom"),
      promise: record("promise"),
    }),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { toast, useToast } = require("../use-toast") as typeof import("../use-toast");

beforeEach(() => {
  calls.length = 0;
});

describe("the legacy toast object API renders on the ONE sonner stack", () => {
  it("a destructive toast is an error toast with its title and description", () => {
    toast({ title: "Save failed", description: "The network dropped.", variant: "destructive" });
    const error = calls.find((c) => c.kind === "error");
    expect(error?.args[0]).toBe("Save failed");
    expect(error?.args[1]).toMatchObject({ description: "The network dropped." });
  });

  it("success and plain variants map to sonner's success and plain toasts", () => {
    toast({ title: "Saved", variant: "success" });
    toast({ title: "Heads up" });
    expect(calls.some((c) => c.kind === "success" && c.args[0] === "Saved")).toBe(true);
    expect(calls.some((c) => c.kind === "plain" && c.args[0] === "Heads up")).toBe(true);
  });

  it("a description-only toast reads its description as the message", () => {
    toast({ description: "Copied to clipboard" });
    expect(calls.some((c) => c.kind === "plain" && c.args[0] === "Copied to clipboard")).toBe(true);
  });

  it("an action button reaches sonner", () => {
    const onClick = jest.fn();
    const handle = useToast().toast({ title: "Deleted", action: { label: "Undo", onClick } });
    const plain = calls.find((c) => c.kind === "plain");
    expect(plain?.args[1]).toMatchObject({ action: { label: "Undo", onClick } });
    expect(() => handle.dismiss()).not.toThrow();
  });

  it("the root layout mounts no second toaster", () => {
    const layout = readFileSync(join(__dirname, "../../../app/layout.tsx"), "utf8");
    expect(layout).not.toMatch(/components\/ui\/toaster/);
  });
});
