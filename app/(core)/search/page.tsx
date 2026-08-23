// app/(core)/search/page.tsx
//
// Matrx Search — the platform's public search engine.
//
// The engine is the Search Kinds pipeline: a real provider search on aidream,
// translated into the provider-neutral `web_search_results` kind family, and
// rendered ENTIRELY through the registered kind components. That rendering is
// reused verbatim from the Stage B proof at /demos/search-kinds — this route
// adds the search box, the URL contract, and the shell chrome around it.
//
// `?q=` is the state. The server reads it here so the first paint already
// knows what is being searched, the compact header box shows the live query,
// and back/forward replay searches with no client bookkeeping.
//
// Guests never reach this file — the layout serves them the landing instead.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { SearchBox } from "@/features/search/components/SearchBox";
import { SearchWorkspace } from "@/features/search/components/SearchWorkspace";
import { readSearchQuery, SEARCH_QUERY_PARAM } from "@/features/search/search-url";

export default async function SearchRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = readSearchQuery(params[SEARCH_QUERY_PARAM]);

  return (
    <>
      {/* The box is the route's identity once a search is on screen. On the
          empty state the hero box below IS the page, so the header stays out
          of its way. Mobile carries its own box inside the workspace — the
          header center has no room for one. */}
      {query ? (
        <PageHeader
          desktop={
            <SearchBox
              currentQuery={query}
              variant="compact"
              className="matrx-glass-thin-border rounded-full px-1.5 py-1"
            />
          }
          mobile={
            <span className="text-sm font-medium text-foreground">Search</span>
          }
        />
      ) : (
        <PageHeader>
          <span className="text-sm font-medium text-foreground">Search</span>
        </PageHeader>
      )}
      <SearchWorkspace query={query} />
    </>
  );
}
