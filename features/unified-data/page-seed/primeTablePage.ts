"use client";

// features/unified-data/page-seed/primeTablePage.ts — lane PAGE-BUNDLE-2
//
// THE BROWSER HALF OF `tablePageSeed.server.ts`: the server's answers go into the SAME stores the
// page's own reads fill, so the page asks nothing it was already told.
//
//  - `custom.where_id_opens` → the kept object-organization answer (`primeObjectOrganization`),
//    as an in-flight question: the page's `useObjectOrganization` waits on it instead of asking.
//  - `custom.table_page_bundle` → `primeTablePageBundle` (@ai-matrx/records/core): the records
//    client opening the table uses it instead of asking. Primed BEFORE the organization answer
//    resolves, so the client that the answer mounts always finds it.
//
// A null seed (the server could not ask, or was slow) asks the door from here, exactly as before.
// Runs in the browser only: these stores are module state, and on the server they would be shared
// across every request.

import { primeRecordPageBundle, primeTablePageBundle } from "@ai-matrx/records/core";
import type { RecordsDataSource } from "@ai-matrx/records";
import {
  primeObjectOrganization,
  readObjectOrganizationAnswer,
  resolveObjectOrganization,
} from "@/features/unified-data/objectOrganization";
import type { TablePageSeed } from "./tablePageSeed.server";

const primedSeeds = new WeakSet<Promise<TablePageSeed | null>>();

export function primeTablePage(
  tableId: string,
  seed: Promise<TablePageSeed | null>,
  dataSource: Pick<RecordsDataSource, "rpc">,
): void {
  if (typeof window === "undefined" || primedSeeds.has(seed)) return;
  primedSeeds.add(seed);
  // `seed` is React's streamed thenable, not a Promise: adopt it, so `.then` chains as a Promise's.
  primeObjectOrganization(
    tableId,
    Promise.resolve(seed).then(
      (s) => {
        if (!s || s.tableId !== tableId) {
          console.warn(`[page-seed] the server did not seed table ${tableId}; the browser asks for itself.`);
          return resolveObjectOrganization(dataSource, tableId);
        }
        if (s.organizationId && s.bundle) {
          primeTablePageBundle({ organizationId: s.organizationId, tableId, answer: s.bundle });
        }
        if (s.organizationId && s.recordId && s.recordBundle) {
          primeRecordPageBundle({ organizationId: s.organizationId, recordId: s.recordId, answer: s.recordBundle });
        }
        return readObjectOrganizationAnswer(s.where, tableId);
      },
      () => resolveObjectOrganization(dataSource, tableId),
    ),
  );
}
