// features/make/__tests__/public-gallery-shows-platform-templates-and-leads-to-install.test.tsx
// (lane MAKE-HOME, wave 4b — Arman 2026-10-02: "the template gallery is public and indexed").
//
// THE USE CASE. Dr. Okafor runs a primary care practice and finds AI Matrx through a search. Signed
// out, she opens /templates, sees the platform's templates (never an organization's own saved ones),
// narrows to Healthcare, opens "Primary care practice", reads what it makes, and presses "Use this
// template": she signs up and lands on the install for exactly that template.
//
// SUT: the two public pages (app/(public)/templates) and their read, `readPublicCatalogueWith`, run
// for real. Replaced: only the network call beneath them (the door's answer), with cards captured
// from the clone's `custom.template` rows (fixtures/clone-template-cards.json, 2026-10-03).
//
// BREAKS THIS CATCHES: an organization's saved template leaking onto a public page · the second page
// of a long catalogue dropped · "Use this template" not leading through sign-up to that template's
// install · a closed or absent door crashing the page instead of an empty gallery · a real failure
// read as an empty gallery · the public page drawing its own card instead of the shared one.
//
// RED ON A PLANT (never in the tracked tree): MAKE_PUBLIC_PLANT=<scratch copy of
// features/make/gallery/publicGallery.ts> swaps the module for the mutated copy (proof in the 4b report).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import cardsFixture from "./fixtures/clone-template-cards.json";
import type { GalleryCard } from "../gallery/catalogue";

jest.mock("../gallery/publicGallery", () =>
  process.env.MAKE_PUBLIC_PLANT ? jest.requireActual(process.env.MAKE_PUBLIC_PLANT) : jest.requireActual("../gallery/publicGallery"),
);

type DoorReply = { data: unknown; error: { code: string; message: string } | null };
let pages: DoorReply[] = [];
const offsetsAsked: number[] = [];

jest.mock("../gallery/publicCatalogue.server", () => {
  const { readPublicCatalogueWith } = jest.requireMock("../gallery/publicGallery") as typeof import("../gallery/publicGallery");
  return {
    readPublicCatalogue: () =>
      readPublicCatalogueWith(async (offset: number) => {
        offsetsAsked.push(offset);
        return pages[offset / 200] ?? { data: { total: 0, limit: 200, offset, cards: [] }, error: null };
      }),
  };
});

// eslint-disable-next-line import/first -- the pages must load after the read is wired
import PublicTemplatesPage from "@/app/(public)/templates/page";
// eslint-disable-next-line import/first
import PublicTemplatePage, { generateMetadata } from "@/app/(public)/templates/[catalogueId]/page";

const CAPTURED = cardsFixture as unknown as GalleryCard[];
const ACCOUNTING = CAPTURED.find((c) => c.catalogue_id === "T0001")!;
const PRIMARY_CARE = CAPTURED.find((c) => c.catalogue_id === "T0016")!;
const SAVED_BY_BRENNAN = CAPTURED.find((c) => c.catalogue_id === "BV-INTAKE")!;

/** A catalogue longer than one door page: 199 more practices + the org card on page 1, primary care on page 2. */
function twoPages(): DoorReply[] {
  const filler: GalleryCard[] = Array.from({ length: 199 }, (_, i) => ({
    ...ACCOUNTING,
    id: `a0000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    catalogue_id: `T${String(2000 + i)}`,
  }));
  const first = [SAVED_BY_BRENNAN, ...filler];
  return [
    { data: { total: 201, limit: 200, offset: 0, cards: first }, error: null },
    { data: { total: 201, limit: 200, offset: 200, cards: [PRIMARY_CARE] }, error: null },
  ];
}

const open = () => {
  pages = [{ data: { total: 3, limit: 200, offset: 0, cards: [SAVED_BY_BRENNAN, ACCOUNTING, PRIMARY_CARE] }, error: null }];
};
const closedWith = (code: string, message: string) => {
  pages = [{ data: null, error: { code, message } }];
};

async function html(node: Promise<React.ReactElement>) {
  return renderToStaticMarkup(await node);
}
const index = (industry?: string) => html(PublicTemplatesPage({ searchParams: Promise.resolve({ industry }) }));
const detail = (catalogueId: string) => html(PublicTemplatePage({ params: Promise.resolve({ catalogueId }) }));

beforeEach(() => {
  offsetsAsked.length = 0;
});

describe("the public gallery index", () => {
  it("shows the platform's templates and never an organization's saved one", async () => {
    open();
    const page = await index();
    expect(page).toContain('href="/templates/T0001"');
    expect(page).toContain('href="/templates/T0016"');
    expect(page).toContain("Accounting firm");
    expect(page).toContain("Primary care practice");
    expect(page).not.toContain("Brennan &amp; Vogel client intake");
    expect(page).not.toContain("BV-INTAKE");
  });

  it("reads a catalogue longer than one page to its end", async () => {
    pages = twoPages();
    const page = await index();
    expect(offsetsAsked).toEqual([0, 200]);
    expect(page).toContain('href="/templates/T0016"');
    expect(page).toContain('href="/templates/T2198"');
  });

  it.each([
    ["healthcare", "Primary care practice", "Accounting firm"],
    ["legal_professional", "Accounting firm", "Primary care practice"],
  ])("narrows to one industry (%s)", async (industry, shown, hidden) => {
    open();
    const page = await index(industry);
    expect(page).toContain(shown);
    expect(page).not.toContain(`>${hidden}<`);
  });

  it.each([
    ["PGRST202", "Could not find the function custom.templates(p_filter) in the schema cache"],
    ["42501", "Sign in to see the template gallery."],
  ])("renders an empty gallery, not a crash, when the door is closed (%s)", async (code, message) => {
    closedWith(code, message);
    const page = await index();
    expect(page).toContain('data-public-templates="closed"');
    expect(page).toContain("No public templates yet");
  });

  it("does not read a real failure as an empty gallery", async () => {
    closedWith("57014", "canceling statement due to statement timeout");
    await expect(index()).rejects.toThrow("statement timeout");
  });
});

describe("one template's public page", () => {
  it.each([
    [PRIMARY_CARE, "Primary care practice", "5aaf7af6-4ac3-4a0f-9f59-42d7743afee8"],
    [ACCOUNTING, "Accounting firm", "1a6d6675-b9d8-45d2-b9ce-f0aac462378a"],
  ])("leads %#: Use this template → sign up → that template's install", async (card, name, versionId) => {
    open();
    const page = await detail(card.catalogue_id);
    expect(page).toContain(`>${name}</h1>`);
    expect(page).toContain(`href="/sign-up?redirectTo=%2Fmake%2Ftemplates%2F${versionId}"`);
    expect(page).toContain(">Use this template<");
    expect(page).toContain(card.footprint!.line!.split(" · ")[0].replace(/^(\d+) /, "$1</span> <span class=\"text-muted-foreground\">"));
  });

  it.each([
    ["T0016", "Primary care practice", "Marisol Teague"],
    ["T0001", "Accounting firm", "Denise Albright"],
  ])("carries its own title and description for search engines (%s)", async (id, name, personaStart) => {
    open();
    const meta = await generateMetadata({ params: Promise.resolve({ catalogueId: id }) });
    expect(String(meta.title)).toContain(name);
    expect(String(meta.description)).toContain(personaStart);
    expect(meta.robots).toBeUndefined();
  });

  it("keeps an organization's saved template off the public web", async () => {
    open();
    expect(await detail("BV-INTAKE")).toContain("This template is not in the gallery");
    const meta = await generateMetadata({ params: Promise.resolve({ catalogueId: "BV-INTAKE" }) });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("says the template is not in the gallery when the door is absent", async () => {
    closedWith("PGRST202", "Could not find the function custom.templates(p_filter) in the schema cache");
    expect(await detail("T0016")).toContain("This template is not in the gallery");
  });
});

describe("one gallery drawing, two hosts", () => {
  // A census: the card and the summary markup live in TemplateCards.tsx only. A host that draws its
  // own card (a fork) carries one of these attributes and fails here.
  const ROOTS = [join(__dirname, "..", "gallery"), join(__dirname, "..", "..", "..", "app", "(public)", "templates")];
  const MARKERS = ["data-make-gallery-card=", 'id="make-template-installs"'];
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
    });

  it("only TemplateCards.tsx draws a card or a summary, and both hosts use it", () => {
    const all = ROOTS.flatMap(files);
    const drawers = all.filter((f) => MARKERS.some((m) => readFileSync(f, "utf8").includes(m))).map((f) => relative(join(__dirname, "..", "..", ".."), f));
    expect(drawers).toEqual([join("features", "make", "gallery", "TemplateCards.tsx")]);
    for (const host of [join(ROOTS[0], "TemplateGallery.tsx"), join(ROOTS[1], "page.tsx"), join(ROOTS[1], "[catalogueId]", "page.tsx")]) {
      expect(readFileSync(host, "utf8")).toMatch(/from "(\.\/|@\/features\/make\/gallery\/)TemplateCards"/);
    }
  });
});
