import {
  buildRepositorySourceUrl,
  formatNpmPublishDate,
  loadNpmPackageCatalog,
  normalizeRepositoryUrl,
} from "./npmRegistry";

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

describe("npm package catalog", () => {
  it("formats publish dates deterministically across server and browser timezones", () => {
    expect(formatNpmPublishDate("2026-09-13T00:30:00.000Z")).toBe("Sep 13, 2026");
  });

  it("exhausts search pages, filters fuzzy matches, and deduplicates exact scope names", async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async (input) => {
      const url = String(input);
      if (url.includes("/-/v1/search")) {
        const offset = Number(new URL(url).searchParams.get("from"));
        if (offset === 0) {
          return jsonResponse({
            total: 3,
            objects: [
              { package: { name: "@ai-matrx/kit" } },
              { package: { name: "matrx-js" } },
            ],
          });
        }
        return jsonResponse({
          total: 3,
          objects: [{ package: { name: "@ai-matrx/kit" } }],
        });
      }
      return jsonResponse({
        name: "@ai-matrx/kit",
        "dist-tags": { latest: "1.2.3" },
        time: { "1.2.3": "2026-09-13T00:00:00.000Z" },
        versions: {
          "1.2.3": {
            repository: {
              url: "git+https://github.com/AI-Matrix-Engine/aidream.git",
              directory: "apps/shared/kit",
            },
          },
        },
      });
    });

    const rows = await loadNpmPackageCatalog(fetcher);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "@ai-matrx/kit",
      lifecycle: "published",
      sourceUrl:
        "https://github.com/AI-Matrix-Engine/aidream/tree/main/apps/shared/kit",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("keeps reservation and deprecation separate and omits invented source links", async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async (input) => {
      const url = String(input);
      if (url.includes("/-/v1/search")) {
        return jsonResponse({
          total: 1,
          objects: [{ package: { name: "@ai-matrx/future" } }],
        });
      }
      return jsonResponse({
        "dist-tags": { latest: "0.0.0" },
        time: { "0.0.0": "2026-09-13T00:00:00.000Z" },
        versions: {
          "0.0.0": { deprecated: "Use the eventual implementation." },
        },
      });
    });

    await expect(loadNpmPackageCatalog(fetcher)).resolves.toEqual([
      expect.objectContaining({
        lifecycle: "reserved",
        deprecated: true,
        sourceUrl: null,
        repositoryDirectory: null,
      }),
    ]);
  });

  it("normalizes only safe HTTPS repository doors", () => {
    expect(
      normalizeRepositoryUrl(
        "git+https://github.com/AI-Matrix-Engine/aidream.git",
      ),
    ).toBe("https://github.com/AI-Matrix-Engine/aidream");
    expect(normalizeRepositoryUrl("ssh://git@github.com/private/repo.git")).toBeNull();
    expect(buildRepositorySourceUrl(null, "apps/shared/kit", "published")).toBeNull();
    expect(
      buildRepositorySourceUrl(
        "https://github.com/AI-Matrix-Engine/aidream",
        "apps/shared/future",
        "reserved",
      ),
    ).toBeNull();
  });

  it("refuses to label a premature empty search page as complete", async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async (input) => {
        const offset = Number(new URL(String(input)).searchParams.get("from"));
        return jsonResponse(
          offset === 0
            ? { total: 2, objects: [{ package: { name: "@ai-matrx/one" } }] }
            : { total: 2, objects: [] },
        );
      },
    );

    await expect(loadNpmPackageCatalog(fetcher)).rejects.toThrow(
      "npm package search ended early at 1 of 2 results",
    );
  });

  it("accepts a valid empty exact scope", async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () => jsonResponse({ total: 0, objects: [] }),
    );

    await expect(loadNpmPackageCatalog(fetcher)).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
