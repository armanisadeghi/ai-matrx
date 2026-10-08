// app/(core)/data/[tableId]/page.tsx — THE MOUNT, AND NOTHING MORE. The screen itself is
// `UnifiedDataTablePage` (features/unified-data/table-page), which every other mount imports.
//
// A server component only to START the page's first reads as the signed-in person while the
// browser is still loading the app (lane PAGE-BUNDLE-2, `features/unified-data/page-seed`). The
// promise is not awaited here: the page waits for it (lane SSR-ROWS) and is drawn — rows included —
// from it in the server's HTML; the browser hydrates onto that and asks nothing it was already told.

import { PrimedTablePage } from "@/features/unified-data/page-seed/PrimedTablePages";
import { addressAsksThePlainOpening, readTablePageSeed, serverRowsOn } from "@/features/unified-data/page-seed/tablePageSeed.server";

export default async function UnifiedDataTableRoute({
  params,
  searchParams,
}: {
  params: Promise<{ tableId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ tableId }, address, knobOn] = await Promise.all([params, searchParams ?? Promise.resolve<Record<string, string | string[] | undefined>>({}), serverRowsOn()]);
  // Development only: `?server_rows=1` turns server rows on for this one request, so the path can be
  // proven on a dev host before the live knob is flipped. Never read in production.
  const serverRows = knobOn || (process.env.NODE_ENV !== "production" && address["server_rows"] === "1");
  // Lane SSR-ROWS: the grid's first page is asked too when the address opens the plain table, so the
  // rows are in the HTML the server sends — only while the knob `data/server_rows` is on.
  return (
    <PrimedTablePage
      tableId={tableId}
      serverRows={serverRows}
      seed={readTablePageSeed(tableId, null, { rows: serverRows && addressAsksThePlainOpening(address) })}
    />
  );
}
