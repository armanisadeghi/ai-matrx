/**
 * THE HEADER TITLE IS IN THE FIRST SERVER HTML (2026-09-27).
 *
 * Every (core) page's title and back button used to appear ~1s after load:
 * `PageHeaderPortal` could only `createPortal` from an effect, so the server
 * HTML carried an empty `#shell-header-center` and the header popped in once
 * scripts ran — a flash and a layout shift on every page (/chat, message
 * templates, …).
 *
 * PINS:
 *   1. PageHeader's server HTML carries its content (a hidden anchor laid over
 *      the slot) plus the pre-hydration script that shows it in the header.
 *   2. RouteHeader's server HTML carries the title and the back button.
 *   3. The pre-hydration script clones the content into a body-level ghost laid
 *      exactly over the slot, before any bundle runs.
 *   4. Hydration is clean (no recoverable error), MOVES the very server node
 *      into the slot (no remount — the header's controls keep their state),
 *      and drops the ghost in the same commit.
 *   5. Unmount hands the node back so React removes it without throwing.
 *   6. A client-only mount (client navigation) still lands in the slot.
 *   7. STATIC: no route header is loaded through `dynamic(…, { ssr: false })`
 *      beyond the shrink-only baseline — such a header is client-only however
 *      the portal behaves. A fixed entry must leave the baseline.
 *
 * PROVEN FAILING BEFORE PASSING: against the pre-fix PageHeaderPortal, pins
 * 1, 2, 3 and 4 fail (the server HTML has no title; there is nothing to clone
 * or move).
 */
import React, { act, useEffect, useState } from "react";
import { renderToString } from "react-dom/server";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PageHeader = (require("../PageHeader") as typeof import("../PageHeader")).default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RouteHeader = (require("../RouteHeader") as typeof import("../RouteHeader")).default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PageHeaderRightPortal = (require("../PageHeaderRightPortal") as typeof import("../PageHeaderRightPortal")).default;

let mounts = 0;
function Probe({ label }: { label: string }) {
  const [clicks, setClicks] = useState(0);
  useEffect(() => {
    mounts += 1;
  }, []);
  return (
    <button type="button" data-probe onClick={() => setClicks((c) => c + 1)}>
      {label} {clicks}
    </button>
  );
}

function header(label = "Flashcard Studio") {
  return (
    <PageHeader>
      <Probe label={label} />
    </PageHeader>
  );
}

/** The shell: its header slot (React-owned, as <Header> renders it) + the page. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header>
        <div className="shell-header-center" id="shell-header-center" />
        <div className="shell-header-right-inject" id="shell-header-right" />
      </header>
      <main>{children}</main>
    </>
  );
}

let app: HTMLElement;
let root: Root | null = null;
const slot = () => document.getElementById("shell-header-center")!;
const realRect = HTMLElement.prototype.getBoundingClientRect;

beforeAll(() => {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.id !== "shell-header-center" && this.id !== "shell-header-right") return realRect.call(this);
    return { left: 120, top: 22, width: 640, height: 0, right: 760, bottom: 22, x: 120, y: 22, toJSON() {} } as DOMRect;
  };
});
afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = realRect;
});

beforeEach(() => {
  mounts = 0;
  document.body.innerHTML = "";
  app = document.createElement("div");
  document.body.appendChild(app);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
});

/** Parse server HTML the way a browser does: inline scripts run in order. */
function parseLikeABrowser(html: string) {
  app.innerHTML = html;
  app.querySelectorAll("script").forEach((dead) => {
    const live = document.createElement("script");
    live.textContent = dead.textContent;
    dead.replaceWith(live);
  });
}

describe("PageHeader is server-rendered", () => {
  it("puts the header content in the server HTML", () => {
    const html = renderToString(header());
    expect(html).toContain("data-page-header-ssr");
    expect(html).toMatch(/Flashcard Studio/);
    expect(html).toContain("<script>");
  });

  it("puts RouteHeader's title and back button in the server HTML", () => {
    const html = renderToString(
      <RouteHeader
        left={
          <>
            <button type="button" aria-label="Back" />
            <span>Cloud Codes</span>
          </>
        }
        right={<button type="button">Send email</button>}
      />,
    );
    const anchor = html.slice(html.indexOf("data-page-header-ssr"));
    expect(anchor).toContain("Cloud Codes");
    expect(anchor).toContain('aria-label="Back"');
  });

  it("shows a ghost over the slot before hydration, then moves the real node in with no remount", async () => {
    parseLikeABrowser(renderToString(<Shell>{header()}</Shell>));

    // 3. Before any bundle: a body-level ghost laid exactly over the slot.
    const ghostLayer = document.querySelector<HTMLElement>("matrx-header-ghost");
    expect(ghostLayer).not.toBeNull();
    expect(ghostLayer!.parentElement).toBe(document.body);
    expect(ghostLayer!.style.left).toBe("120px");
    expect(ghostLayer!.style.width).toBe("640px");
    expect(ghostLayer!.textContent).toContain("Flashcard Studio");
    const serverNode = app.querySelector<HTMLElement>("[data-probe]");
    expect(serverNode).not.toBeNull();

    // 4. Hydration: clean, the same node moves into the slot, ghost gone.
    const errors: unknown[] = [];
    await act(async () => {
      root = hydrateRoot(app, <Shell>{header()}</Shell>, {
        onRecoverableError: (e) => errors.push(e),
      });
    });
    expect(errors).toEqual([]);
    expect(slot().contains(serverNode)).toBe(true);
    expect(slot().querySelector(':scope > [data-page-header-portal="page"]')).not.toBeNull();
    expect(document.querySelector("matrx-header-ghost")).toBeNull();
    expect(mounts).toBe(1);

    // Still a live React node where it now sits.
    await act(async () => serverNode!.click());
    expect(serverNode!.textContent).toBe("Flashcard Studio 1");

    // 5. Unmount hands it back; nothing throws, the slot empties.
    act(() => root!.unmount());
    root = null;
    expect(app.childElementCount).toBe(0);
  });

  it("server-renders the right slot, reserves its width before hydration, and moves it in", async () => {
    const tree = (
      <Shell>
        <PageHeaderRightPortal>
          <button type="button" aria-label="Incognito" data-right-probe />
        </PageHeaderRightPortal>
        {header()}
      </Shell>
    );
    const html = renderToString(tree);
    expect(html).toContain('aria-label="Incognito"');
    parseLikeABrowser(html);
    expect(document.head.querySelector('style[data-page-header-reserve="shell-header-right"]')).not.toBeNull();
    expect(document.querySelectorAll("matrx-header-ghost")).toHaveLength(2);
    const serverNode = app.querySelector("[data-right-probe]");

    const errors: unknown[] = [];
    await act(async () => {
      root = hydrateRoot(app, tree, { onRecoverableError: (e) => errors.push(e) });
    });
    expect(errors).toEqual([]);
    expect(document.getElementById("shell-header-right")!.contains(serverNode)).toBe(true);
    expect(document.querySelector("matrx-header-ghost")).toBeNull();
    expect(document.head.querySelector("style[data-page-header-reserve]")).toBeNull();
  });

  it("portals a client-only mount (client navigation) into the slot", () => {
    root = createRoot(app);
    act(() => root!.render(<Shell>{header("Message templates")}</Shell>));
    expect(slot().textContent).toContain("Message templates");
    expect(app.querySelector("[data-page-header-ssr]")).toBeNull();
  });
});

// ── 7. static: no route header behind dynamic({ ssr: false }) ──────────────
/**
 * Pre-existing surfaces whose header module is loaded client-only. SHRINK
 * ONLY — hoist the header out of the client-only module, then delete the row.
 */
const CLIENT_ONLY_HEADER_BASELINE = new Set([
  "app/(core)/tools/pdf-extractor/PdfStudioRouteClient.tsx -> features/pdf-extractor/studio/PdfStudioShell.tsx",
  "app/(core)/tools/pdf-extractor/PdfStudioRouteClient.tsx -> features/pdf-extractor/studio/PdfStudioMobile.tsx",
  "app/(core)/tools/scanner/ScannerRouteClient.tsx -> features/pdf/scanner/components/ScannerSurface.tsx",
  "app/(core)/tools/scanner/ScannerRouteClient.tsx -> features/pdf/scanner/components/desktop/ScannerDesktop.tsx",
  "features/agents/components/context-items/bodies/ProcessedDocumentBody.tsx -> features/rag/components/library/LibraryPreviewPage.tsx",
  "features/marketing/search-console/components/SearchConsoleGate.tsx -> features/marketing/search-console/components/SearchConsoleWorkspace.tsx",
  "features/notes/components/NotesLayout.tsx -> features/notes/components/NotesHeaderPortal.tsx",
  "features/notes/components/NotesView.tsx -> features/notes/components/mobile/MobileNotesView.tsx",
  "features/war-room/components/thread/ThreadAudioTab.tsx -> features/transcription-cleanup/components/CleanupPad.tsx",
]);

const HEADER_RENDER = /<(PageHeader|RouteHeader|EntityModeHeader|CrumbTrailHeader|MobilePanelShell)\b/;
const CLIENT_ONLY_DYNAMIC =
  /dynamic\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)[\s\S]{0,300}?ssr:\s*false/g;

function resolveSpec(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? spec.slice(2)
    : spec.startsWith(".")
      ? path.normalize(path.join(path.dirname(from), spec))
      : null;
  if (!base) return null;
  return [".tsx", ".ts", "/index.tsx"].map((ext) => base + ext).find((p) => existsSync(p)) ?? null;
}

function findClientOnlyHeaders(files: string[], read: (f: string) => string): string[] {
  const renders = new Set(files.filter((f) => HEADER_RENDER.test(read(f))));
  const found: string[] = [];
  for (const file of files) {
    for (const m of read(file).matchAll(CLIENT_ONLY_DYNAMIC)) {
      const target = resolveSpec(file, m[1]);
      if (target && renders.has(target)) found.push(`${file} -> ${target}`);
    }
  }
  return found;
}

describe("no route header is client-only", () => {
  const files = execSync("git ls-files 'app/*.tsx' 'features/*.tsx' 'components/*.tsx' 'lib/*.tsx'", {
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => f && existsSync(f) && !/\.test\.tsx$/.test(f));
  const read = (f: string) => readFileSync(f, "utf8");
  const found = findClientOnlyHeaders(files, read);

  it("finds no new header loaded through dynamic({ ssr: false })", () => {
    expect(found.filter((row) => !CLIENT_ONLY_HEADER_BASELINE.has(row))).toEqual([]);
  });

  it("keeps the baseline honest (a fixed entry leaves it)", () => {
    expect([...CLIENT_ONLY_HEADER_BASELINE].filter((row) => !found.includes(row))).toEqual([]);
  });

  it("detects the class (self-test)", () => {
    // RouteHeader renders <PageHeader>, so loading it client-only is the class.
    const fake: Record<string, string> = {
      "features/x/Route.tsx": `const H = dynamic(() => import("@/features/shell/components/header/RouteHeader"), { ssr: false });`,
    };
    const all = ["features/x/Route.tsx", "features/shell/components/header/RouteHeader.tsx"];
    const readFake = (f: string) => fake[f] ?? read(f);
    expect(findClientOnlyHeaders(all, readFake)).toEqual([
      "features/x/Route.tsx -> features/shell/components/header/RouteHeader.tsx",
    ]);
  });
});
