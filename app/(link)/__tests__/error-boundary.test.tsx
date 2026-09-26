/**
 * app/(link)/__tests__/error-boundary.test.tsx
 *
 * THE DEFECT THIS IS THE GUARD FOR. The `(link)` group holds the platform's
 * PUBLIC, unauthenticated link surfaces — a clinic's patient intake form at
 * `/f/<id>`, a contractor's signature request at `/sign/<token>`. Until
 * `app/(link)/error.tsx` existed, the group had NO error boundary, so a
 * server-component throw (measured: `canceling statement due to statement
 * timeout` under lock contention on `custom.record`) fell through to
 * `app/global-error.tsx` and showed an outside member of the public the app's
 * internal screen: "This feature is still under development", a vote on
 * whether to fire an employee, and a door into a product they do not use.
 *
 * WHY THIS TEST WALKS THE FILESYSTEM. Asserting that a component renders nice
 * words proves nothing about whether Next ever REACHES it. So the test does
 * what the App Router does: from each public link route's own directory it
 * walks up to `app/`, takes the first `error.tsx` it finds, and falls back to
 * `app/global-error.tsx` exactly as the framework does. THAT resolved module —
 * whatever it turns out to be — is the one rendered and asserted against.
 *
 * Which makes it a forcing function: remove or rename `app/(link)/error.tsx`
 * and the walk resolves to `global-error.tsx`, the render produces "This
 * feature is still under development", and every assertion below goes red. It
 * cannot pass on the mere fact that a component exists somewhere.
 *
 * The synthetic `(link)/doc/[documentId]` route is in the table on purpose: it
 * does not exist yet, and it proves the boundary is at the GROUP root, so a
 * link route added here later inherits it without anybody remembering to.
 */

import fs from "node:fs";
import path from "node:path";

import { act, type ComponentType } from "react";
import { createRoot } from "react-dom/client";

import { captureReactRenderError } from "@/lib/diagnostics/captureReactError";

jest.mock("@/lib/diagnostics/captureReactError", () => ({
  captureReactRenderError: jest.fn(),
}));

const mockedCapture = jest.mocked(captureReactRenderError);

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const APP_DIR = path.resolve(__dirname, "..", "..");

/** Every current public link route, plus one that does not exist yet. */
const PUBLIC_LINK_ROUTES = [
  { url: "/f/<form id>", dir: "(link)/f/[formId]" },
  { url: "/sign/<token>", dir: "(link)/sign/[token]" },
  { url: "/doc/<id> (a link route added later)", dir: "(link)/doc/[documentId]" },
] as const;

/**
 * Resolve the error boundary the App Router would use for a route directory:
 * the nearest `error.tsx` walking up to `app/`, else `app/global-error.tsx`.
 */
function resolveBoundaryFor(routeDir: string): string {
  let dir = path.join(APP_DIR, routeDir);
  for (;;) {
    const candidate = path.join(dir, "error.tsx");
    if (fs.existsSync(candidate)) return candidate;
    if (dir === APP_DIR) break;
    dir = path.dirname(dir);
  }
  return path.join(APP_DIR, "global-error.tsx");
}

interface Rendered {
  text: string;
  hrefs: string[];
  buttons: HTMLButtonElement[];
  unmount: () => void;
}

function renderBoundary(
  Boundary: ComponentType<{
    error: Error & { digest?: string };
    reset: () => void;
  }>,
  error: Error & { digest?: string },
  reset: () => void,
): Rendered {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Boundary error={error} reset={reset} />);
  });
  return {
    text: container.textContent ?? "",
    hrefs: Array.from(container.querySelectorAll("a")).map(
      (a) => a.getAttribute("href") ?? "",
    ),
    buttons: Array.from(container.querySelectorAll("button")),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function loadBoundary(file: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(file) as {
    default: ComponentType<{
      error: Error & { digest?: string };
      reset: () => void;
    }>;
  };
  return mod.default;
}

/** The measured production failure, verbatim, with a row id in its message. */
function statementTimeout(): Error & { digest?: string } {
  const error = Object.assign(
    new Error(
      'canceling statement due to statement timeout (relation "custom.record", id 2f0a1c7e-9b21-4a55-8e6d-1d1f0b7c4a33)',
    ),
    { digest: "3016420871" },
  );
  return error;
}

describe("the public link group has its own honest error boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(PUBLIC_LINK_ROUTES)(
    "resolves $url to a boundary inside the (link) group, never the app's internal screen",
    ({ dir }) => {
      const resolved = resolveBoundaryFor(dir);
      expect(path.relative(APP_DIR, resolved)).toBe("(link)/error.tsx");
    },
  );

  it.each(PUBLIC_LINK_ROUTES)(
    "never shows a stranger who opened $url our internal voice",
    ({ dir }) => {
      const Boundary = loadBoundary(resolveBoundaryFor(dir));
      const rendered = renderBoundary(Boundary, statementTimeout(), jest.fn());
      try {
        expect(rendered.text).not.toMatch(/under development/i);
        expect(rendered.text).not.toMatch(/Arman/i);
        expect(rendered.text).not.toMatch(/fire|vote/i);
        // No door into a product this person does not use.
        expect(rendered.text).not.toMatch(/dashboard|go home|sign in/i);
        expect(rendered.hrefs).toHaveLength(0);
      } finally {
        rendered.unmount();
      }
    },
  );

  it("says in plain English what happened and the one thing to do next", () => {
    const Boundary = loadBoundary(resolveBoundaryFor("(link)/sign/[token]"));
    const rendered = renderBoundary(Boundary, statementTimeout(), jest.fn());
    try {
      expect(rendered.text).toContain(
        "This is taking longer than it should",
      );
      expect(rendered.text).toContain("usually temporary");
      expect(rendered.text).toContain("Try again in a moment");
      expect(rendered.text).toContain(
        "ask whoever sent you this link to send it again",
      );
    } finally {
      rendered.unmount();
    }
  });

  it("tells an unknown failure apart from a slow one, and still gives the same next step", () => {
    const Boundary = loadBoundary(resolveBoundaryFor("(link)/f/[formId]"));
    const rendered = renderBoundary(
      Boundary,
      new Error("something nobody classified"),
      jest.fn(),
    );
    try {
      expect(rendered.text).toContain("We couldn’t open this link");
      expect(rendered.text).not.toContain(
        "This is taking longer than it should",
      );
      expect(rendered.text).toContain(
        "ask whoever sent you this link to send it again",
      );
    } finally {
      rendered.unmount();
    }
  });

  it("never echoes the server's message, its row id, or a digest onto a public page", () => {
    const Boundary = loadBoundary(resolveBoundaryFor("(link)/f/[formId]"));
    const error = statementTimeout();
    const rendered = renderBoundary(Boundary, error, jest.fn());
    try {
      expect(rendered.text).not.toContain("statement timeout");
      expect(rendered.text).not.toContain("custom.record");
      expect(rendered.text).not.toContain(
        "2f0a1c7e-9b21-4a55-8e6d-1d1f0b7c4a33",
      );
      expect(rendered.text).not.toContain("3016420871");
    } finally {
      rendered.unmount();
    }
  });

  it("offers a live retry control wired to reset(), never a dead or disabled one", () => {
    const Boundary = loadBoundary(resolveBoundaryFor("(link)/sign/[token]"));
    const reset = jest.fn();
    const rendered = renderBoundary(Boundary, statementTimeout(), reset);
    try {
      // Every error display carries the Alchemy menu (its trigger is a button
      // too — 4b355b083c); besides the menus, the only control is the retry.
      const menus = rendered.buttons.filter((b) => b.hasAttribute("data-alchemy-trigger"));
      expect(menus.length).toBeGreaterThan(0);
      const controls = rendered.buttons.filter((b) => !b.hasAttribute("data-alchemy-trigger"));
      expect(controls).toHaveLength(1);
      const button = controls[0];
      expect(button.disabled).toBe(false);
      expect(button.textContent).toContain("Try again");
      act(() => {
        button.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
      expect(reset).toHaveBeenCalledTimes(1);
    } finally {
      rendered.unmount();
    }
  });

  it("reports the failure through the app's own capture channel", () => {
    const Boundary = loadBoundary(resolveBoundaryFor("(link)/f/[formId]"));
    const error = statementTimeout();
    const rendered = renderBoundary(Boundary, error, jest.fn());
    try {
      expect(mockedCapture).toHaveBeenCalledTimes(1);
      expect(mockedCapture).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ boundary: "LinkError" }),
      );
    } finally {
      rendered.unmount();
    }
  });
});
