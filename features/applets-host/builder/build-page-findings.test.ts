/**
 * The Applet build page, audit9 (2026-10-09) — B1, B3, B4, B13, B14, B2.
 *
 *  B1  a refresh mid-build showed the EMPTY start screen for a minute: the record is now read by the
 *      page's server render and handed in, and an open request on it IS the build step (`buildingStep`).
 *  B3  the progress clock restarted at every step: one start time per request.
 *  B4  "Writing entry.tsx · 7 lines so far": files are said in her words (`plainFileLabel`); the result
 *      card's title is the Applet's name, never "/applets/<slug>".
 *  B13 the floating window went blank ("Done", then "Processing…") over the preview: the run keeps its
 *      instance until the answer is saved, then the window closes.
 *  B14 a 409 on every first save of a common name: taken addresses are skipped before the write.
 *  B2  at 390px the preview covered "Use it" / "Open": one scrolling column on a phone.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { plainFileLabel } from "@/features/content-ir/kinds/applet-build-result";

import { slugCandidate } from "./build-applet";
import { buildingStep, newBuildEntry, type BuildEntry } from "./build-session";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const builder = read("features/applets-host/builder/AppletBuilder.tsx");

describe("B1 — an open request is the build, from the first paint", () => {
  it("names the build and keeps its own start time", () => {
    const entry: BuildEntry = { ...newBuildEntry("A reading list", null), started_at: "2026-10-09T05:00:00.000Z", state: "running" };
    expect(buildingStep([entry])).toEqual({ label: "Building your Applet", since: Date.parse("2026-10-09T05:00:00.000Z") });
    expect(buildingStep([{ ...entry, fix: { where: "record", message: "x" } }])?.label).toBe("I found a problem and I'm fixing it");
  });
  it("is nothing once the request has ended", () => {
    const entry: BuildEntry = { ...newBuildEntry("A reading list", null), state: "saved" };
    expect(buildingStep([entry])).toBeNull();
    expect(buildingStep([])).toBeNull();
    expect(buildingStep(null)).toBeNull();
  });
  it("the page hands the server-read record to the builder", () => {
    const page = read("app/(core)/applets/build/[id]/page.tsx");
    expect(page).toContain("initialRecord={initialRecord}");
    expect(read("features/applets-host/builder/useAppletBuildSession.ts")).toContain("useState<BuildRecord | null>(opts.initialRecord ?? null)");
    expect(builder).toContain("buildingStep(session.record?.requests)");
  });
});

describe("B3 — one clock per request", () => {
  it("later steps keep the first step's start time", () => {
    expect(builder).toContain('stepTo("Reading your tables")');
    expect(builder).toContain('stepTo("Starting the builder")');
    // No step after the first may restart the clock.
    expect(builder.match(/setStep\(\{ label: [^}]*since: Date\.now\(\) \}\)/g) ?? []).toHaveLength(1);
  });
});

describe("B4 — plain words", () => {
  const pages = [
    { path: "/", title: "Books" },
    { path: "/add", title: "Add Book" },
  ];
  it.each([
    ["entry.tsx", "the main screen"],
    ["Books.tsx", "the Books page"],
    ["pages/AddBook.tsx", "the Add Book page"],
    ["BookCard.tsx", "the book card"],
    ["useBooks.ts", "the parts behind the pages"],
    ["styles.css", "the look"],
  ])("%s → %s", (file, words) => {
    expect(plainFileLabel(file, pages)).toBe(words);
  });
  it("the writing list and the card never show a file name or a raw path", () => {
    const block = read("components/mardown-display/blocks/applet-build-result/AppletBuildResultBlock.tsx");
    expect(block).not.toContain("lines so far");
    expect(block).not.toContain('"Your app"');
    expect(builder).not.toContain("/applets/{saved.slug}</span>");
    expect(builder).toContain("{saved.name}</span>");
  });
});

describe("B13 — the window resolves and gets out of the way", () => {
  it("keeps the run's instance, closes the window on save, and keeps the build's conversation", () => {
    expect(builder).toContain("keepInstance: true");
    expect(builder).toMatch(/shown\.current = `\$\{id\}\|\$\{entry\.id\}:saved`;\s*closeRunWindow\(\);/);
    // F6b: a build is ONE conversation, shown in the left panel and continued by every later round,
    // so closing the run window must never destroy its instance.
    expect(builder).not.toContain("destroyInstanceIfAllowed");
  });
});

describe("B14 — a taken address is skipped before the write", () => {
  it("uses the base when free, a free variant when taken", () => {
    expect(slugCandidate("reading-list", 0, new Set())).toBe("reading-list");
    const next = slugCandidate("reading-list", 0, new Set(["reading-list"]));
    expect(next).toMatch(/^reading-list-[a-z0-9]{1,4}$/);
  });
});

describe("B2 — a phone scrolls one column", () => {
  it("the page scrolls below lg and the preview keeps its own height", () => {
    expect(builder).toContain("overflow-y-auto p-3 lg:grid-cols-[minmax(320px,2fr)_5fr]");
    expect(builder).toContain("min-h-[70dvh]");
  });
});
