/**
 * A save that stalls says so and offers Retry (RC-B6 round 2: the list's Save
 * spun 60 s+ with no word while the dev server stalled). A quick save shows
 * nothing extra; a stalled one gets one honest notice, withdrawn when it lands.
 */
const info = jest.fn();
const dismiss = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: {
    info: (...a: unknown[]) => info(...a),
    dismiss: (...a: unknown[]) => dismiss(...a),
  },
}));

import { guardedSave } from "../guardedSave";

beforeEach(() => {
  jest.useFakeTimers();
  info.mockReset();
  dismiss.mockReset();
});
afterEach(() => jest.useRealTimers());

it("a quick save shows no stall notice", async () => {
  await expect(
    guardedSave(() => Promise.resolve("ok"), { what: "the list", onRetry: jest.fn() }),
  ).resolves.toBe("ok");
  jest.advanceTimersByTime(20_000);
  expect(info).not.toHaveBeenCalled();
});

it("a stalled save says so after 10 s, offers Retry, and withdraws the notice when it lands", async () => {
  let finish!: (v: string) => void;
  const onRetry = jest.fn();
  const p = guardedSave(() => new Promise<string>((r) => (finish = r)), {
    what: "the list",
    onRetry,
  });
  jest.advanceTimersByTime(10_000);
  expect(info).toHaveBeenCalledTimes(1);
  const [title, opts] = info.mock.calls[0] as [
    string,
    { description: string; action: { label: string; onClick: () => void } },
  ];
  expect(title).toBe("Still saving…");
  expect(opts.description).toContain("the list");
  expect(opts.description).toContain("still here");
  expect(opts.action.label).toBe("Retry");
  opts.action.onClick();
  expect(onRetry).toHaveBeenCalled();
  finish("ok");
  await p;
  expect(dismiss).toHaveBeenCalled();
});

it("a save that is not safe to repeat gets no Retry, only the honest wait", async () => {
  let finish!: (v: string) => void;
  const p = guardedSave(() => new Promise<string>((r) => (finish = r)), { what: "the new list" });
  jest.advanceTimersByTime(10_000);
  const [, opts] = info.mock.calls[0] as [string, { action?: unknown; description: string }];
  expect(opts.action).toBeUndefined();
  expect(opts.description).toContain("give it a moment");
  finish("ok");
  await p;
});

/**
 * THE CENSUS (RC-B6 round 2): every transition that saves goes through the one
 * stall step. A new `startTransition(async …)` must either use `guardedSave` or
 * be listed here as a READ, with the reason.
 */
const READS: Record<string, string> = {
  "app/(admin)/administration/database/sql-functions/components/SqlFunctionTester.tsx":
    "an admin tester running a read-only function call",
  "app/(dev)/demos/general/voice/debate-assistant/debate-page.tsx": "a dev demo, no save",
  "features/education/library/components/LibraryBrowser.tsx": "lists public decks (read)",
  "features/mandates/admin/advanced/AdvancedMandateCrud.tsx": "lists rows (read)",
};

it("every transition that saves uses the one stall step", () => {
  jest.useRealTimers();
  const { execSync } = jest.requireActual<typeof import("child_process")>("child_process");
  const files = execSync(
    'git grep -l "startTransition(async" -- "*.tsx" "*.ts" ":!work" ":!**/__tests__/**" ":!**/*.md" || true',
    { cwd: `${__dirname}/../../..`, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  const fs = jest.requireActual<typeof import("fs")>("fs");
  const offenders = files.filter(
    (f) =>
      !(f in READS) &&
      !fs.readFileSync(`${__dirname}/../../../${f}`, "utf8").includes("guardedSave"),
  );
  expect(offenders).toEqual([]);
});
