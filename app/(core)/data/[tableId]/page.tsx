// app/(core)/data/[tableId]/page.tsx — THE MOUNT, AND NOTHING MORE. The screen itself is
// `UnifiedDataTablePage` (features/unified-data/table-page), which every other mount imports.
//
// A server component only to START the page's first reads as the signed-in person while the
// browser is still loading the app (lane PAGE-BUNDLE-2, `features/unified-data/page-seed`). The
// promise is not awaited here. The page races it against the browser's own first reads, asked at
// hydration (lane SSR-ROWS-3): a server seed that lands first draws the rows in the server's HTML;
// otherwise the browser's own answer draws them, and nothing waited for the server.

import { PrimedTablePage } from "@/features/unified-data/page-seed/PrimedTablePages";
import { addressAsksThePlainOpening, readTablePage } from "@/features/unified-data/page-seed/tablePageSeed.server";

export default async function UnifiedDataTableRoute({
  params,
  searchParams,
}: {
  params: Promise<{ tableId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ tableId }, address] = await Promise.all([params, searchParams ?? Promise.resolve<Record<string, string | string[] | undefined>>({})]);
  // Lane SSR-ROWS: the grid's first page is asked too when the address opens the plain table and the
  // person's knob `data/server_rows` is on, so the rows are in the HTML the server sends. Development
  // only: `?server_rows=1` turns it on for this one request; production never reads it.
  const rows = addressAsksThePlainOpening(address);
  const reads = readTablePage(tableId, null, {
    rows,
    forceOn: process.env.NODE_ENV !== "production" && address["server_rows"] === "1",
  });
  return <PrimedTablePage tableId={tableId} gate={reads.gate} seed={reads.seed} opening={reads.opening} rows={rows} />;
}
