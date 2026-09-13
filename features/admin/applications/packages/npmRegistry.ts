const NPM_SEARCH_URL = "https://registry.npmjs.org/-/v1/search";
const NPM_REGISTRY_URL = "https://registry.npmjs.org";
const PACKAGE_SCOPE = "@ai-matrx/";
const SEARCH_PAGE_SIZE = 250;

interface NpmSearchResponse {
  objects?: Array<{ package?: { name?: string } }>;
  total?: number;
}

interface NpmPackument {
  name?: string;
  "dist-tags"?: { latest?: string };
  time?: Record<string, string>;
  versions?: Record<
    string,
    {
      deprecated?: string;
      repository?: string | { url?: string; directory?: string };
    }
  >;
}

export interface NpmPackageCatalogRow {
  name: string;
  version: string;
  lifecycle: "published" | "reserved";
  deprecated: boolean;
  deprecationMessage: string | null;
  publishedAt: string | null;
  npmUrl: string;
  repositoryUrl: string | null;
  repositoryDirectory: string | null;
  sourceUrl: string | null;
}

type FetchLike = typeof fetch;

function requireOk(response: Response, label: string): Response {
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}`);
  }
  return response;
}

export function normalizeRepositoryUrl(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .replace(/^git\+/, "")
    .replace(/^git:\/\/github\.com\//, "https://github.com/")
    .replace(/\.git$/, "");
  return normalized.startsWith("https://") ? normalized : null;
}

export function buildRepositorySourceUrl(
  repositoryUrl: string | null,
  directory: string | null,
  lifecycle: NpmPackageCatalogRow["lifecycle"],
): string | null {
  if (!repositoryUrl || !directory || lifecycle !== "published") return null;
  return `${repositoryUrl}/tree/main/${directory
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

async function listExactScopeNames(fetcher: FetchLike): Promise<string[]> {
  const names = new Set<string>();
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const url = new URL(NPM_SEARCH_URL);
    url.searchParams.set("text", "scope:ai-matrx");
    url.searchParams.set("size", String(SEARCH_PAGE_SIZE));
    url.searchParams.set("from", String(offset));
    const response = requireOk(
      await fetcher(url, { cache: "no-store" }),
      "npm package search",
    );
    const body = (await response.json()) as NpmSearchResponse;
    const objects = Array.isArray(body.objects) ? body.objects : [];
    if (
      typeof body.total !== "number" ||
      !Number.isInteger(body.total) ||
      body.total < 0
    ) {
      throw new Error("npm package search returned an invalid total");
    }
    total = body.total;

    for (const result of objects) {
      const name = result.package?.name;
      if (name?.startsWith(PACKAGE_SCOPE)) names.add(name);
    }

    if (objects.length === 0 && offset < total) {
      throw new Error(
        `npm package search ended early at ${offset} of ${total} results`,
      );
    }
    if (objects.length === 0) break;
    offset += objects.length;
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

async function loadPackage(
  name: string,
  fetcher: FetchLike,
): Promise<NpmPackageCatalogRow> {
  const response = requireOk(
    await fetcher(`${NPM_REGISTRY_URL}/${encodeURIComponent(name)}`, {
      cache: "no-store",
    }),
    `npm metadata for ${name}`,
  );
  const packument = (await response.json()) as NpmPackument;
  const version = packument["dist-tags"]?.latest;
  if (!version) throw new Error(`npm metadata for ${name} has no latest version`);
  const release = packument.versions?.[version];
  if (!release) throw new Error(`npm metadata for ${name}@${version} is missing`);

  const repository = release.repository;
  const repositoryUrl = normalizeRepositoryUrl(
    typeof repository === "string" ? repository : repository?.url,
  );
  const repositoryDirectory =
    typeof repository === "object" && repository?.directory
      ? repository.directory
      : null;
  const lifecycle = version === "0.0.0" ? "reserved" : "published";
  const deprecationMessage = release.deprecated?.trim() || null;

  return {
    name,
    version,
    lifecycle,
    deprecated: deprecationMessage !== null,
    deprecationMessage,
    publishedAt: packument.time?.[version] ?? null,
    npmUrl: `https://www.npmjs.com/package/${name}`,
    repositoryUrl,
    repositoryDirectory,
    sourceUrl: buildRepositorySourceUrl(
      repositoryUrl,
      repositoryDirectory,
      lifecycle,
    ),
  };
}

export async function loadNpmPackageCatalog(
  fetcher: FetchLike = fetch,
): Promise<NpmPackageCatalogRow[]> {
  const names = await listExactScopeNames(fetcher);
  return Promise.all(names.map((name) => loadPackage(name, fetcher)));
}
