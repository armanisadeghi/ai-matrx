import type { PageRequest } from "./types";

/** Only for RPCs using hr._time_page; punch/grid reads use limit/offset instead. */
export function toTimePage(page: PageRequest): {
  page: number;
  pageSize: number;
} {
  return { page: page.page, pageSize: page.pageSize };
}
