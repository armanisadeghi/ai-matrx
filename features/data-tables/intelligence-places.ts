// features/data-tables/intelligence-places.ts
//
// WHERE EACH DATA TABLES JOB RUNS — drawn on /intelligence/data.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const DATA_PLACES: FeaturePlaces = {
  feature: "data",
  label: "Data tables",
  roots: ["features/data-tables", "components/user-generated-table-data", "app/(core)/data"],
  places: [
    {
      // ONE table page (lane CHAIR-ONE-GRID): /data/<table> and every host that mounts it.
      id: "table",
      label: "A table",
      trigger: "Row actions, page assistant",
      urlPattern: "/data/[tableId]",
      mandateKeys: [K.data__row_action, K.data__page_guidance],
      sources: [
        "features/data-tables/records-ui-host/recordsUiHost.tsx",
      ],
    },
    {
      id: "formula",
      label: "Column formula editor",
      trigger: "Help with this… in the formula box",
      urlPattern: "/data/[tableId]",
      mandateKeys: [K.data__formula_writing],
      // records-ui's formula box offers help through its `formulaHelp` port; this app binds it.
      sources: ["features/data-tables/records-ui-host/recordsAgentPorts.tsx"],
    },
  ],
};
