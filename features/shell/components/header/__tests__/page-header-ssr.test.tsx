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
import { aliasTarget, gitFiles } from "@/scripts/lib/source-roots.cjs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/kit/media-query", () => ({ ...jest.requireActual("@ai-matrx/kit/media-query"), useIsMobile: () => false }));

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

/** The ghost script draws a CENTER ghost in the next animation frame; tests
 *  hold frames in a queue and flush them where a browser would paint. */
let frameQueue: FrameRequestCallback[] = [];
const realRaf = window.requestAnimationFrame;
function flushFrame() {
  const queued = frameQueue;
  frameQueue = [];
  queued.forEach((cb) => cb(performance.now()));
}

beforeAll(() => {
  window.requestAnimationFrame = (cb) => {
    frameQueue.push(cb);
    return frameQueue.length;
  };
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.id !== "shell-header-center" && this.id !== "shell-header-right") return realRect.call(this);
    return { left: 120, top: 22, width: 640, height: 0, right: 760, bottom: 22, x: 120, y: 22, toJSON() {} } as DOMRect;
  };
});
afterAll(() => {
  window.requestAnimationFrame = realRaf;
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
  flushFrame();
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
    // Exactly ONE header node carries the portal marker while the ghost is up
    // (the ghost's clone wears `data-page-header-ghost-portal`): /applets/build
    // read as a double header for the ~1-2s before hydration.
    expect(document.querySelectorAll("[data-page-header-portal]")).toHaveLength(1);
    expect(ghostLayer!.querySelector("[data-page-header-ghost-portal]")).not.toBeNull();

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

  it("draws the center ghost only in the next frame, after a right slot parsed behind it has reserved its width", () => {
    // /notes/<id>: the center portal streams BEFORE the right one; drawn at
    // once, the center painted at the wide slot and jumped 64px when the
    // right reservation landed (2026-09-28).
    const html = renderToString(
      <Shell>
        {header("Split")}
        <PageHeaderRightPortal>
          <button type="button" aria-label="Refresh notes" />
        </PageHeaderRightPortal>
      </Shell>,
    );
    app.innerHTML = html;
    const scripts = [...app.querySelectorAll("script")];
    // Parse the center's script only: nothing may be drawn yet.
    const run = (dead: HTMLScriptElement) => {
      const live = document.createElement("script");
      live.textContent = dead.textContent;
      dead.replaceWith(live);
    };
    run(scripts[0]!);
    expect(document.querySelector("matrx-header-ghost.shell-header-center")).toBeNull();
    // The right slot's script parses before the frame: it reserves at once.
    run(scripts[1]!);
    expect(document.head.querySelector('style[data-page-header-reserve="shell-header-right"]')).not.toBeNull();
    // The frame: the center is laid out now, against the reserved row.
    flushFrame();
    expect(document.querySelector("matrx-header-ghost.shell-header-center")?.textContent).toContain("Split");
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

  // 8. A server-rendered header React NEVER hydrates must not stay painted.
  //    Observed 2026-09-27 on /education/flashcards/[setId] (a route with a
  //    loading.tsx): the page streamed in a hidden segment `<div hidden
  //    id="S:0">`; its inline script cloned the placeholder title ("Flashcard
  //    set") into a ghost while the HTML parsed; React 19's batched reveal
  //    ($RC → $RB → $RV on the next frame) had not swapped the segment in when
  //    React client-rendered that boundary instead — the boundary's `B:0`
  //    marker went away, the segment stayed in <body>, no layout effect ever
  //    ran for that anchor, and the stale ghost sat over the real title.
  function streamStaleSegment(boundaryStillPending: boolean) {
    if (boundaryStillPending) {
      const marker = document.createElement("template");
      marker.id = "B:0";
      app.appendChild(marker);
    }
    const segment = document.createElement("div");
    segment.hidden = true;
    segment.id = "S:0";
    document.body.appendChild(segment);
    segment.innerHTML = renderToString(header("Flashcard set"));
    // The ghost is drawn while the HTML parses, before the bundle has loaded:
    // the client's "ghost born" hook does not exist yet.
    const w = window as Window & { __matrxHeaderGhostBorn?: () => void };
    const born = w.__matrxHeaderGhostBorn;
    delete w.__matrxHeaderGhostBorn;
    segment.querySelectorAll("script").forEach((dead) => {
      const live = document.createElement("script");
      live.textContent = dead.textContent;
      dead.replaceWith(live);
    });
    flushFrame();
    w.__matrxHeaderGhostBorn = born;
    expect(document.querySelector("matrx-header-ghost")?.textContent).toContain("Flashcard set");
  }

  it("drops the ghost and anchor of a streamed segment React discarded", () => {
    root = createRoot(app);
    act(() => root!.render(<Shell>{null}</Shell>));
    streamStaleSegment(false);

    // React client-renders the boundary: a client-only mount of the real header.
    act(() => root!.render(<Shell>{header("AP Chemistry: Core Nomenclature")}</Shell>));

    expect(slot().textContent).toContain("AP Chemistry: Core Nomenclature");
    expect(document.querySelector("matrx-header-ghost")).toBeNull();
    expect(document.querySelector("[data-page-header-ssr]")).toBeNull();
    expect(document.body.textContent).not.toContain("Flashcard set");
  });

  it("keeps the ghost of a streamed segment whose reveal is still pending", () => {
    root = createRoot(app);
    act(() => root!.render(<Shell>{null}</Shell>));
    streamStaleSegment(true);

    // Another header instance mounts while the segment waits for its reveal.
    act(() => root!.render(<Shell>{header("Section nav")}</Shell>));

    expect(document.querySelector("matrx-header-ghost")?.textContent).toContain("Flashcard set");
    expect(document.querySelector("[data-page-header-ssr]")).not.toBeNull();
  });

  it("drops the ghost once its pending segment is discarded later, with no new mount", async () => {
    root = createRoot(app);
    act(() => root!.render(<Shell>{null}</Shell>));
    streamStaleSegment(true);
    act(() => root!.render(<Shell>{header("Section nav")}</Shell>));
    expect(document.querySelector("matrx-header-ghost")).not.toBeNull();

    // React client-renders the boundary: its marker goes; nothing else mounts.
    document.getElementById("B:0")!.remove();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(document.querySelector("matrx-header-ghost")).toBeNull();
    expect(document.querySelector("[data-page-header-ssr]")).toBeNull();
  });

  it("treats a segment whose marker sits in a discarded segment as discarded (nested boundaries)", () => {
    root = createRoot(app);
    act(() => root!.render(<Shell>{null}</Shell>));
    // B:0 is the nested boundary's marker, streamed inside S:1 — whose own
    // marker B:1 React already discarded.
    const outer = document.createElement("div");
    outer.hidden = true;
    outer.id = "S:1";
    const nestedMarker = document.createElement("template");
    nestedMarker.id = "B:0";
    outer.appendChild(nestedMarker);
    document.body.appendChild(outer);
    streamStaleSegment(false);

    act(() => root!.render(<Shell>{header("AI-Powered SEO")}</Shell>));
    expect(document.querySelector("matrx-header-ghost")).toBeNull();
    expect(document.querySelector("[data-page-header-ssr]")).toBeNull();
  });

  // 9. A CENTER ghost drawn in a frame that arrives AFTER the real header
  //    mounted. Observed 2026-09-28 on /files/f/<id> (loading.tsx + a hidden
  //    agent tab): the center ghost waits for requestAnimationFrame, frames
  //    are held while the tab is hidden, React client-rendered the boundary
  //    and its header swept first (no ghost yet, so no watcher) — then the
  //    frame came and the placeholder "Loading…" was cloned into a ghost
  //    that nothing ever swept: two titles in the header.
  function streamSegmentFrameHeld(boundaryStillPending: boolean) {
    if (boundaryStillPending) {
      const marker = document.createElement("template");
      marker.id = "B:0";
      app.appendChild(marker);
    }
    const segment = document.createElement("div");
    segment.hidden = true;
    segment.id = "S:0";
    document.body.appendChild(segment);
    segment.innerHTML = renderToString(header("Loading…"));
    segment.querySelectorAll("script").forEach((dead) => {
      const live = document.createElement("script");
      live.textContent = dead.textContent;
      dead.replaceWith(live);
    });
    // The frame is held (hidden tab): no ghost yet.
    expect(document.querySelector("matrx-header-ghost")).toBeNull();
  }

  it("drops a center ghost drawn in a late frame after its segment was discarded", () => {
    root = createRoot(app);
    act(() => root!.render(<Shell>{null}</Shell>));
    streamSegmentFrameHeld(false);
    act(() => root!.render(<Shell>{header("soil-health-field-notes.txt")}</Shell>));

    flushFrame();

    expect(slot().textContent).toContain("soil-health-field-notes.txt");
    expect(document.querySelector("matrx-header-ghost")).toBeNull();
    expect(document.querySelector("[data-page-header-ssr]")).toBeNull();
  });

  it("drops a late-frame center ghost once its pending segment is discarded later", async () => {
    root = createRoot(app);
    act(() => root!.render(<Shell>{null}</Shell>));
    streamSegmentFrameHeld(true);
    act(() => root!.render(<Shell>{header("soil-health-field-notes.txt")}</Shell>));
    flushFrame();
    // Still pending: the ghost may stand in for the unrevealed segment.
    expect(document.querySelector("matrx-header-ghost")?.textContent).toContain("Loading…");

    document.getElementById("B:0")!.remove();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(document.querySelector("matrx-header-ghost")).toBeNull();
    expect(document.querySelector("[data-page-header-ssr]")).toBeNull();
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
  "features/notes/components/NotesLayout.tsx -> features/notes/components/NotesHeaderPortal.tsx",
  "features/notes/components/NotesView.tsx -> features/notes/components/mobile/MobileNotesView.tsx",
  "features/war-room/components/thread/ThreadAudioTab.tsx -> features/transcription-cleanup/components/CleanupPad.tsx",
]);

const HEADER_RENDER = /<(PageHeader|RouteHeader|EntityModeHeader|CrumbTrailHeader|MobilePanelShell)\b/;
const CLIENT_ONLY_DYNAMIC =
  /dynamic\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)[\s\S]{0,300}?ssr:\s*false/g;

function resolveSpec(from: string, spec: string): string | null {
  const aliased = aliasTarget(spec);
  const base = aliased !== null
    ? aliased
    : spec.startsWith(".")
      ? path.normalize(path.join(path.dirname(from), spec))
      : null;
  if (!base) return null;
  return [".tsx", ".ts", "/index.tsx"].map((ext) => base + ext).find((p) => existsSync(p)) ?? null;
}

/** Does the dynamic() at `at` pass a `loading` fallback that draws a header —
 *  inline, or through a local `*HeaderFallback` component / `loading` const? */
function loadingDrawsHeader(text: string, at: number): boolean {
  const call = text.slice(at, at + 700);
  const loading = call.match(/loading(?::\s*([\s\S]{0,300}?)\}\s*,?\s*\)|\s*[,}])/);
  if (!loading) return false;
  const fallback = loading[1] ?? "";
  const DRAWS = /<(PageHeader|RouteHeader|EntityModeHeader|CrumbTrailHeader|\w+HeaderFallback)\b/;
  if (DRAWS.test(fallback)) return true;
  // Shorthand `loading` / a named function: read its local definition.
  const name = loading[1] ? fallback.match(/^\s*(?:\(\)\s*=>\s*<)?(\w+)/)?.[1] : "loading";
  if (!name) return false;
  const def = text.match(new RegExp(`(?:const|function)\\s+${name}\\b[\\s\\S]{0,400}`));
  return def ? DRAWS.test(def[0]) : false;
}

function findClientOnlyHeaders(files: string[], read: (f: string) => string): string[] {
  const renders = new Set(files.filter((f) => HEADER_RENDER.test(read(f))));
  const found: string[] = [];
  for (const file of files) {
    const text = read(file);
    for (const m of text.matchAll(CLIENT_ONLY_DYNAMIC)) {
      const target = resolveSpec(file, m[1]);
      if (!target || !renders.has(target)) continue;
      // Covered: its `loading` fallback (rendered by the server) draws a header.
      if (loadingDrawsHeader(text, m.index ?? 0)) continue;
      found.push(`${file} -> ${target}`);
    }
  }
  return found;
}

describe("no route header is client-only", () => {
  const files = gitFiles(process.cwd(), ["ls-files", "app/*.tsx", "features/*.tsx", "../aidream/apps/shared/chat/src/*.tsx", "components/*.tsx", "lib/*.tsx"])
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

  it("counts a client-only header as covered when its loading fallback draws one (self-test)", () => {
    const fake: Record<string, string> = {
      "features/x/Covered.tsx": `const H = dynamic(() => import("@host/features/shell/components/header/RouteHeader"), { ssr: false, loading: () => <XHeaderFallback /> });`,
      "features/x/Bare.tsx": `const H = dynamic(() => import("@host/features/shell/components/header/RouteHeader"), { ssr: false, loading: () => <Spinner /> });`,
    };
    const all = ["features/x/Covered.tsx", "features/x/Bare.tsx", "features/shell/components/header/RouteHeader.tsx"];
    expect(findClientOnlyHeaders(all, (f) => fake[f] ?? read(f))).toEqual([
      "features/x/Bare.tsx -> features/shell/components/header/RouteHeader.tsx",
    ]);
  });

  it("detects the class (self-test)", () => {
    // RouteHeader renders <PageHeader>, so loading it client-only is the class.
    const fake: Record<string, string> = {
      "features/x/Route.tsx": `const H = dynamic(() => import("@host/features/shell/components/header/RouteHeader"), { ssr: false });`,
    };
    const all = ["features/x/Route.tsx", "features/shell/components/header/RouteHeader.tsx"];
    const readFake = (f: string) => fake[f] ?? read(f);
    expect(findClientOnlyHeaders(all, readFake)).toEqual([
      "features/x/Route.tsx -> features/shell/components/header/RouteHeader.tsx",
    ]);
  });
});
