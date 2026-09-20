/**
 * 🚨 D343 — THE CONSOLE'S LINK AND THE LIBRARIES LIST MUST BE ONE QUERY.
 *
 * The Acquisition Console walk (2026-09-20) landed on `/libraries` from the
 * "Gmail export" row and got all 33 Libraries: the row's anchor was a bare
 * `/libraries`, and the destination read no filter from anywhere — typing
 * "Gmail" into its own search box narrowed nothing either, because
 * `GET /media/libraries` declared none of the three filters API-CONTRACT.md §3
 * published and FastAPI dropped all of them without a word.
 *
 * The server half landed in aidream `d7093434f6` (contract 0.6.0): `visibility`,
 * `adapter` and `q` are declared, unknown values are refused 400, and `total`
 * counts the filtered set. This file is the frontend half's proof, and it walks
 * the WHOLE path rather than any one half of it:
 *
 *     console row → href → URL params → readQueryFromParams → the wire
 *
 * Every case below fails against the pre-fix code, and they fail in different
 * places on purpose — a link that stops carrying the filter, a reader that
 * stops parsing it, and a service that stops sending it are three separate
 * regressions and each has its own red.
 *
 * The response fixtures mirror the 0.6.0 shape (`total` = the filtered count),
 * because production has not deployed the server half yet and a live read would
 * still answer with the old behaviour.
 */

import { readQueryFromParams } from "@/lib/entity-list/urlQuery";
import {
  DEFAULT_ENTITY_LIST_QUERY,
  type EntityListQuery,
} from "@/lib/entity-list/types";
import { scopeKey } from "@/lib/list-scope/types";
import {
  librariesHref,
  rollUpLibraries,
  type LibraryFacts,
} from "@/features/acquisition-console/contract";

const listLibraries = jest.fn();

jest.mock("@/features/source-library/api", () => ({
  listLibraries: (...args: unknown[]) => listLibraries(...args),
  MediaApiError: class MediaApiError extends Error {},
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createLibraryListService } =
  require("@/features/source-library/browse/service") as typeof import("@/features/source-library/browse/service");

/** The query a person lands on, read the way the live shell reads it. */
function queryFromHref(href: string): EntityListQuery {
  const search = href.slice(href.indexOf("?"));
  return readQueryFromParams(
    new URLSearchParams(search),
    DEFAULT_ENTITY_LIST_QUERY,
  );
}

/** A §3 list response in the 0.6.0 shape: `total` is what the filter matched. */
function libraryListResponse(filteredTotal: number) {
  return {
    libraries: Array.from({ length: Math.min(filteredTotal, 25) }, (_, i) => ({
      id: `lib-${i}`,
      name: `Takeout-gmail-${i}.mbox`,
    })),
    total: filteredTotal,
    limit: 25,
    offset: 0,
  };
}

const SORT = {
  sort: "name",
  direction: "asc" as const,
  pageSize: 25,
  favoritesFirst: false,
};

beforeEach(() => {
  listLibraries.mockReset();
  listLibraries.mockResolvedValue(libraryListResponse(4));
});

describe("the console's Libraries row addresses one kind of Library", () => {
  it("carries the adapter as the shell's own filter bag, not a coined param", () => {
    const href = librariesHref("gmail_mbox", "personal");

    expect(href.startsWith("/libraries?")).toBe(true);
    const params = new URLSearchParams(href.slice(href.indexOf("?")));
    // The two names `lib/entity-list/urlQuery.ts` owns — never `?kind=`,
    // never `?adapter=`, which would be a third spelling of one vocabulary.
    expect([...params.keys()].sort()).toEqual(["filters", "scope"]);
    expect(JSON.parse(params.get("filters")!)).toEqual({
      adapter: { kind: "select", values: ["gmail_mbox"] },
    });
  });

  it("writes the scope explicitly, because the default is decided late", () => {
    // `useEntityList` can take its default scope from the entity-type registry,
    // which answers AFTER the first render — so a link that omits the scope is
    // a link whose landing tab depends on a race.
    for (const [lane, expected] of [
      ["personal", "mine"],
      ["internal", "orgs"],
      ["link", "shared"],
      ["public", "public"],
    ] as const) {
      const params = new URLSearchParams(
        librariesHref("youtube", lane).split("?")[1],
      );
      expect(params.get("scope")).toBe(expected);
    }
  });

  it("sends 'shared with you' to the lane the row actually carries", () => {
    // The console's own refinement — someone else's `personal` Library reaching
    // this seat through a share. The server has no lane for it, so the link
    // addresses `personal`/`mine`, where that Library really is listed, rather
    // than inventing a tab.
    const params = new URLSearchParams(
      librariesHref("gmail_mbox", "shared-with-you").split("?")[1],
    );
    expect(params.get("scope")).toBe("mine");
  });
});

describe("every 'What we have' Library row carries that address", () => {
  /** One real shelf: two Gmail exports of mine, one YouTube channel of mine. */
  const shelf: LibraryFacts[] = [
    {
      id: "a",
      adapter: "gmail_mbox",
      name: "Takeout-gmail-10000.mbox",
      itemCount: 10_000,
      lastTouchedAt: "2026-09-19T00:00:00Z",
      transcriptsReady: null,
      exportItems: 10_000,
      visibility: "personal",
      createdBy: "me",
    },
    {
      id: "b",
      adapter: "gmail_mbox",
      name: "fresh-10k.mbox",
      itemCount: 10_000,
      lastTouchedAt: "2026-09-20T00:00:00Z",
      transcriptsReady: null,
      exportItems: 10_000,
      visibility: "personal",
      createdBy: "me",
    },
    {
      id: "c",
      adapter: "youtube",
      name: "Darknet Diaries",
      itemCount: 150,
      lastTouchedAt: "2026-09-18T00:00:00Z",
      transcriptsReady: 12,
      exportItems: null,
      visibility: "internal",
      createdBy: "someone-else",
    },
  ];

  it("gives each grouped row a door to its own kind, never a bare /libraries", () => {
    const rows = rollUpLibraries(shelf, "me");

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      // The defect the walk photographed: `href: "/libraries"`, no query string
      // at all, landing on 33 unrelated rows.
      expect(row.href).not.toBe("/libraries");
      expect(row.href).toContain("filters=");
      expect(row.href).toContain("scope=");
    }

    const gmail = rows.find((row) => row.id === "library:gmail_mbox::personal");
    expect(gmail?.href).toBe(librariesHref("gmail_mbox", "personal"));
    const youtube = rows.find((row) => row.id === "library:youtube::internal");
    expect(youtube?.href).toBe(librariesHref("youtube", "internal"));
  });
});

describe("the Libraries list reads that link back as its own query", () => {
  it("lands on the addressed tab with the addressed filter", () => {
    const query = queryFromHref(librariesHref("gmail_mbox", "internal"));

    expect(scopeKey(query.scope)).toBe("orgs");
    expect(query.filters).toEqual({
      adapter: { kind: "select", values: ["gmail_mbox"] },
    });
  });

  it("keeps a typed search across a reload", () => {
    const query = queryFromHref("/libraries?q=gmail&scope=mine");
    expect(query.search).toBe("gmail");
  });

  it("falls back rather than throwing on a hand-edited URL", () => {
    const query = queryFromHref("/libraries?scope=nonsense&filters=not-json");
    expect(scopeKey(query.scope)).toBe(scopeKey(DEFAULT_ENTITY_LIST_QUERY.scope));
    expect(query.filters).toEqual({});
  });
});

describe("the query reaches the wire, and the count is the filtered one", () => {
  it("sends the lane, the adapter and the words in the box", async () => {
    const service = createLibraryListService(jest.fn() as never, 25);
    const query = {
      ...queryFromHref(librariesHref("gmail_mbox", "personal")),
      search: "takeout",
    };

    const page = await service.fetchPage(query, SORT);

    expect(listLibraries).toHaveBeenCalledTimes(1);
    expect(listLibraries.mock.calls[0][1]).toMatchObject({
      visibility: ["personal"],
      adapter: ["gmail_mbox"],
      q: "takeout",
    });
    // 0.6.0: `total` is what the filter matched. Reading the organization's
    // whole shelf here would page straight off the end of a narrowed set.
    expect(page.total).toBe(4);
    expect(page.rows).toHaveLength(4);
  });

  it("sends no adapter at all when nothing is filtered", async () => {
    const service = createLibraryListService(jest.fn() as never, 25);

    await service.fetchPage(DEFAULT_ENTITY_LIST_QUERY, SORT);

    expect(listLibraries.mock.calls[0][1]).not.toHaveProperty("adapter");
    expect(listLibraries.mock.calls[0][1]).not.toHaveProperty("q");
  });

  it("passes an adapter this build has never heard of straight to the server", async () => {
    // The client's `MediaAdapter` union names ten adapters and the live shelf
    // carries more. Dropping an unknown key here would silently ignore a filter
    // the URL claims — D343 one layer up. The server owns the vocabulary and
    // refuses what it does not know with a sentence naming the accepted set.
    const service = createLibraryListService(jest.fn() as never, 25);
    const query = queryFromHref(librariesHref("kindle_clippings", "personal"));

    await service.fetchPage(query, SORT);

    expect(listLibraries.mock.calls[0][1].adapter).toEqual(["kindle_clippings"]);
  });

  it("counts each lane tab under the SAME narrowing the list is under", async () => {
    // A tab reading "Mine 33" that becomes eleven rows when pressed is the
    // "tile says 0 while the list says 5" defect with the numbers swapped.
    const service = createLibraryListService(jest.fn() as never, 25);
    const query = {
      ...queryFromHref(librariesHref("gmail_mbox", "personal")),
      search: "takeout",
    };

    await service.fetchCounts(query);

    expect(listLibraries).toHaveBeenCalledTimes(4);
    for (const call of listLibraries.mock.calls) {
      expect(call[1]).toMatchObject({
        adapter: ["gmail_mbox"],
        q: "takeout",
        limit: 1,
      });
    }
    expect(
      listLibraries.mock.calls.map((call) => call[1].visibility[0]).sort(),
    ).toEqual(["internal", "link", "personal", "public"]);
  });
});
