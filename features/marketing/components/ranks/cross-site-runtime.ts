import type { EntityListController } from "@/lib/entity-list/config";
import type { CrossSiteRankRow } from "./cross-site-data";

type RuntimeSnapshot = Pick<
  EntityListController<CrossSiteRankRow>,
  "rows" | "total" | "query" | "error"
>;

let snapshot: RuntimeSnapshot = {
  rows: [],
  total: 0,
  query: {
    scope: { kind: "mine" },
    search: "",
    deep: false,
    archived: "active",
    filters: {},
    page: 1,
  },
  error: null,
};

export function setCrossSiteRankRuntime(next: RuntimeSnapshot): void {
  snapshot = next;
}

export function getCrossSiteRankRuntime(): RuntimeSnapshot {
  return snapshot;
}
