"use client";

// features/unified-data/page-seed/clientTableSeed.ts — lane SSR-ROWS-3
//
// THE BROWSER'S OWN FIRST READS, ASKED THE MOMENT THE PAGE HYDRATES — never after the server's
// boundary. The same doors with the same arguments the server asks (`where_id_opens`, then
// `askTablePageSeed`: the table's bundle and the grid's predicted first page), recorded as the SAME
// seed shape, so the page is drawn from whichever lands first. A server seed that lands in time is
// drawn from the server's HTML; a slow or missing one costs nothing, because these reads started at
// hydration instead of at the server's cap.

import { askTablePageSeed } from "@ai-matrx/records-ui/first-page";
import type { RecordsDataSource } from "@ai-matrx/records";

import { ensureObjectOrganization } from "@/features/unified-data/objectOrganization";
import type { TablePageSeed } from "./tablePageSeed.server";

/**
 * Ask the table page's first reads from the browser, as the signed-in person. Never rejects: null
 * when the table does not open here or a read failed — the page then asks for itself, as always.
 * `rows`: the address opens the plain table, so the grid's first page is asked too.
 */
export async function askClientTableSeed(
  dataSource: Pick<RecordsDataSource, "rpc">,
  tableId: string,
  options: { userId?: string | null; rows?: boolean } = {},
): Promise<TablePageSeed | null> {
  try {
    // The kept answer for this table (`useObjectOrganization` waits on the same one, so the page
    // never asks it again); a fresh one from earlier in the session answers without a read.
    const where = await ensureObjectOrganization(dataSource, tableId);
    if (!where || where.state !== "found") return null;
    const records = await askTablePageSeed({
      dataSource,
      organizationId: where.organizationId,
      tableId,
      actor: options.userId ? { actor: "user", user_id: options.userId } : { actor: "user" },
      rows: options.rows !== false,
    });
    const bundle = records.answers.find((a) => a.door === "table_page_bundle");
    return {
      tableId,
      where: {
        data: {
          kind: where.kind,
          organization_id: where.organizationId,
          path: where.path,
          live: where.live,
          resolved_id: where.resolvedId,
        },
        error: null,
      },
      organizationId: where.organizationId,
      bundle: bundle ? { data: bundle.data, error: null } : null,
      records,
    };
  } catch (thrown: unknown) {
    console.warn(`[page-seed] the browser could not ask table ${tableId}'s first reads; the page asks for itself.`, thrown);
    return null;
  }
}
